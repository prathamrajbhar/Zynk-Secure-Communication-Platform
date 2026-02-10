import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import prisma from '../db/client';
import { redis } from '../db/redis';
import { CallType, CallStatus, MessageType, MessageStatus, ParticipantRole, Platform, ConversationType, Prisma } from '@prisma/client';
import { pushNewMessage, pushIncomingCall, pushMissedCall } from '../services/pushNotification';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  deviceId?: string;
}

// Maps for managing connections
const userSockets = new Map<string, Set<string>>(); // userId -> Set of socketIds
const socketUsers = new Map<string, string>(); // socketId -> userId

// ========== Active Call State Management ==========
const userActiveCalls = new Map<string, string>(); // userId -> callId (one active call per user)
const callParticipantMap = new Map<string, Set<string>>(); // callId -> Set<userId>
const callRingTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

function clearCallRingTimeout(callId: string) {
  const t = callRingTimeouts.get(callId);
  if (t) { clearTimeout(t); callRingTimeouts.delete(callId); }
}

function cleanupCallTracking(callId: string) {
  const participants = callParticipantMap.get(callId);
  if (participants) {
    for (const uid of participants) {
      if (userActiveCalls.get(uid) === callId) {
        userActiveCalls.delete(uid);
      }
    }
    callParticipantMap.delete(callId);
  }
  clearCallRingTimeout(callId);
}

async function endCallWithStatus(
  callId: string,
  status: CallStatus,
  io: SocketIOServer,
  endedBy?: string
) {
  try {
    clearCallRingTimeout(callId);

    const callData = await prisma.call.findUnique({
      where: { id: callId },
      select: { started_at: true, status: true }
    });

    // Don't re-end already terminated calls
    if (!callData || ['ended', 'missed', 'declined'].includes(callData.status)) {
      cleanupCallTracking(callId);
      return;
    }

    const duration = callData.started_at
      ? Math.floor((Date.now() - new Date(callData.started_at).getTime()) / 1000)
      : 0;

    await prisma.$transaction([
      prisma.call.update({
        where: { id: callId },
        data: {
          status,
          ended_at: new Date(),
          duration_seconds: duration
        }
      }),
      prisma.callParticipant.updateMany({
        where: { call_id: callId, left_at: null },
        data: { left_at: new Date() }
      })
    ]);

    // Notify all participants
    const participants = callParticipantMap.get(callId);
    if (participants) {
      for (const uid of participants) {
        io.to(`user:${uid}`).emit('call:ended', {
          call_id: callId,
          status,
          duration_seconds: duration,
          ended_by: endedBy || 'system'
        });
      }
    }

    cleanupCallTracking(callId);
  } catch (error) {
    console.error(`Failed to end call ${callId}:`, error);
    cleanupCallTracking(callId);
  }
}

function getIceServers(): object[] {
  const servers: object[] = config.stun.urls.map(url => ({ urls: url }));
  if (config.turn.urls) {
    const turnUrls = config.turn.urls.split(',').map(u => u.trim()).filter(Boolean);
    if (turnUrls.length > 0) {
      servers.push({
        urls: turnUrls,
        username: config.turn.username,
        credential: config.turn.credential,
      });
    }
  }
  return servers;
}

export function setupWebSocket(httpServer: HTTPServer) {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: config.cors.origin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // Authentication middleware with session validation
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token;
      // SECURITY: Only accept token from auth object, not from headers or query
      // to prevent token leakage in logs
      if (!token || typeof token !== 'string') {
        return next(new Error('Authentication required'));
      }

      const decoded = jwt.verify(token, config.jwt.secret) as { userId: string; deviceId: string };

      // SECURITY: Validate session exists in database (supports revocation)
      const session = await prisma.session.findFirst({
        where: {
          user_id: decoded.userId,
          device_id: decoded.deviceId,
          session_token: token,
          expires_at: { gt: new Date() },
        },
        select: { id: true }
      });

      if (!session) {
        return next(new Error('Session expired or revoked'));
      }

      socket.userId = decoded.userId;
      socket.deviceId = decoded.deviceId;
      next();
    } catch (error) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', async (socket: AuthenticatedSocket) => {
    const userId = socket.userId!;
    if (config.nodeEnv !== 'production') {
      console.log(`User connected: ${userId} (socket: ${socket.id})`);
    }

    // Track connection
    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId)!.add(socket.id);
    socketUsers.set(socket.id, userId);

    // Join user's personal room
    socket.join(`user:${userId}`);

    // Join all conversation rooms
    try {
      const participants = await prisma.conversationParticipant.findMany({
        where: { user_id: userId },
        select: { conversation_id: true }
      });
      for (const p of participants) {
        socket.join(`conversation:${p.conversation_id}`);
      }
    } catch (error) {
      console.error('Failed to join conversation rooms:', error);
    }

    // Set user as online in Redis
    try {
      await redis.hSet(`presence:${userId}`, {
        status: 'online',
        last_seen: Date.now().toString(),
        socket_id: socket.id,
      });
      await redis.expire(`presence:${userId}`, 300);
    } catch (error) { }

    // Broadcast online status
    socket.broadcast.emit('user:online', { user_id: userId });

    // Mark 'sent' messages from others in this user's conversations as 'delivered'
    // Limit catch-up to recent messages to avoid slow queries on reconnect
    try {
      const convParticipants = await prisma.conversationParticipant.findMany({
        where: { user_id: userId },
        select: { conversation_id: true }
      });
      const convIds = convParticipants.map(p => p.conversation_id);

      if (convIds.length > 0) {
        const undeliveredMessages = await prisma.messages.findMany({
          where: {
            conversation_id: { in: convIds },
            sender_id: { not: userId },
            status: 'sent' as MessageStatus,
            deletedFor: {
              none: { user_id: userId }
            },
            // Only catch up messages from the last 24 hours to keep the query fast
            created_at: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
          },
          select: { id: true, sender_id: true, conversation_id: true },
          take: 200 // Cap to prevent excessive updates on reconnect
        });

        if (undeliveredMessages.length > 0) {
          await prisma.messages.updateMany({
            where: { id: { in: undeliveredMessages.map(m => m.id) } },
            data: { status: 'delivered' as MessageStatus }
          });

          // Batch notify senders (deduplicate by sender to avoid spamming)
          const senderConvPairs = new Map<string, { message_id: string; conversation_id: string }[]>();
          for (const msg of undeliveredMessages) {
            if (!senderConvPairs.has(msg.sender_id)) senderConvPairs.set(msg.sender_id, []);
            senderConvPairs.get(msg.sender_id)!.push({ message_id: msg.id, conversation_id: msg.conversation_id });
          }
          for (const [senderId, msgs] of senderConvPairs) {
            for (const msg of msgs) {
              io.to(`user:${senderId}`).emit('message:status', {
                message_id: msg.message_id,
                conversation_id: msg.conversation_id,
                status: 'delivered'
              });
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to perform delivery catch-up:', error);
    }

    // ============== HEARTBEAT EVENTS ==============

    // Respond to ping with pong for connection health monitoring
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
    });

    // ============== MESSAGE EVENTS ==============

    // Send message — with input validation
    socket.on('message:send', async (data) => {
      try {
        const { conversation_id, recipient_id, encrypted_content, message_type = 'text', reply_to_id, temp_id } = data;

        // SECURITY: Validate inputs to prevent injection
        if (encrypted_content && typeof encrypted_content !== 'string') {
          return socket.emit('error', { message: 'Invalid message format' });
        }
        if (encrypted_content && encrypted_content.length > 65536) {
          return socket.emit('error', { message: 'Message too large' });
        }
        if (recipient_id && typeof recipient_id !== 'string') {
          return socket.emit('error', { message: 'Invalid recipient' });
        }
        if (!['text', 'image', 'file', 'audio', 'video'].includes(message_type)) {
          return socket.emit('error', { message: 'Invalid message type' });
        }

        let convId = conversation_id;

        // Create or find conversation for DM
        if (!convId && recipient_id) {
          const existing = await prisma.conversation.findFirst({
            where: {
              type: 'one_to_one',
              AND: [
                { participants: { some: { user_id: userId } } },
                { participants: { some: { user_id: recipient_id } } },
              ]
            },
            select: { id: true }
          });

          if (existing) {
            convId = existing.id;
          } else {
            const conv = await prisma.conversation.create({
              data: {
                type: 'one_to_one',
                participants: {
                  create: [
                    { user_id: userId, role: 'member' as ParticipantRole },
                    { user_id: recipient_id, role: 'member' as ParticipantRole }
                  ]
                }
              }
            });
            convId = conv.id;

            // Join both users to the conversation room
            socket.join(`conversation:${convId}`);

            // Notify recipient about new conversation if they are online
            const recipientSockets = userSockets.get(recipient_id);
            if (recipientSockets) {
              for (const sid of recipientSockets) {
                const recipientSocket = io.sockets.sockets.get(sid);
                if (recipientSocket) {
                  recipientSocket.join(`conversation:${convId}`);
                  // Signal to recipient to refetch conversations
                  recipientSocket.emit('conversation:created', { conversation_id: convId });
                }
              }
            }
          }
        }

        if (!convId) {
          return socket.emit('error', { message: 'conversation_id or recipient_id required' });
        }

        // Save message to database and update conversation in transaction
        const result = await prisma.$transaction(async (tx) => {
          const metadata: any = {};
          if (reply_to_id) metadata.reply_to_id = reply_to_id;
          if (temp_id) metadata.temp_id = temp_id;

          const message = await tx.messages.create({
            data: {
              conversation_id: convId,
              sender_id: userId,
              encrypted_content,
              message_type: message_type as MessageType,
              metadata: Object.keys(metadata).length > 0 ? metadata : Prisma.JsonNull,
              status: 'sent' as MessageStatus
            },
            include: {
              sender: {
                select: {
                  username: true,
                  profile: {
                    select: {
                      display_name: true,
                      avatar_url: true
                    }
                  }
                }
              }
            }
          });

          await tx.conversation.update({
            where: { id: convId },
            data: { updated_at: new Date() }
          });

          return message;
        });

        const fullMessage = {
          id: result.id,
          conversation_id: result.conversation_id,
          sender_id: result.sender_id,
          encrypted_content: result.encrypted_content,
          message_type: result.message_type,
          metadata: result.metadata,
          status: result.status,
          created_at: result.created_at,
          sender_username: result.sender.username,
          sender_display_name: result.sender.profile?.display_name,
          sender_avatar: result.sender.profile?.avatar_url,
          temp_id, // Include temp_id in broadcast for deduplication
        };

        // Broadcast to conversation room
        io.to(`conversation:${convId}`).emit('message:received', fullMessage);

        // Confirm to sender
        socket.emit('message:sent', {
          message_id: result.id,
          conversation_id: convId,
          status: 'sent',
          created_at: result.created_at,
          temp_id, // Return temp_id so client can mark optimistic message as sent
        });

        // Update message status to delivered for online recipients (optimized)
        const participants = await prisma.conversationParticipant.findMany({
          where: {
            conversation_id: convId,
            user_id: { not: userId }
          },
          select: { user_id: true }
        });

        // Check which participants are online
        const onlineParticipants = participants.filter(p => userSockets.has(p.user_id));
        const offlineParticipants = participants.filter(p => !userSockets.has(p.user_id));

        // If any participant is online, mark message as delivered (single DB update)
        if (onlineParticipants.length > 0) {
          await prisma.messages.update({
            where: { id: result.id },
            data: { status: 'delivered' as MessageStatus }
          });
          io.to(`user:${userId}`).emit('message:status', {
            message_id: result.id,
            status: 'delivered',
          });
        }

        // Send push notifications to offline users in parallel
        if (offlineParticipants.length > 0) {
          const senderName = result.sender.profile?.display_name || result.sender.username;
          await Promise.allSettled(
            offlineParticipants.map(p =>
              pushNewMessage(
                p.user_id,
                senderName,
                result.encrypted_content,
                convId,
                result.message_type
              )
            )
          );
        }
      } catch (error) {
        console.error('Message send error:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Mark all messages in a conversation as read (consolidated)
    socket.on('conversation:read', async (data) => {
      try {
        const { conversation_id } = data;
        if (!conversation_id || typeof conversation_id !== 'string') return;

        // Verify user is a participant before marking as read
        const participant = await prisma.conversationParticipant.findUnique({
          where: { conversation_id_user_id: { conversation_id, user_id: userId } }
        });
        if (!participant) return;

        // Use transaction for consistency
        await prisma.$transaction([
          // Mark all messages from others as read
          prisma.messages.updateMany({
            where: {
              conversation_id,
              sender_id: { not: userId },
              status: { not: 'read' as MessageStatus }
            },
            data: { status: 'read' as MessageStatus }
          }),
          // Update last_read_at for this user
          prisma.conversationParticipant.updateMany({
            where: { conversation_id, user_id: userId },
            data: { last_read_at: new Date() }
          })
        ]);

        // Notify other participants that their messages were read
        // In a more complex app, we'd only notify for the specific messages that changed
        // but for now, sending a broad notification is fine
        socket.to(`conversation:${conversation_id}`).emit('conversation:read_receipt', {
          conversation_id,
          read_by: userId,
          at: new Date()
        });
      } catch (error) {
        console.error('Conversation read error:', error);
      }
    });

    // Mark message as read (keeping for backward compatibility)
    socket.on('message:read', async (data) => {
      try {
        const { message_id, conversation_id } = data;

        await prisma.messages.update({
          where: { id: message_id },
          data: { status: 'read' as MessageStatus }
        });

        await prisma.conversationParticipant.updateMany({
          where: { conversation_id, user_id: userId },
          data: { last_read_at: new Date() }
        });

        // Notify sender
        const msg = await prisma.messages.findUnique({
          where: { id: message_id },
          select: { sender_id: true }
        });

        if (msg) {
          io.to(`user:${msg.sender_id}`).emit('message:status', {
            message_id,
            conversation_id,
            status: 'read',
            read_by: userId,
          });
        }
      } catch (error) {
        console.error('Message read error:', error);
      }
    });

    // Mark message as delivered
    socket.on('message:delivered', async (data) => {
      try {
        const { message_id, conversation_id } = data;

        const message = await prisma.messages.findUnique({
          where: { id: message_id },
          select: { status: true, sender_id: true }
        });

        if (message && message.status === 'sent') {
          await prisma.messages.update({
            where: { id: message_id },
            data: { status: 'delivered' as MessageStatus }
          });

          io.to(`user:${message.sender_id}`).emit('message:status', {
            message_id,
            conversation_id,
            status: 'delivered',
          });
        }
      } catch (error) {
        console.error('Message delivered error:', error);
      }
    });

    // Typing indicator
    socket.on('typing:start', (data) => {
      const { conversation_id } = data;
      socket.to(`conversation:${conversation_id}`).emit('typing:start', {
        conversation_id,
        user_id: userId,
      });
    });

    socket.on('typing:stop', (data) => {
      const { conversation_id } = data;
      socket.to(`conversation:${conversation_id}`).emit('typing:stop', {
        conversation_id,
        user_id: userId,
      });
    });

    // ============== GROUP E2EE SENDER KEY EVENTS ==============

    // Notify group members that a sender key has been distributed
    socket.on('group:sender-key-distributed', async (data) => {
      try {
        const { conversation_id, key_id } = data;
        if (!conversation_id) return;

        // Verify membership
        const participant = await prisma.conversationParticipant.findUnique({
          where: { conversation_id_user_id: { conversation_id, user_id: userId } },
        });
        if (!participant) return;

        // Notify other members to fetch the new sender key
        socket.to(`conversation:${conversation_id}`).emit('group:sender-key-available', {
          conversation_id,
          sender_id: userId,
          key_id,
        });
      } catch (error) {
        console.error('Sender key distribution notification error:', error);
      }
    });

    // Request key rotation (triggered after member add/remove)
    socket.on('group:request-key-rotation', async (data) => {
      try {
        const { conversation_id, reason } = data;
        if (!conversation_id) return;

        // Verify membership
        const participant = await prisma.conversationParticipant.findUnique({
          where: { conversation_id_user_id: { conversation_id, user_id: userId } },
        });
        if (!participant) return;

        // Broadcast rotation request to all members in the conversation
        io.to(`conversation:${conversation_id}`).emit('group:key-rotation-needed', {
          conversation_id,
          triggered_by: userId,
          reason, // 'member_added' | 'member_removed' | 'periodic'
        });
      } catch (error) {
        console.error('Key rotation request error:', error);
      }
    });

    // ============== CALL EVENTS (WebRTC Signaling) ==============

    socket.on('call:initiate', async (data) => {
      try {
        const { recipient_id, call_type, sdp_offer } = data;

        if (!recipient_id || !['audio', 'video'].includes(call_type)) {
          return socket.emit('call:error', { message: 'Invalid call parameters' });
        }

        // Check if caller is already in a call
        if (userActiveCalls.has(userId)) {
          return socket.emit('call:error', { message: 'You are already in a call' });
        }

        // Check if recipient is already in a call
        if (userActiveCalls.has(recipient_id)) {
          return socket.emit('call:error', { message: 'User is busy on another call', code: 'USER_BUSY' });
        }

        // Verify recipient exists
        const recipient = await prisma.user.findUnique({
          where: { id: recipient_id },
          select: { id: true }
        });
        if (!recipient) {
          return socket.emit('call:error', { message: 'User not found' });
        }

        const initiator = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            username: true,
            profile: { select: { display_name: true, avatar_url: true } }
          }
        });

        const callerUsername = initiator?.profile?.display_name || initiator?.username || 'Unknown User';

        // Find existing conversation for context
        const existingConv = await prisma.conversation.findFirst({
          where: {
            type: 'one_to_one',
            AND: [
              { participants: { some: { user_id: userId } } },
              { participants: { some: { user_id: recipient_id } } },
            ]
          },
          select: { id: true }
        });

        const call = await prisma.call.create({
          data: {
            initiator_id: userId,
            call_type: call_type as CallType,
            status: 'ringing' as CallStatus,
            conversation_id: existingConv?.id || null,
            participants: {
              create: [
                { user_id: userId, joined_at: new Date() },
                { user_id: recipient_id }
              ]
            }
          }
        });

        // Track active call for both participants
        userActiveCalls.set(userId, call.id);
        userActiveCalls.set(recipient_id, call.id);
        callParticipantMap.set(call.id, new Set([userId, recipient_id]));

        // Join call-specific room for signaling
        socket.join(`call:${call.id}`);

        // Check if recipient is online
        const recipientOnline = userSockets.has(recipient_id);

        // Send call offer to recipient
        io.to(`user:${recipient_id}`).emit('call:incoming', {
          call_id: call.id,
          caller_id: userId,
          caller_username: callerUsername,
          caller_avatar: initiator?.profile?.avatar_url || null,
          call_type,
          sdp_offer,
          ice_servers: getIceServers(),
        });

        // Push notification for incoming call if recipient is offline
        if (!recipientOnline) {
          pushIncomingCall(recipient_id, callerUsername, call_type, call.id)
            .catch(err => console.error('Call push notification failed:', err));
        }

        socket.emit('call:initiated', {
          call_id: call.id,
          status: 'ringing',
          recipient_online: recipientOnline,
          ice_servers: getIceServers(),
        });

        // Set ring timeout - auto-mark as missed if not answered
        const ringTimeout = setTimeout(async () => {
          const currentCall = await prisma.call.findUnique({
            where: { id: call.id },
            select: { status: true }
          });
          if (currentCall && currentCall.status === 'ringing') {
            await endCallWithStatus(call.id, 'missed' as CallStatus, io, 'timeout');
            // Push missed call notification
            pushMissedCall(recipient_id, callerUsername, call_type)
              .catch(err => console.error('Missed call push failed:', err));
          }
        }, config.call.ringTimeoutMs);

        callRingTimeouts.set(call.id, ringTimeout);
      } catch (error) {
        console.error('Call initiate error:', error);
        socket.emit('call:error', { message: 'Failed to initiate call' });
      }
    });

    socket.on('call:answer', async (data) => {
      try {
        const { call_id, sdp_answer } = data;

        clearCallRingTimeout(call_id);

        const call = await prisma.call.findUnique({
          where: { id: call_id },
          select: { initiator_id: true, status: true }
        });

        if (!call) {
          return socket.emit('call:error', { message: 'Call not found' });
        }

        // Only allow answering ringing calls
        if (call.status !== 'ringing') {
          return socket.emit('call:error', { message: 'Call is no longer available' });
        }

        await prisma.$transaction([
          prisma.call.update({
            where: { id: call_id },
            data: {
              status: 'in_progress' as CallStatus,
              started_at: new Date()
            }
          }),
          prisma.callParticipant.update({
            where: {
              call_id_user_id: {
                call_id,
                user_id: userId
              }
            },
            data: { joined_at: new Date() }
          })
        ]);

        // Join call room
        socket.join(`call:${call_id}`);

        // Store call start time in Redis for quick duration lookups
        try {
          await redis.hSet(`call:${call_id}`, {
            status: 'in_progress',
            started_at: Date.now().toString(),
            participants: JSON.stringify([call.initiator_id, userId]),
          });
          await redis.expire(`call:${call_id}`, config.call.maxDurationSecs);
        } catch (e) {
          console.error('Failed to store call state in Redis:', e);
        }

        io.to(`user:${call.initiator_id}`).emit('call:answered', {
          call_id,
          sdp_answer,
          answerer_id: userId,
        });
      } catch (error) {
        console.error('Call answer error:', error);
        socket.emit('call:error', { message: 'Failed to answer call' });
      }
    });

    socket.on('call:ice-candidate', (data) => {
      const { call_id, candidate, target_id } = data;
      if (!candidate || !target_id) return;
      io.to(`user:${target_id}`).emit('call:ice-candidate', {
        call_id,
        candidate,
        from_id: userId,
      });
    });

    // WebRTC renegotiation (e.g., screen share toggle, quality change)
    socket.on('call:renegotiate', async (data) => {
      const { call_id, sdp_offer, target_id } = data;
      if (!call_id || !sdp_offer || !target_id) return;
      io.to(`user:${target_id}`).emit('call:renegotiate', {
        call_id,
        sdp_offer,
        from_id: userId,
      });
    });

    socket.on('call:renegotiate-answer', (data) => {
      const { call_id, sdp_answer, target_id } = data;
      if (!call_id || !sdp_answer || !target_id) return;
      io.to(`user:${target_id}`).emit('call:renegotiate-answer', {
        call_id,
        sdp_answer,
        from_id: userId,
      });
    });

    // Media state changes (mute/unmute, camera on/off)
    socket.on('call:media-state', (data) => {
      const { call_id, target_id, audio, video, screen_sharing } = data;
      io.to(`user:${target_id}`).emit('call:media-state', {
        call_id,
        user_id: userId,
        audio,
        video,
        screen_sharing,
      });
    });

    socket.on('call:end', async (data) => {
      try {
        const { call_id } = data;
        if (!call_id) return;

        await endCallWithStatus(call_id, 'ended' as CallStatus, io, userId);

        // Clean up Redis call state
        try { await redis.del(`call:${call_id}`); } catch (e) { }
      } catch (error) {
        console.error('Call end error:', error);
      }
    });

    socket.on('call:decline', async (data) => {
      try {
        const { call_id } = data;
        if (!call_id) return;

        clearCallRingTimeout(call_id);

        const call = await prisma.call.findUnique({
          where: { id: call_id },
          select: { initiator_id: true, status: true }
        });

        if (!call || call.status !== 'ringing') {
          cleanupCallTracking(call_id);
          return;
        }

        await prisma.call.update({
          where: { id: call_id },
          data: {
            status: 'declined' as CallStatus,
            ended_at: new Date()
          }
        });

        io.to(`user:${call.initiator_id}`).emit('call:declined', {
          call_id,
          declined_by: userId,
        });

        cleanupCallTracking(call_id);
      } catch (error) {
        console.error('Call decline error:', error);
      }
    });

    // ============== CONVERSATION EVENTS ==============

    socket.on('conversation:join', (data) => {
      const { conversation_id } = data;
      socket.join(`conversation:${conversation_id}`);
    });

    // ============== DISCONNECT ==============

    socket.on('disconnect', async () => {
      console.log(`User disconnected: ${userId} (socket: ${socket.id})`);

      // Remove from tracking
      const sockets = userSockets.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          userSockets.delete(userId);

          // Clean up active calls - end any call this user is in
          const activeCallId = userActiveCalls.get(userId);
          if (activeCallId) {
            // Give a grace period for reconnection before ending the call
            const disconnectCallTimeout = setTimeout(async () => {
              // Check if user reconnected
              if (!userSockets.has(userId)) {
                const call = await prisma.call.findUnique({
                  where: { id: activeCallId },
                  select: { status: true }
                });
                if (call && ['ringing', 'in_progress'].includes(call.status)) {
                  await endCallWithStatus(activeCallId, 'ended' as CallStatus, io, userId);
                  try { await redis.del(`call:${activeCallId}`); } catch (e) { }
                }
              }
            }, 10000); // 10s grace period for reconnection

            // Store timeout reference for cleanup if user reconnects
            callRingTimeouts.set(`disconnect:${userId}`, disconnectCallTimeout);
          }

          // Broadcast offline status FIRST before async DB operations
          io.emit('user:offline', { user_id: userId, last_seen: new Date().toISOString() });

          // Set user as offline (best-effort, don't delay broadcast)
          try {
            await redis.hSet(`presence:${userId}`, {
              status: 'offline',
              last_seen: Date.now().toString(),
            });
            await prisma.userProfile.upsert({
              where: { user_id: userId },
              update: { last_seen_at: new Date() },
              create: {
                user_id: userId,
                display_name: null,
                last_seen_at: new Date(),
              }
            });
          } catch (e) {
            // Profile update is best-effort; don't crash on disconnect
            console.warn('Failed to update profile on disconnect:', (e as Error).message);
          }
        }
      }
      socketUsers.delete(socket.id);
    });
  });

  return io;
}
