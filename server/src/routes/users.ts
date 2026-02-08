import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../db/client';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

// PUT /users/me
const updateProfileSchema = z.object({
  display_name: z.string().max(255).optional().nullable(),
  bio: z.string().max(500).optional().nullable(),
  avatar_url: z.string().url().optional().nullable(),
});

router.put('/me', authenticate, validate(updateProfileSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { display_name, bio, avatar_url } = req.body;

    const data: any = {
      updated_at: new Date()
    };
    if (display_name !== undefined) data.display_name = display_name;
    if (bio !== undefined) data.bio = bio;
    if (avatar_url !== undefined) data.avatar_url = avatar_url;

    await prisma.userProfile.update({
      where: { user_id: req.userId! },
      data
    });

    return res.json({ user_id: req.userId, updated_at: new Date().toISOString() });
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
});

// PUT /users/me/privacy
const updatePrivacySchema = z.object({
  show_online_status: z.boolean().optional(),
  show_last_seen: z.boolean().optional(),
  allow_read_receipts: z.boolean().optional(),
  allow_proximity_discovery: z.boolean().optional(),
});

router.put('/me/privacy', authenticate, validate(updatePrivacySchema), async (req: AuthRequest, res: Response) => {
  try {
    // Get current settings
    const profile = await prisma.userProfile.findUnique({
      where: { user_id: req.userId! },
      select: { privacy_settings: true }
    });

    const currentSettings = (profile?.privacy_settings as any) || {};
    const newSettings = { ...currentSettings, ...req.body };

    await prisma.userProfile.update({
      where: { user_id: req.userId! },
      data: {
        privacy_settings: newSettings,
        updated_at: new Date()
      }
    });

    return res.json({ privacy_settings: newSettings });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update privacy settings' });
  }
});

// GET /users/search
router.get('/search', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const searchQuery = req.query.query as string;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

    if (!searchQuery || searchQuery.length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const users = await prisma.user.findMany({
      where: {
        OR: [
          { username: { contains: searchQuery, mode: 'insensitive' } },
          { profile: { display_name: { contains: searchQuery, mode: 'insensitive' } } }
        ],
        id: { not: req.userId! }
      },
      select: {
        id: true,
        username: true,
        profile: {
          select: {
            display_name: true,
            avatar_url: true,
            bio: true
          }
        }
      },
      take: limit
    });

    const formattedUsers = users.map(u => ({
      user_id: u.id,
      username: u.username,
      display_name: u.profile?.display_name,
      avatar_url: u.profile?.avatar_url,
      bio: u.profile?.bio
    }));

    return res.json({ users: formattedUsers });
  } catch (error) {
    return res.status(500).json({ error: 'Search failed' });
  }
});

// GET /users/:userId
router.get('/:userId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: {
        id: true,
        username: true,
        public_key: true,
        created_at: true,
        profile: {
          select: {
            display_name: true,
            avatar_url: true,
            bio: true,
            last_seen_at: true,
            privacy_settings: true
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const privacySettings: any = user.profile?.privacy_settings || {};

    const response: any = {
      user_id: user.id,
      username: user.username,
      public_key: user.public_key,
      created_at: user.created_at,
      display_name: user.profile?.display_name,
      avatar_url: user.profile?.avatar_url,
      bio: user.profile?.bio,
      last_seen_at: privacySettings.show_last_seen ? user.profile?.last_seen_at : undefined,
      privacy_settings: privacySettings
    };

    return res.json(response);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// GET /users/:userId/public-key
router.get('/:userId/public-key', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: { id: true, public_key: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({ user_id: user.id, public_key: user.public_key });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch public key' });
  }
});

// POST /users/contacts - add a contact
router.post('/contacts', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { contact_id, nickname } = req.body;

    if (contact_id === req.userId) {
      return res.status(400).json({ error: 'Cannot add yourself as contact' });
    }

    // Upsert contact
    await prisma.contact.upsert({
      where: {
        user_id_contact_id: {
          user_id: req.userId!,
          contact_id: contact_id
        }
      },
      update: { nickname: nickname || null },
      create: {
        user_id: req.userId!,
        contact_id: contact_id,
        nickname: nickname || null
      }
    });

    return res.status(201).json({ message: 'Contact added' });
  } catch (error) {
    console.error('Add contact error:', error);
    if ((error as any).code === 'P2003') {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.status(500).json({ error: 'Failed to add contact' });
  }
});

// GET /users/contacts/list
router.get('/contacts/list', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const contacts = await prisma.contact.findMany({
      where: {
        user_id: req.userId!,
        blocked: false
      },
      include: {
        contact: {
          select: {
            id: true,
            username: true,
            profile: {
              select: {
                display_name: true,
                avatar_url: true,
                bio: true,
                last_seen_at: true
              }
            }
          }
        }
      },
      orderBy: [
        { contact: { profile: { display_name: 'asc' } } },
        { contact: { username: 'asc' } }
      ]
    });

    const formattedContacts = contacts.map(c => ({
      contact_id: c.contact_id,
      nickname: c.nickname,
      blocked: c.blocked,
      created_at: c.created_at,
      username: c.contact.username,
      display_name: c.contact.profile?.display_name,
      avatar_url: c.contact.profile?.avatar_url,
      bio: c.contact.profile?.bio,
      last_seen_at: c.contact.profile?.last_seen_at
    }));

    return res.json({ contacts: formattedContacts });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

// DELETE /users/contacts/:contactId
router.delete('/contacts/:contactId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.contact.deleteMany({
      where: {
        user_id: req.userId!,
        contact_id: req.params.contactId
      }
    });
    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ error: 'Failed to remove contact' });
  }
});

// PUT /users/contacts/:contactId/block
router.put('/contacts/:contactId/block', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.contact.upsert({
      where: {
        user_id_contact_id: {
          user_id: req.userId!,
          contact_id: req.params.contactId
        }
      },
      update: { blocked: true },
      create: {
        user_id: req.userId!,
        contact_id: req.params.contactId,
        blocked: true
      }
    });
    return res.json({ message: 'User blocked' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to block user' });
  }
});

// PUT /users/contacts/:contactId/unblock
router.put('/contacts/:contactId/unblock', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.contact.updateMany({
      where: {
        user_id: req.userId!,
        contact_id: req.params.contactId
      },
      data: { blocked: false }
    });
    return res.json({ message: 'User unblocked' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to unblock user' });
  }
});

// GET /users/contacts/blocked - get blocked contacts
router.get('/contacts/blocked', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const blocked = await prisma.contact.findMany({
      where: {
        user_id: req.userId!,
        blocked: true
      },
      include: {
        contact: {
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
      }
    });

    const formattedBlocked = blocked.map(b => ({
      contact_id: b.contact_id,
      username: b.contact.username,
      display_name: b.contact.profile?.display_name,
      avatar_url: b.contact.profile?.avatar_url
    }));

    return res.json({ blocked: formattedBlocked });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch blocked contacts' });
  }
});

export default router;
