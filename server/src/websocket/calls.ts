/**
 * WebSocket Call Signaling Handlers
 *
 * Real-time signaling for WebRTC calls: offer/answer exchange,
 * ICE candidate forwarding, call lifecycle events, heartbeat,
 * and renegotiation for mid-call media changes.
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import {
  initiateCall,
  answerCall,
  declineCall,
  endCall,
  timeoutCall,
  markCallConnected,
  heartbeatCall,
  getCallState,
  getUserActiveCall,
  getIceServers,
} from '../services/callManager';
import { config } from '../config';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  deviceId?: string;
}

// Active call ring timers: callId → timeout handle
const ringTimers = new Map<string, NodeJS.Timeout>();

/**
 * Register all call-related socket event handlers.
 */
export function registerCallHandlers(
  io: SocketIOServer,
  socket: AuthenticatedSocket
) {
  const userId = socket.userId!;

  // ── INITIATE CALL ──
  socket.on('call:initiate', async (data) => {
    try {
      const { recipientId, conversationId, callType, offer } = data;

      // Input validation
      if (!recipientId || !conversationId || !callType || !offer) {
        return socket.emit('call:error', {
          code: 'INVALID_PARAMS',
          message: 'Missing required parameters',
        });
      }
      if (!['audio', 'video'].includes(callType)) {
        return socket.emit('call:error', {
          code: 'INVALID_PARAMS',
          message: 'callType must be "audio" or "video"',
        });
      }

      const result = await initiateCall(userId, recipientId, conversationId, callType, offer);

      if (!result.success) {
        return socket.emit('call:error', {
          code: result.code,
          message: result.error,
        });
      }

      const callId = result.callId!;
      const iceServers = getIceServers();

      // Confirm to caller
      socket.emit('call:initiated', {
        callId,
        callType,
        recipientId,
        conversationId,
        iceServers,
      });

      // Send incoming call to ALL of recipient's devices
      io.to(`user:${recipientId}`).emit('call:incoming', {
        callId,
        callType,
        callerId: userId,
        callerName: await getCallerName(userId),
        conversationId,
        offer,
        iceServers,
      });

      // Start 30s ring timeout
      const timer = setTimeout(async () => {
        ringTimers.delete(callId);
        const timeoutResult = await timeoutCall(callId);
        if (timeoutResult.success) {
          io.to(`user:${userId}`).emit('call:ended', {
            callId,
            reason: 'timeout',
            message: 'No answer',
          });
          io.to(`user:${recipientId}`).emit('call:ended', {
            callId,
            reason: 'timeout',
            message: 'Missed call',
          });
        }
      }, config.call.ringTimeoutMs);

      ringTimers.set(callId, timer);
    } catch (error) {
      console.error('call:initiate error:', error);
      socket.emit('call:error', {
        code: 'SERVER_ERROR',
        message: 'Failed to initiate call',
      });
    }
  });

  // ── ANSWER CALL ──
  socket.on('call:answer', async (data) => {
    try {
      const { callId, answer } = data;
      if (!callId || !answer) {
        return socket.emit('call:error', {
          code: 'INVALID_PARAMS',
          message: 'Missing callId or answer',
        });
      }

      const result = await answerCall(callId, userId);
      if (!result.success) {
        return socket.emit('call:error', {
          code: result.code,
          message: result.error,
        });
      }

      // Cancel ring timer
      const timer = ringTimers.get(callId);
      if (timer) {
        clearTimeout(timer);
        ringTimers.delete(callId);
      }

      const state = result.call!;

      // Dismiss call on other devices of the answerer
      socket.broadcast.to(`user:${userId}`).emit('call:ended', {
        callId,
        reason: 'answered_elsewhere',
        message: 'Answered on another device',
      });

      // Send answer to caller
      io.to(`user:${state.initiatorId}`).emit('call:answered', {
        callId,
        answer,
        responderId: userId,
      });
    } catch (error) {
      console.error('call:answer error:', error);
      socket.emit('call:error', {
        code: 'SERVER_ERROR',
        message: 'Failed to answer call',
      });
    }
  });

  // ── DECLINE CALL ──
  socket.on('call:decline', async (data) => {
    try {
      const { callId } = data;
      if (!callId) return;

      const result = await declineCall(callId, userId);
      if (!result.success) return;

      // Cancel ring timer
      const timer = ringTimers.get(callId);
      if (timer) {
        clearTimeout(timer);
        ringTimers.delete(callId);
      }

      const state = result.call!;

      // Notify caller
      io.to(`user:${state.initiatorId}`).emit('call:declined', {
        callId,
        declinedBy: userId,
      });

      // Dismiss on other devices
      socket.broadcast.to(`user:${userId}`).emit('call:ended', {
        callId,
        reason: 'declined',
      });
    } catch (error) {
      console.error('call:decline error:', error);
    }
  });

  // ── ICE CANDIDATE ──
  socket.on('call:ice-candidate', async (data) => {
    try {
      const { callId, candidate, targetUserId } = data;
      if (!callId || !candidate || !targetUserId) return;

      // Forward candidate to target user
      io.to(`user:${targetUserId}`).emit('call:ice-candidate', {
        callId,
        candidate,
        fromUserId: userId,
      });
    } catch (error) {
      console.error('call:ice-candidate error:', error);
    }
  });

  // ── END CALL ──
  socket.on('call:end', async (data) => {
    try {
      const { callId, reason = 'normal', qualityMetrics } = data;
      if (!callId) return;

      const state = await getCallState(callId);

      // Cancel ring timer if exists
      const timer = ringTimers.get(callId);
      if (timer) {
        clearTimeout(timer);
        ringTimers.delete(callId);
      }

      const result = await endCall(callId, userId, reason, qualityMetrics);

      if (state) {
        // Notify the other party
        const otherUserId = state.initiatorId === userId ? state.recipientId : state.initiatorId;
        io.to(`user:${otherUserId}`).emit('call:ended', {
          callId,
          reason,
          endedBy: userId,
          durationSeconds: state.startedAt
            ? Math.round((Date.now() - state.startedAt) / 1000)
            : 0,
        });
      }
    } catch (error) {
      console.error('call:end error:', error);
    }
  });

  // ── RENEGOTIATE (mid-call media changes) ──
  socket.on('call:renegotiate', async (data) => {
    try {
      const { callId, offer, targetUserId } = data;
      if (!callId || !offer || !targetUserId) return;

      io.to(`user:${targetUserId}`).emit('call:renegotiate', {
        callId,
        offer,
        fromUserId: userId,
      });
    } catch (error) {
      console.error('call:renegotiate error:', error);
    }
  });

  socket.on('call:renegotiate-answer', async (data) => {
    try {
      const { callId, answer, targetUserId } = data;
      if (!callId || !answer || !targetUserId) return;

      io.to(`user:${targetUserId}`).emit('call:renegotiate-answer', {
        callId,
        answer,
        fromUserId: userId,
      });
    } catch (error) {
      console.error('call:renegotiate-answer error:', error);
    }
  });

  // ── MEDIA STATE CHANGE ──
  socket.on('call:media-state', async (data) => {
    try {
      const { callId, targetUserId, audio, video } = data;
      if (!callId || !targetUserId) return;

      io.to(`user:${targetUserId}`).emit('call:media-state', {
        callId,
        fromUserId: userId,
        audio,
        video,
      });
    } catch (error) {
      console.error('call:media-state error:', error);
    }
  });

  // ── CALL HEARTBEAT ──
  socket.on('call:heartbeat', async (data) => {
    try {
      const { callId } = data;
      if (!callId) return;
      await heartbeatCall(callId, userId);
    } catch (error) {
      // Heartbeat is best-effort
    }
  });

  // ── CALL CONNECTED (ICE success notification) ──
  socket.on('call:connected', async (data) => {
    try {
      const { callId } = data;
      if (!callId) return;
      await markCallConnected(callId);
    } catch (error) {
      console.error('call:connected error:', error);
    }
  });

  // ── Cleanup on disconnect ──
  socket.on('disconnect', async () => {
    try {
      const activeCallId = await getUserActiveCall(userId);
      if (activeCallId) {
        const state = await getCallState(activeCallId);
        if (state) {
          // Give 10s grace period for reconnection
          setTimeout(async () => {
            // Re-check if user reconnected
            const stillActive = await getUserActiveCall(userId);
            if (stillActive === activeCallId) {
              const currentState = await getCallState(activeCallId);
              if (currentState && currentState.status === 'connected') {
                // User didn't reconnect — end the call
                await endCall(activeCallId, userId, 'network_failure');
                const otherUserId = state.initiatorId === userId ? state.recipientId : state.initiatorId;
                io.to(`user:${otherUserId}`).emit('call:ended', {
                  callId: activeCallId,
                  reason: 'network_failure',
                  endedBy: userId,
                });
              }
            }
          }, 10000);
        }
      }
    } catch (error) {
      console.error('call disconnect cleanup error:', error);
    }
  });
}

/**
 * Get caller display name for incoming call notification.
 */
async function getCallerName(userId: string): Promise<string> {
  try {
    const { default: prisma } = await import('../db/client');
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        username: true,
        profile: { select: { display_name: true } },
      },
    });
    return user?.profile?.display_name || user?.username || 'Unknown';
  } catch {
    return 'Unknown';
  }
}
