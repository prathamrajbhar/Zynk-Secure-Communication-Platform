import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import prisma from '../db/client';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { ParticipantRole, ConversationType } from '@prisma/client';

const router = Router();

// POST /groups
const createGroupSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(500).optional(),
  avatar_url: z.string().url().optional().nullable(),
  member_ids: z.array(z.string().uuid()).min(1).max(255),
});

router.post('/', authenticate, validate(createGroupSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, avatar_url, member_ids } = req.body;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create conversation
      const conv = await tx.conversation.create({
        data: {
          type: 'group' as ConversationType,
        }
      });

      // 2. Create group
      const group = await tx.group.create({
        data: {
          name,
          description: description || null,
          avatar_url: avatar_url || null,
          conversation_id: conv.id,
          created_by: req.userId!,
        }
      });

      // 3. Add creator as admin in both group and conversation
      await tx.groupMember.create({
        data: {
          group_id: group.id,
          user_id: req.userId!,
          role: 'admin' as ParticipantRole,
        }
      });

      await tx.conversationParticipant.create({
        data: {
          conversation_id: conv.id,
          user_id: req.userId!,
          role: 'admin' as ParticipantRole,
        }
      });

      // 4. Add other members
      const otherMembers = member_ids.filter((id: string) => id !== req.userId);
      if (otherMembers.length > 0) {
        // Create many group members
        await tx.groupMember.createMany({
          data: otherMembers.map((memberId: string) => ({
            group_id: group.id,
            user_id: memberId,
            role: 'member' as ParticipantRole,
            invited_by: req.userId!,
          })),
          skipDuplicates: true
        });

        // Create many conversation participants
        await tx.conversationParticipant.createMany({
          data: otherMembers.map((memberId: string) => ({
            conversation_id: conv.id,
            user_id: memberId,
            role: 'member' as ParticipantRole,
          })),
          skipDuplicates: true
        });
      }

      return { group, conv };
    });

    return res.status(201).json({
      group_id: result.group.id,
      conversation_id: result.conv.id,
      name,
      created_at: result.group.created_at,
    });
  } catch (error) {
    console.error('Create group error:', error);
    return res.status(500).json({ error: 'Failed to create group' });
  }
});

// GET /groups/:groupId
router.get('/:groupId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
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
          orderBy: [
            { role: 'desc' },
            { joined_at: 'asc' }
          ]
        }
      }
    });

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Check if requester is a member
    const isMember = group.members.some(m => m.user_id === req.userId);
    if (!isMember) {
      return res.status(403).json({ error: 'Not a group member' });
    }

    const formattedMembers = group.members.map(m => ({
      user_id: m.user_id,
      role: m.role,
      joined_at: m.joined_at,
      username: m.user.username,
      display_name: m.user.profile?.display_name,
      avatar_url: m.user.profile?.avatar_url
    }));

    return res.json({
      group_id: group.id,
      name: group.name,
      description: group.description,
      avatar_url: group.avatar_url,
      conversation_id: group.conversation_id,
      created_by: group.created_by,
      created_at: group.created_at,
      max_members: group.max_members,
      members: formattedMembers,
    });
  } catch (error) {
    console.error('Get group error:', error);
    return res.status(500).json({ error: 'Failed to fetch group' });
  }
});

// PUT /groups/:groupId
router.put('/:groupId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const { name, description, avatar_url } = req.body;

    // Verify admin
    const membership = await prisma.groupMember.findUnique({
      where: {
        group_id_user_id: {
          group_id: groupId,
          user_id: req.userId!
        }
      },
      select: { role: true }
    });

    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const data: any = { updated_at: new Date() };
    if (name) data.name = name;
    if (description !== undefined) data.description = description;
    if (avatar_url !== undefined) data.avatar_url = avatar_url;

    await prisma.group.update({
      where: { id: groupId },
      data
    });

    return res.json({ group_id: groupId, updated_at: new Date().toISOString() });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update group' });
  }
});

// DELETE /groups/:groupId
router.delete('/:groupId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { conversation_id: true, members: { where: { user_id: req.userId!, role: 'admin' } } }
    });

    if (!group || group.members.length === 0) {
      return res.status(403).json({ error: 'Admin access required or group not found' });
    }

    await prisma.$transaction(async (tx) => {
      // Delete group (members will be deleted by cascade in DB)
      await tx.group.delete({ where: { id: groupId } });

      // Delete conversation (participants and messages will be deleted by cascade in DB)
      if (group.conversation_id) {
        await tx.conversation.delete({ where: { id: group.conversation_id } });
      }
    });

    return res.status(204).send();
  } catch (error) {
    console.error('Delete group error:', error);
    return res.status(500).json({ error: 'Failed to delete group' });
  }
});

// POST /groups/:groupId/members
router.post('/:groupId/members', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const { user_ids } = req.body;

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { conversation_id: true, members: { where: { user_id: req.userId!, role: 'admin' } } }
    });

    if (!group || group.members.length === 0) {
      return res.status(403).json({ error: 'Admin access required or group not found' });
    }

    const conversationId = group.conversation_id;

    const added = await prisma.$transaction(async (tx) => {
      const successfulIds: string[] = [];
      for (const userId of user_ids) {
        try {
          // Add to group_members
          await tx.groupMember.create({
            data: {
              group_id: groupId,
              user_id: userId,
              role: 'member' as ParticipantRole,
              invited_by: req.userId!
            }
          });

          // Add to conversation_participants
          if (conversationId) {
            await tx.conversationParticipant.create({
              data: {
                conversation_id: conversationId,
                user_id: userId,
                role: 'member' as ParticipantRole,
              }
            });
          }
          successfulIds.push(userId);
        } catch (e) {
          // Skip if already member or error
        }
      }
      return successfulIds;
    });

    return res.json({ added });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to add members' });
  }
});

// DELETE /groups/:groupId/members/:userId
router.delete('/:groupId/members/:userId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { groupId, userId } = req.params;

    // Admin check or self-removal
    if (userId !== req.userId) {
      const adminCheck = await prisma.groupMember.findUnique({
        where: { group_id_user_id: { group_id: groupId, user_id: req.userId! } },
        select: { role: true }
      });

      if (!adminCheck || adminCheck.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }
    }

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { conversation_id: true }
    });

    await prisma.$transaction(async (tx) => {
      await tx.groupMember.deleteMany({
        where: { group_id: groupId, user_id: userId }
      });

      if (group?.conversation_id) {
        await tx.conversationParticipant.deleteMany({
          where: { conversation_id: group.conversation_id, user_id: userId }
        });
      }
    });

    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ error: 'Failed to remove member' });
  }
});

// GET /groups/my/list
router.get('/my/list', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const groups = await prisma.group.findMany({
      where: {
        members: {
          some: { user_id: req.userId! }
        }
      },
      include: {
        _count: {
          select: { members: true }
        },
        conversation: {
          select: {
            messages: {
              where: { deleted_at: null },
              orderBy: { created_at: 'desc' },
              take: 1,
              select: { created_at: true }
            }
          }
        }
      }
    });

    const formattedGroups = groups.map(g => ({
      group_id: g.id,
      name: g.name,
      avatar_url: g.avatar_url,
      conversation_id: g.conversation_id,
      created_at: g.created_at,
      member_count: g._count.members,
      last_activity: g.conversation?.messages[0]?.created_at || null
    })).sort((a, b) => {
      const timeA = a.last_activity ? new Date(a.last_activity).getTime() : 0;
      const timeB = b.last_activity ? new Date(b.last_activity).getTime() : 0;
      return timeB - timeA;
    });

    return res.json({ groups: formattedGroups });
  } catch (error) {
    console.error('Fetch my groups error:', error);
    return res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

export default router;
