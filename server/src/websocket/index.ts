import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import prisma from '../db/client';
import { redis } from '../db/redis';
import { MessageType, MessageStatus, ParticipantRole, Platform, ConversationType, Prisma } from '@prisma/client';
import { pushNewMessage } from '../services/pushNotification';
import { registerCallHandlers } from './calls';

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
      const participants = await prisma.conversationParticipant.findMany(
{
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

    // ============== KEY BACKUP & DEVICE SYNC EVENTS ==============

    // Notify other devices that the key backup was updated
    socket.on('key:backup-updated', async (data) => {
      try {
        const { key_version } = data;
        // Notify all other devices of this user
        socket.to(`user:${userId}`).emit('key:backup-changed', {
          user_id: userId,
          key_version,
          updated_at: new Date().toISOString(),
        });
      } catch (error) {
        console.error('Key backup notification error:', error);
      }
    });

    // Notify other devices of key rotation (new epoch)
    socket.on('key:epoch-rotated', async (data) => {
      try {
        const { new_epoch, new_public_key } = data;
        // Broadcast to all devices of this user
        socket.to(`user:${userId}`).emit('key:epoch-changed', {
          user_id: userId,
          new_epoch,
          new_public_key,
          rotated_at: new Date().toISOString(),
        });
        // Also notify all conversations this user is in
        const convParticipants = await prisma.conversationParticipant.findMany({
          where: { user_id: userId },
          select: { conversation_id: true },
        });
        for (const p of convParticipants) {
          socket.to(`conversation:${p.conversation_id}`).emit('key:peer-epoch-changed', {
            user_id: userId,
            new_epoch,
            new_public_key,
            conversation_id: p.conversation_id,
          });
        }
      } catch (error) {
        console.error('Key epoch rotation notification error:', error);
      }
    });

    // Request ratchet state sync from server (new device joining)
    socket.on('key:request-sync', async () => {
      try {
        // Signal other devices to push their latest state
        socket.to(`user:${userId}`).emit('key:sync-requested', {
          requesting_device: socket.deviceId,
          requested_at: new Date().toISOString(),
        });
      } catch (error) {
        console.error('Key sync request error:', error);
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

    // ============== CONVERSATION EVENTS ==============

    socket.on('conversation:join', (data) => {
      const { conversation_id } = data;
      socket.join(`conversation:${conversation_id}`);
    });

    // ============== CALL SIGNALING ==============

    registerCallHandlers(io, socket);

    // ============== DISCONNECT ==============

    socket.on('disconnect', async () => {
      console.log(`User disconnected: ${userId} (socket: ${socket.id})`);

      // Remove from tracking
      const sockets = userSockets.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          userSockets.delete(userId);

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
