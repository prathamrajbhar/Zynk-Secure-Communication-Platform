import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import prisma from '../db/client';
import { redis, isRedisAvailable } from '../db/redis';
import { logger } from '../lib/logger';
import { recordAudit, AuditAction } from '../lib/audit';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { validate } from '../middleware/validate';

const router = Router();

// All account management routes require authentication
router.use(authenticate);

// ======================== GDPR Data Export ========================

/**
 * GET /account/export
 * GDPR Article 20: Right to data portability
 * Returns all user data in a structured JSON format.
 */
router.get('/export', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    // Fetch all user data in parallel
    const [
      user,
      profile,
      devices,
      sessions,
      sentMessages,
      conversations,
      groupMemberships,
      files,
      reports,
      reactions,
    ] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          created_at: true,
          updated_at: true,
          public_key: true,
        },
      }),
      prisma.userProfile.findUnique({
        where: { user_id: userId },
        select: {
          display_name: true,
          avatar_url: true,
          bio: true,
          privacy_settings: true,
          last_seen_at: true,
        },
      }),
      prisma.device.findMany({
        where: { user_id: userId },
        select: {
          id: true,
          device_name: true,
          platform: true,
          created_at: true,
          last_active_at: true,
        },
      }),
      prisma.session.findMany({
        where: { user_id: userId },
        select: {
          id: true,
          created_at: true,
          expires_at: true,
          last_used_at: true,
        },
      }),
      prisma.messages.findMany({
        where: { sender_id: userId },
        select: {
          id: true,
          conversation_id: true,
          message_type: true,
          status: true,
          created_at: true,
          edited_at: true,
          // Note: encrypted_content is excluded as it's ciphertext only the client can decrypt
        },
        orderBy: { created_at: 'desc' },
        take: 10000, // Limit to prevent memory issues
      }),
      prisma.conversationParticipant.findMany({
        where: { user_id: userId },
        select: {
          conversation_id: true,
          role: true,
          joined_at: true,
        },
      }),
      prisma.groupMember.findMany({
        where: { user_id: userId },
        include: {
          group: {
            select: {
              id: true,
              name: true,
              description: true,
            },
          },
        },
      }),
      prisma.file.findMany({
        where: { uploaded_by: userId },
        select: {
          id: true,
          filename: true,
          mime_type: true,
          file_size: true,
          created_at: true,
        },
      }),
      prisma.report.findMany({
        where: { reporter_id: userId },
        select: {
          id: true,
          reason: true,
          status: true,
          created_at: true,
        },
      }),
      prisma.reaction.findMany({
        where: { user_id: userId },
        select: {
          id: true,
          emoji: true,
          message_id: true,
          created_at: true,
        },
      }),
    ]);

    const exportData = {
      export_metadata: {
        format_version: '1.0',
        exported_at: new Date().toISOString(),
        user_id: userId,
        description: 'Complete data export per GDPR Article 20 (Right to data portability)',
      },
      account: user,
      profile,
      devices,
      sessions: sessions.map(s => ({
        ...s,
        // Exclude tokens from export
      })),
      messages: {
        total_count: sentMessages.length,
        note: 'Message content is end-to-end encrypted and cannot be exported in plaintext by the server',
        metadata: sentMessages,
      },
      conversations,
      groups: groupMemberships.map(gm => ({
        group: gm.group,
        role: gm.role,
        joined_at: gm.joined_at,
      })),
      files,
      reports,
      reactions,
    };

    await recordAudit({
      action: AuditAction.DATA_EXPORT,
      userId,
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'],
      details: {
        messages_count: sentMessages.length,
        files_count: files.length,
      },
    });

    logger.info({ userId, messagesCount: sentMessages.length }, 'User data export generated');

    res.setHeader('Content-Disposition', `attachment; filename="zynk-data-export-${userId}.json"`);
    res.setHeader('Content-Type', 'application/json');
    return res.json(exportData);
  } catch (error) {
    logger.error({ error, userId: req.userId }, 'Data export failed');
    return res.status(500).json({ error: 'Failed to export data' });
  }
});

// ======================== Account Deletion ========================

const deleteAccountSchema = z.object({
  password: z.string().min(1, 'Password is required to confirm deletion'),
  confirmation: z.literal('DELETE MY ACCOUNT', {
    errorMap: () => ({ message: 'You must type "DELETE MY ACCOUNT" to confirm' }),
  }),
});

/**
 * POST /account/delete
 * GDPR Article 17: Right to erasure (right to be forgotten)
 * Permanently deletes user account and associated data.
 * Requires password confirmation and explicit consent string.
 */
router.post('/delete', validate(deleteAccountSchema), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { password } = req.body;

    // Verify password
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, password_hash: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Audit the deletion BEFORE we delete the data
    await recordAudit({
      action: AuditAction.ACCOUNT_DELETE,
      userId,
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'],
      details: { username: user.username },
    });

    logger.warn({ userId, username: user.username }, 'Account deletion initiated');

    // Perform cascading deletion in a transaction
    await prisma.$transaction(async (tx) => {
      // 1. Delete reactions
      await tx.reaction.deleteMany({ where: { user_id: userId } });

      // 2. Soft-delete sent messages (mark as deleted, remove content)
      await tx.messages.updateMany({
        where: { sender_id: userId },
        data: {
          encrypted_content: '[deleted]',
          deleted_at: new Date(),
        },
      });

      // 3. Delete message deletion records
      await tx.messageDeletedFor.deleteMany({ where: { user_id: userId } });

      // 4. Delete poll votes
      await tx.pollVote.deleteMany({ where: { user_id: userId } });

      // 5. Delete reports by this user
      await tx.report.deleteMany({ where: { reporter_id: userId } });

      // 6. Remove from conversations
      await tx.conversationParticipant.deleteMany({ where: { user_id: userId } });

      // 7. Remove from groups
      await tx.groupMember.deleteMany({ where: { user_id: userId } });

      // 8. Delete files metadata (actual files deleted asynchronously)
      await tx.file.updateMany({
        where: { uploaded_by: userId },
        data: { deleted_at: new Date() },
      });

      // 9. Delete key bundles
      await tx.oneTimePreKey.deleteMany({ where: { user_id: userId } });
      await tx.signedPreKey.deleteMany({ where: { user_id: userId } });
      await tx.identityKey.deleteMany({ where: { user_id: userId } });

      // 10. Delete sessions
      await tx.session.deleteMany({ where: { user_id: userId } });

      // 11. Delete devices
      await tx.device.deleteMany({ where: { user_id: userId } });

      // 12. Delete profile
      await tx.userProfile.deleteMany({ where: { user_id: userId } });

      // 13. Delete user account
      await tx.user.delete({ where: { id: userId } });
    });

    // Invalidate all Redis sessions for this user
    if (isRedisAvailable()) {
      try {
        // Use pattern scan to find and delete all sessions for this user
        const cursor = redis.scanIterator({ MATCH: `session:*`, COUNT: 100 });
        for await (const key of cursor) {
          await redis.del(key);
        }
        // Remove from presence tracking
        await redis.sRem('online_users', userId);
      } catch {
        // Redis cleanup failure is non-fatal — sessions will expire naturally
      }
    }

    logger.info({ userId, username: user.username }, 'Account permanently deleted');

    return res.status(200).json({
      message: 'Account deleted successfully',
      note: 'Your data has been permanently removed. Uploaded files will be purged within 30 days.',
    });
  } catch (error) {
    logger.error({ error, userId: req.userId }, 'Account deletion failed');
    return res.status(500).json({ error: 'Failed to delete account. Please try again or contact support.' });
  }
});

// ======================== Change Password ========================

const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128)
    .regex(/[A-Z]/, 'Must contain uppercase letter')
    .regex(/[a-z]/, 'Must contain lowercase letter')
    .regex(/[0-9]/, 'Must contain number')
    .regex(/[^A-Za-z0-9]/, 'Must contain special character'),
});

router.post('/change-password', validate(changePasswordSchema), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { current_password, new_password } = req.body;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { password_hash: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isValid = await bcrypt.compare(current_password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Ensure new password is different
    const isSame = await bcrypt.compare(new_password, user.password_hash);
    if (isSame) {
      return res.status(400).json({ error: 'New password must be different from current password' });
    }

    const passwordHash = await bcrypt.hash(new_password, 12);

    await prisma.user.update({
      where: { id: userId },
      data: { password_hash: passwordHash },
    });

    // Invalidate all other sessions (force re-login on other devices)
    await prisma.session.deleteMany({
      where: {
        user_id: userId,
        device_id: { not: req.deviceId! },
      },
    });

    await recordAudit({
      action: AuditAction.PASSWORD_CHANGE,
      userId,
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'],
      details: { other_sessions_terminated: true },
    });

    logger.info({ userId }, 'Password changed, other sessions terminated');

    return res.json({
      message: 'Password changed successfully. Other sessions have been terminated.',
    });
  } catch (error) {
    logger.error({ error, userId: req.userId }, 'Password change failed');
    return res.status(500).json({ error: 'Failed to change password' });
  }
});

export default router;
