/**
 * Call Manager Service
 *
 * Manages call lifecycle (initiate → ring → connect → end) with Redis state
 * and PostgreSQL persistence. Handles timeouts, busy detection, and cleanup.
 */

import prisma from '../db/client';
import { redis, isRedisAvailable } from '../db/redis';
import { config } from '../config';

type CallType = 'audio' | 'video';
type CallStatus =
  | 'initiated'
  | 'ringing'
  | 'connecting'
  | 'connected'
  | 'ended'
  | 'missed'
  | 'declined'
  | 'failed';
type CallAction = 'answered' | 'declined' | 'missed' | 'ended';
type CallEndReason =
  | 'normal'
  | 'timeout'
  | 'declined'
  | 'busy'
  | 'network_failure'
  | 'permission_denied'
  | 'error';

// ── Redis key helpers ──

const CALL_KEY = (callId: string) => `call:${callId}`;
const USER_CALL_KEY = (userId: string) => `user:call:${userId}`;
const CALL_TTL = 3600; // 1 hour max call
const RING_TTL = 35; // slightly more than ring timeout

export interface CallState {
  callId: string;
  callType: CallType;
  status: CallStatus;
  initiatorId: string;
  recipientId: string;
  conversationId: string;
  createdAt: number;
  startedAt?: number;
  offer?: string;
}

export interface CallResult {
  success: boolean;
  error?: string;
  code?: string;
  callId?: string;
  call?: CallState;
}

/**
 * Store call state in Redis for fast access during signaling.
 */
async function setCallState(callId: string, state: CallState, ttl = CALL_TTL): Promise<void> {
  if (!isRedisAvailable()) return;
  await redis.setEx(CALL_KEY(callId), ttl, JSON.stringify(state));
}

/**
 * Get call state from Redis.
 */
export async function getCallState(callId: string): Promise<CallState | null> {
  if (!isRedisAvailable()) return null;
  const data = await redis.get(CALL_KEY(callId));
  return data ? JSON.parse(data) : null;
}

/**
 * Delete call state from Redis.
 */
async function deleteCallState(callId: string): Promise<void> {
  if (!isRedisAvailable()) return;
  await redis.del(CALL_KEY(callId));
}

/**
 * Mark a user as being in a call.
 */
async function setUserInCall(userId: string, callId: string, ttl = CALL_TTL): Promise<void> {
  if (!isRedisAvailable()) return;
  await redis.setEx(USER_CALL_KEY(userId), ttl, callId);
}

/**
 * Check if user is currently in a call. Returns callId or null.
 */
export async function getUserActiveCall(userId: string): Promise<string | null> {
  if (!isRedisAvailable()) return null;
  return await redis.get(USER_CALL_KEY(userId));
}

/**
 * Remove user from call tracking.
 */
async function clearUserCall(userId: string): Promise<void> {
  if (!isRedisAvailable()) return;
  await redis.del(USER_CALL_KEY(userId));
}

/**
 * Initiate a new call. Creates DB record and Redis state.
 */
export async function initiateCall(
  initiatorId: string,
  recipientId: string,
  conversationId: string,
  callType: CallType,
  offer: string
): Promise<CallResult> {
  // 1. Check initiator not already in a call
  const existingCallId = await getUserActiveCall(initiatorId);
  if (existingCallId) {
    return { success: false, error: 'You are already in a call', code: 'ALREADY_IN_CALL' };
  }

  // 2. Check recipient not already in a call
  const recipientCallId = await getUserActiveCall(recipientId);
  if (recipientCallId) {
    return { success: false, error: 'User is on another call', code: 'USER_BUSY' };
  }

  // 3. Check recipient exists
  const recipient = await prisma.user.findUnique({
    where: { id: recipientId },
    select: { id: true },
  });
  if (!recipient) {
    return { success: false, error: 'User not found', code: 'USER_NOT_FOUND' };
  }

  // 4. Verify conversation exists and both users are participants
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      participants: {
        every: {
          user_id: { in: [initiatorId, recipientId] },
        },
      },
    },
    select: { id: true },
  });
  if (!conversation) {
    return { success: false, error: 'Conversation not found', code: 'CONVERSATION_NOT_FOUND' };
  }

  // 5. Create call record in DB
  const call = await prisma.call.create({
    data: {
      call_type: callType,
      status: 'ringing',
      initiator_id: initiatorId,
      conversation_id: conversationId,
      participants: {
        create: [
          { user_id: initiatorId, action: 'ended' as CallAction },
          { user_id: recipientId, action: 'missed' as CallAction },
        ],
      },
    } as any,
  });

  // 6. Store in Redis
  const callState: CallState = {
    callId: call.id,
    callType,
    status: 'ringing',
    initiatorId,
    recipientId,
    conversationId,
    createdAt: Date.now(),
    offer,
  };
  await setCallState(call.id, callState, RING_TTL);
  await setUserInCall(initiatorId, call.id, RING_TTL);
  await setUserInCall(recipientId, call.id, RING_TTL);

  return { success: true, callId: call.id, call: callState };
}

/**
 * Answer a call. Updates DB and Redis.
 */
export async function answerCall(callId: string, userId: string): Promise<CallResult> {
  const state = await getCallState(callId);
  if (!state) {
    return { success: false, error: 'Call not found or expired', code: 'CALL_NOT_FOUND' };
  }

  if (state.recipientId !== userId) {
    return { success: false, error: 'Not authorized to answer this call', code: 'UNAUTHORIZED' };
  }

  if (state.status !== 'ringing') {
    return { success: false, error: 'Call is not in ringing state', code: 'INVALID_STATE' };
  }

  // Update state
  state.status = 'connecting';
  state.startedAt = Date.now();
  await setCallState(callId, state, CALL_TTL);
  await setUserInCall(state.initiatorId, callId, CALL_TTL);
  await setUserInCall(state.recipientId, callId, CALL_TTL);

  // Update DB
  await prisma.$transaction([
    prisma.call.update({
      where: { id: callId },
      data: { status: 'connecting' } as any,
    }),
    prisma.callParticipant.update({
      where: { call_id_user_id: { call_id: callId, user_id: userId } },
      data: { action: 'answered' as CallAction, answered_at: new Date() } as any,
    }),
  ]);

  return { success: true, callId, call: state };
}

/**
 * Mark call as connected (ICE completed).
 */
export async function markCallConnected(callId: string): Promise<void> {
  const state = await getCallState(callId);
  if (!state) return;

  state.status = 'connected';
  state.startedAt = state.startedAt || Date.now();
  await setCallState(callId, state, CALL_TTL);

  await prisma.call.update({
    where: { id: callId },
    data: { status: 'connected', started_at: new Date(state.startedAt) } as any,
  });
}

/**
 * End a call. Calculates duration, cleans up Redis, updates DB.
 */
export async function endCall(
  callId: string,
  userId: string,
  reason: CallEndReason = 'normal',
  qualityMetrics?: {
    avgLatencyMs?: number;
    maxLatencyMs?: number;
    packetLossPct?: number;
    avgBitrateKbps?: number;
  }
): Promise<CallResult> {
  const state = await getCallState(callId);

  // Even if Redis state is gone, try to end in DB
  const now = new Date();
  let durationSeconds: number | null = null;

  if (state?.startedAt) {
    durationSeconds = Math.round((Date.now() - state.startedAt) / 1000);
  }

  // Determine final status
  let finalStatus: CallStatus = 'ended';
  if (reason === 'timeout') finalStatus = 'missed';
  else if (reason === 'declined') finalStatus = 'declined';
  else if (reason === 'network_failure' || reason === 'error') finalStatus = 'failed';

  try {
    await prisma.call.update({
      where: { id: callId },
      data: {
        status: finalStatus,
        ended_at: now,
        duration_seconds: durationSeconds,
        end_reason: reason,
        ...(qualityMetrics
          ? {
              avg_latency_ms: qualityMetrics.avgLatencyMs,
              max_latency_ms: qualityMetrics.maxLatencyMs,
              packet_loss_pct: qualityMetrics.packetLossPct,
              avg_bitrate_kbps: qualityMetrics.avgBitrateKbps,
            }
          : {}),
      } as any,
    });

    // Update participant who ended the call
    await prisma.callParticipant
      .update({
        where: { call_id_user_id: { call_id: callId, user_id: userId } },
        data: { left_at: now, action: 'ended' as CallAction } as any,
      })
      .catch(() => {}); // May not exist if not a participant
  } catch (e) {
    // Call may already be ended
  }

  // Clean up Redis
  if (state) {
    await clearUserCall(state.initiatorId);
    await clearUserCall(state.recipientId);
    await deleteCallState(callId);
  } else {
    // Fallback: try to clear user's call
    await clearUserCall(userId);
  }

  return { success: true, callId, call: state || undefined };
}

/**
 * Decline a call.
 */
export async function declineCall(callId: string, userId: string): Promise<CallResult> {
  const state = await getCallState(callId);
  if (!state) {
    return { success: false, error: 'Call not found or expired', code: 'CALL_NOT_FOUND' };
  }

  if (state.recipientId !== userId) {
    return { success: false, error: 'Not authorized', code: 'UNAUTHORIZED' };
  }

  // Update DB
  await prisma.$transaction([
    prisma.call.update({
      where: { id: callId },
      data: { status: 'declined', ended_at: new Date(), end_reason: 'declined' } as any,
    }),
    prisma.callParticipant.update({
      where: { call_id_user_id: { call_id: callId, user_id: userId } },
      data: { action: 'declined' as CallAction, left_at: new Date() } as any,
    }),
  ]);

  // Clean up Redis
  await clearUserCall(state.initiatorId);
  await clearUserCall(state.recipientId);
  await deleteCallState(callId);

  return { success: true, callId, call: state };
}

/**
 * Handle call timeout (no answer). Called by 30s timer.
 */
export async function timeoutCall(callId: string): Promise<CallResult> {
  const state = await getCallState(callId);
  if (!state) {
    return { success: false, error: 'Call already ended', code: 'CALL_NOT_FOUND' };
  }

  if (state.status !== 'ringing') {
    return { success: false, error: 'Call is no longer ringing', code: 'INVALID_STATE' };
  }

  // Update DB
  await prisma.call.update({
    where: { id: callId },
    data: { status: 'missed', ended_at: new Date(), end_reason: 'timeout' } as any,
  });

  // Clean up Redis
  await clearUserCall(state.initiatorId);
  await clearUserCall(state.recipientId);
  await deleteCallState(callId);

  return { success: true, callId, call: state };
}

/**
 * Extend heartbeat for an active call. Keeps Redis keys alive.
 */
export async function heartbeatCall(callId: string, userId: string): Promise<void> {
  if (!isRedisAvailable()) return;

  // Extend TTLs
  await redis.expire(CALL_KEY(callId), CALL_TTL);
  await redis.expire(USER_CALL_KEY(userId), CALL_TTL);
}

/**
 * Get call history for a user.
 */
export async function getCallHistory(
  userId: string,
  limit = 50,
  cursor?: string
) {
  const where: any = {
    participants: { some: { user_id: userId } },
  };
  if (cursor) {
    where.created_at = { lt: new Date(cursor) };
  }

  const calls = await prisma.call.findMany({
    where,
    orderBy: { created_at: 'desc' },
    take: limit,
    include: {
      initiator: {
        select: {
          id: true,
          username: true,
          profile: { select: { display_name: true, avatar_url: true } },
        },
      },
      participants: {
        include: {
          user: {
            select: {
              id: true,
              username: true,
              profile: { select: { display_name: true, avatar_url: true } },
            },
          },
        },
      },
      conversation: {
        select: { id: true, type: true },
      },
    },
  });

  return calls.map((call) => {
    const isInitiator = call.initiator_id === userId;
    const otherParticipant = call.participants.find((p) => p.user_id !== userId);
    const otherUser = otherParticipant?.user;

    let direction: 'incoming' | 'outgoing' = isInitiator ? 'outgoing' : 'incoming';
    let callStatus: 'answered' | 'missed' | 'declined' = 'answered';
    const rawStatus = String(call.status);
    if (rawStatus === 'missed') callStatus = 'missed';
    else if (rawStatus === 'declined') callStatus = 'declined';
    else if (rawStatus === 'failed') callStatus = 'missed';

    return {
      id: call.id,
      call_type: call.call_type,
      status: callStatus,
      direction,
      duration_seconds: call.duration_seconds,
      created_at: call.created_at.toISOString(),
      started_at: call.started_at?.toISOString(),
      ended_at: call.ended_at?.toISOString(),
      conversation_id: call.conversation_id,
      other_user: otherUser
        ? {
            id: otherUser.id,
            username: otherUser.username,
            display_name: otherUser.profile?.display_name,
            avatar_url: otherUser.profile?.avatar_url,
          }
        : null,
    };
  });
}

/**
 * Get TURN/STUN server credentials.
 */
export function getIceServers() {
  const servers: RTCIceServer[] = [];

  // STUN servers
  if (config.stun.urls.length > 0) {
    servers.push({
      urls: config.stun.urls.map((u: string) => u.trim()).filter(Boolean),
    });
  }

  // TURN servers
  if (config.turn.urls) {
    const turnUrls = config.turn.urls.split(',').map((u: string) => u.trim()).filter(Boolean);
    if (turnUrls.length > 0) {
      servers.push({
        urls: turnUrls,
        username: config.turn.username,
        credential: config.turn.credential,
      });
    }
  }

  // Fallback STUN if nothing configured
  if (servers.length === 0) {
    servers.push({ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] });
  }

  return servers;
}

// Type needed for getIceServers return
interface RTCIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}
