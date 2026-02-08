import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import prisma from '../db/client';
import { redis } from '../db/redis';
import { CallType, CallStatus, MessageType, MessageStatus, ParticipantRole, Platform, ConversationType, Prisma } from '@prisma/client';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  deviceId?: string;
}

// Maps for managing connections
const userSockets = new Map<string, Set<string>>(); // userId -> Set of socketIds
const socketUsers = new Map<string, string>(); // socketId -> userId

export function setupWebSocket(httpServer: HTTPServer) {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: config.cors.origin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // Authentication middleware
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
      if (!token) {
        return next(new Error('Authentication required'));
      }

      const decoded = jwt.verify(token, config.jwt.secret) as { userId: string; deviceId: string };
      socket.userId = decoded.userId;
      socket.deviceId = decoded.deviceId;
      next();
    } catch (error) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', async (socket: AuthenticatedSocket) => {
    const userId = socket.userId!;
    console.log(`User connected: ${userId} (socket: ${socket.id})`);

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
    try {
      const convParticipants = await prisma.conversationParticipant.findMany({
        where: { user_id: userId },
        select: { conversation_id: true }
      });
      const convIds = convParticipants.map(p => p.conversation_id);

      const undeliveredMessages = await prisma.messages.findMany({
        where: {
          conversation_id: { in: convIds },
          sender_id: { not: userId },
          status: 'sent' as MessageStatus
        },
        select: { id: true, sender_id: true, conversation_id: true }
      });

      if (undeliveredMessages.length > 0) {
        await prisma.messages.updateMany({
          where: { id: { in: undeliveredMessages.map(m => m.id) } },
          data: { status: 'delivered' as MessageStatus }
        });

        // Notify senders
        for (const msg of undeliveredMessages) {
          io.to(`user:${msg.sender_id}`).emit('message:status', {
            message_id: msg.id,
            conversation_id: msg.conversation_id,
            status: 'delivered'
          });
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

    // Send message
    socket.on('message:send', async (data) => {
      try {
        const { conversation_id, recipient_id, encrypted_content, message_type = 'text', reply_to_id, temp_id } = data;

        let convId = conversation_id;

        // Create or find conversation for DM
        if (!convId && recipient_id) {
          const existing = await prisma.conversation.findFirst({
            where: {
              type: 'one_to_one',
              participants: {
                every: {
                  user_id: { in: [userId, recipient_id] }
                }
              }
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

        // Update message status to delivered for online recipients
        const participants = await prisma.conversationParticipant.findMany({
          where: {
            conversation_id: convId,
            user_id: { not: userId }
          },
          select: { user_id: true }
        });

        for (const p of participants) {
          if (userSockets.has(p.user_id)) {
            await prisma.messages.update({
              where: { id: result.id },
              data: { status: 'delivered' as MessageStatus }
            });
            io.to(`user:${userId}`).emit('message:status', {
              message_id: result.id,
              status: 'delivered',
            });
          }
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

    // ============== CALL EVENTS (WebRTC Signaling) ==============

    socket.on('call:initiate', async (data) => {
      try {
        const { recipient_id, call_type, sdp_offer } = data;

        const initiator = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            username: true,
            profile: { select: { display_name: true } }
          }
        });

        const callerUsername = initiator?.profile?.display_name || initiator?.username || 'Unknown User';

        const call = await prisma.call.create({
          data: {
            initiator_id: userId,
            call_type: call_type as CallType,
            status: 'ringing' as CallStatus,
            participants: {
              create: [
                { user_id: userId, joined_at: new Date() },
                { user_id: recipient_id }
              ]
            }
          }
        });

        // Send call offer to recipient
        io.to(`user:${recipient_id}`).emit('call:incoming', {
          call_id: call.id,
          caller_id: userId,
          caller_username: callerUsername,
          call_type,
          sdp_offer,
        });

        socket.emit('call:initiated', { call_id: call.id, status: 'ringing' });
      } catch (error) {
        console.error('Call initiate error:', error);
        socket.emit('error', { message: 'Failed to initiate call' });
      }
    });

    socket.on('call:answer', async (data) => {
      try {
        const { call_id, sdp_answer } = data;

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

        const call = await prisma.call.findUnique({
          where: { id: call_id },
          select: { initiator_id: true }
        });

        if (call) {
          io.to(`user:${call.initiator_id}`).emit('call:answered', {
            call_id,
            sdp_answer,
            answerer_id: userId,
          });
        }
      } catch (error) {
        console.error('Call answer error:', error);
      }
    });

    socket.on('call:ice-candidate', (data) => {
      const { call_id, candidate, target_id } = data;
      io.to(`user:${target_id}`).emit('call:ice-candidate', {
        call_id,
        candidate,
        from_id: userId,
      });
    });

    socket.on('call:end', async (data) => {
      try {
        const { call_id } = data;

        const callData = await prisma.call.findUnique({
          where: { id: call_id },
          select: { started_at: true }
        });

        const duration = callData?.started_at
          ? Math.floor((Date.now() - new Date(callData.started_at).getTime()) / 1000)
          : 0;

        await prisma.$transaction([
          prisma.call.update({
            where: { id: call_id },
            data: {
              status: 'ended' as CallStatus,
              ended_at: new Date(),
              duration_seconds: duration
            }
          }),
          prisma.callParticipant.updateMany({
            where: { call_id, left_at: null },
            data: { left_at: new Date() }
          })
        ]);

        // Notify all call participants
        const participants = await prisma.callParticipant.findMany({
          where: { call_id },
          select: { user_id: true }
        });

        for (const p of participants) {
          io.to(`user:${p.user_id}`).emit('call:ended', { call_id, duration_seconds: duration });
        }
      } catch (error) {
        console.error('Call end error:', error);
      }
    });

    socket.on('call:decline', async (data) => {
      try {
        const { call_id } = data;

        await prisma.call.update({
          where: { id: call_id },
          data: {
            status: 'declined' as CallStatus,
            ended_at: new Date()
          }
        });

        const call = await prisma.call.findUnique({
          where: { id: call_id },
          select: { initiator_id: true }
        });

        if (call) {
          io.to(`user:${call.initiator_id}`).emit('call:declined', {
            call_id,
            declined_by: userId,
          });
        }
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

          // Set user as offline
          try {
            await redis.hSet(`presence:${userId}`, {
              status: 'offline',
              last_seen: Date.now().toString(),
            });
            await prisma.userProfile.update({
              where: { user_id: userId },
              data: { last_seen_at: new Date() }
            });
          } catch (e) { }

          socket.broadcast.emit('user:offline', { user_id: userId, last_seen: new Date().toISOString() });
        }
      }
      socketUsers.delete(socket.id);
    });
  });

  return io;
}
