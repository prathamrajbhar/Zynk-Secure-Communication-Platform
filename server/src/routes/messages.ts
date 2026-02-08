import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import prisma from '../db/client';
import { redis } from '../db/redis';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { ConversationType, MessageType, MessageStatus } from '@prisma/client';

const router = Router();

// POST /messages - send message via REST
const sendMessageSchema = z.object({
  conversation_id: z.string().uuid().optional(),
  recipient_id: z.string().uuid().optional(),
  encrypted_content: z.string().min(1),
  message_type: z.enum(['text', 'image', 'file', 'audio', 'video']).default('text'),
  reply_to_id: z.string().uuid().optional(),
  expires_in_seconds: z.number().optional(),
});

router.post('/', authenticate, validate(sendMessageSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { conversation_id, recipient_id, encrypted_content, message_type, reply_to_id, expires_in_seconds } = req.body;

    let convId = conversation_id;

    // If no conversation_id, create or find one-to-one conversation
    if (!convId && recipient_id) {
      // Check existing conversation between these users
      const existing = await prisma.conversation.findFirst({
        where: {
          type: 'one_to_one',
          participants: {
            every: {
              user_id: { in: [req.userId!, recipient_id] }
            }
          }
        },
        select: { id: true }
      });

      // Note: The 'every' filter in Prisma can be tricky for exact matches.
      // A more robust way might be to check if there are EXACTLY two participants with these IDs.
      // But for Zynk, one_to_one only has 2 participants.

      if (existing) {
        convId = existing.id;
      } else {
        // Create new conversation in a transaction
        convId = await prisma.$transaction(async (tx) => {
          const conv = await tx.conversation.create({
            data: {
              type: 'one_to_one',
              participants: {
                create: [
                  { user_id: req.userId!, role: 'member' },
                  { user_id: recipient_id, role: 'member' }
                ]
              }
            }
          });
          return conv.id;
        });
      }
    }

    if (!convId) {
      return res.status(400).json({ error: 'conversation_id or recipient_id required' });
    }

    const expiresAt = expires_in_seconds ? new Date(Date.now() + expires_in_seconds * 1000) : null;

    const message = await prisma.$transaction(async (tx) => {
      // Create message
      const msg = await tx.messages.create({
        data: {
          conversation_id: convId,
          sender_id: req.userId!,
          encrypted_content,
          message_type: message_type as MessageType,
          metadata: reply_to_id ? { reply_to_id } : undefined,
          expires_at: expiresAt,
          status: 'sent' as MessageStatus,
        }
      });

      // Update conversation timestamp
      await tx.conversation.update({
        where: { id: convId },
        data: { updated_at: new Date() }
      });

      return msg;
    });

    return res.status(201).json({
      message_id: message.id,
      conversation_id: message.conversation_id,
      status: message.status,
      created_at: message.created_at,
    });
  } catch (error) {
    console.error('Send message error:', error);
    return res.status(500).json({ error: 'Failed to send message' });
  }
});

// GET /messages/:conversationId
router.get('/:conversationId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { conversationId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const before = req.query.before as string;

    // Verify user is participant
    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversation_id_user_id: {
          conversation_id: conversationId,
          user_id: req.userId!
        }
      }
    });

    if (!participant) {
      return res.status(403).json({ error: 'Not a participant' });
    }

    const messages = await prisma.messages.findMany({
      where: {
        conversation_id: conversationId,
        deleted_at: null,
        ...(before ? { created_at: { lt: new Date(parseInt(before) * 1000) } } : {})
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
      },
      orderBy: { created_at: 'desc' },
      take: limit + 1
    });

    const hasMore = messages.length > limit;
    const resultMessages = messages.slice(0, limit).map(m => ({
      id: m.id,
      conversation_id: m.conversation_id,
      sender_id: m.sender_id,
      encrypted_content: m.encrypted_content,
      message_type: m.message_type,
      metadata: m.metadata,
      status: m.status,
      created_at: m.created_at,
      edited_at: m.edited_at,
      sender_username: m.sender.username,
      sender_display_name: m.sender.profile?.display_name,
      sender_avatar: m.sender.profile?.avatar_url
    })).reverse();

    return res.json({ messages: resultMessages, has_more: hasMore });
  } catch (error) {
    console.error('Get messages error:', error);
    return res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// DELETE /messages/:messageId
router.delete('/:messageId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { messageId } = req.params;
    const forEveryone = req.query.for_everyone === 'true';

    if (forEveryone) {
      // Only sender can delete for everyone
      await prisma.messages.updateMany({
        where: { id: messageId, sender_id: req.userId! },
        data: {
          deleted_at: new Date(),
          encrypted_content: '[deleted]'
        }
      });
    } else {
      await prisma.messages.updateMany({
        where: { id: messageId, sender_id: req.userId! },
        data: { deleted_at: new Date() }
      });
    }

    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ error: 'Failed to delete message' });
  }
});

// PUT /messages/:messageId
router.put('/:messageId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { messageId } = req.params;
    const { encrypted_content } = req.body;

    const message = await prisma.messages.findUnique({
      where: { id: messageId },
      select: { sender_id: true, metadata: true }
    });

    if (!message || message.sender_id !== req.userId) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const updatedMetadata = {
      ...(message.metadata as any || {}),
      edited: true
    };

    const updated = await prisma.messages.update({
      where: { id: messageId },
      data: {
        encrypted_content,
        edited_at: new Date(),
        metadata: updatedMetadata
      }
    });

    return res.json({ message_id: updated.id, updated_at: updated.edited_at });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to edit message' });
  }
});

// PUT /messages/:messageId/read
router.put('/:messageId/read', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { messageId } = req.params;

    // Update message status
    const message = await prisma.messages.updateMany({
      where: {
        id: messageId,
        sender_id: { not: req.userId! }
      },
      data: { status: 'read' as MessageStatus }
    });

    // Update last_read_at for conversation participant
    const msgData = await prisma.messages.findUnique({
      where: { id: messageId },
      select: { conversation_id: true }
    });

    if (msgData) {
      await prisma.conversationParticipant.updateMany({
        where: {
          conversation_id: msgData.conversation_id,
          user_id: req.userId!
        },
        data: { last_read_at: new Date() }
      });
    }

    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ error: 'Failed to mark as read' });
  }
});

// POST /messages/search
router.post('/search', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { conversation_id, query: searchQuery, limit = 20, offset = 0 } = req.body;

    const where: any = {
      deleted_at: null,
      encrypted_content: { contains: searchQuery, mode: 'insensitive' },
      conversation: {
        participants: {
          some: { user_id: req.userId! }
        }
      }
    };

    if (conversation_id) {
      where.conversation_id = conversation_id;
    }

    const [total, results] = await prisma.$transaction([
      prisma.messages.count({ where }),
      prisma.messages.findMany({
        where,
        include: {
          sender: {
            select: {
              username: true,
              profile: {
                select: { display_name: true }
              }
            }
          }
        },
        orderBy: { created_at: 'desc' },
        take: limit,
        skip: offset
      })
    ]);

    const formattedResults = results.map(m => ({
      message_id: m.id,
      conversation_id: m.conversation_id,
      sender_id: m.sender_id,
      snippet: m.encrypted_content,
      created_at: m.created_at,
      sender_username: m.sender.username,
      sender_display_name: m.sender.profile?.display_name
    }));

    return res.json({ results: formattedResults, total });
  } catch (error) {
    return res.status(500).json({ error: 'Search failed' });
  }
});

// PUT /messages/conversations/:conversationId/read-all
router.put('/conversations/:conversationId/read-all', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { conversationId } = req.params;

    // Verify participation
    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversation_id_user_id: {
          conversation_id: conversationId,
          user_id: req.userId!
        }
      }
    });

    if (!participant) {
      return res.status(403).json({ error: 'Not a participant' });
    }

    await prisma.$transaction([
      // Mark all unread messages as read
      prisma.messages.updateMany({
        where: {
          conversation_id: conversationId,
          sender_id: { not: req.userId! },
          status: { not: 'read' as MessageStatus },
          deleted_at: null
        },
        data: { status: 'read' as MessageStatus }
      }),
      // Update last_read_at
      prisma.conversationParticipant.update({
        where: {
          conversation_id_user_id: {
            conversation_id: conversationId,
            user_id: req.userId!
          }
        },
        data: { last_read_at: new Date() }
      })
    ]);

    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ error: 'Failed to mark as read' });
  }
});

// GET /messages/conversations/list - Get all conversations for user
router.get('/conversations/list', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const conversations = await prisma.conversation.findMany({
      where: {
        participants: {
          some: { user_id: req.userId! }
        }
      },
      include: {
        participants: {
          where: { user_id: req.userId },
          select: { last_read_at: true }
        },
        messages: {
          where: { deleted_at: null },
          orderBy: { created_at: 'desc' },
          take: 1
        },
        group: {
          select: {
            id: true,
            name: true,
            avatar_url: true
          }
        }
      },
      orderBy: { updated_at: 'desc' }
    });

    const formattedConversations = await Promise.all(conversations.map(async (c) => {
      const lastReadAt = c.participants[0]?.last_read_at || new Date(0);
      const lastMessage = c.messages[0];

      // Count unread (Prisma count is efficient)
      const unreadCount = await prisma.messages.count({
        where: {
          conversation_id: c.id,
          created_at: { gt: lastReadAt },
          sender_id: { not: req.userId! },
          deleted_at: null
        }
      });

      // Get other user info for one_to_one
      let otherUser = null;
      let isOnline = false;
      if (c.type === 'one_to_one') {
        const otherParticipant = await prisma.conversationParticipant.findFirst({
          where: {
            conversation_id: c.id,
            user_id: { not: req.userId! }
          },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                profile: {
                  select: {
                    display_name: true,
                    avatar_url: true,
                    last_seen_at: true
                  }
                }
              }
            }
          }
        });

        if (otherParticipant) {
          // Check presence in Redis
          try {
            const presence = await redis.hGetAll(`presence:${otherParticipant.user.id}`);
            isOnline = presence && presence.status === 'online';
          } catch (e) { }

          otherUser = {
            user_id: otherParticipant.user.id,
            username: otherParticipant.user.username,
            display_name: otherParticipant.user.profile?.display_name,
            avatar_url: otherParticipant.user.profile?.avatar_url,
            last_seen_at: otherParticipant.user.profile?.last_seen_at
          };
        }
      }

      return {
        id: c.id,
        type: c.type,
        updated_at: c.updated_at,
        last_read_at: lastReadAt,
        unread_count: unreadCount,
        last_message: lastMessage?.encrypted_content,
        last_message_at: lastMessage?.created_at,
        last_message_sender_id: lastMessage?.sender_id,
        other_user: otherUser,
        is_online: isOnline,
        group_info: c.group ? {
          group_id: c.group.id,
          name: c.group.name,
          avatar_url: c.group.avatar_url
        } : null
      };
    }));

    // Re-sort by last message at or updated at if necessary, but keep updated_at as primary descending
    return res.json({ conversations: formattedConversations });
  } catch (error) {
    console.error('Get conversations error:', error);
    return res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

export default router;
