/**
 * Key Backup & Sync Routes
 *
 * Handles encrypted private key backup for multi-device support:
 * - Upload/download encrypted key backup (PBKDF2-protected)
 * - Message key archive management (for key rotation history)
 * - Ratchet state synchronization across devices
 *
 * SECURITY: Server only stores ciphertext encrypted with user's password-derived key.
 * Server CANNOT decrypt private keys or message keys.
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../db/client';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { logger } from '../lib/logger';

const router = Router();

// ========== Schemas ==========

const backupSchema = z.object({
  encrypted_private_key: z.string().min(1),
  public_key: z.string().min(1),
  salt: z.string().min(1),
  iv: z.string().min(1),
  key_version: z.number().int().positive(),
});

const messageKeyArchiveSchema = z.object({
  conversation_id: z.string().uuid(),
  key_epoch: z.number().int().positive(),
  encrypted_key: z.string().min(1),
  iv: z.string().min(1),
  remote_public_key: z.string().optional(),
  message_count: z.number().int().min(0).optional().default(0),
});

const batchMessageKeyArchiveSchema = z.object({
  archives: z.array(messageKeyArchiveSchema).min(1).max(100),
});

const ratchetStateSchema = z.object({
  conversation_id: z.string().uuid(),
  key_epoch: z.number().int().positive(),
  sending_chain_idx: z.number().int().min(0),
  receiving_chain_idx: z.number().int().min(0),
  encrypted_state: z.string().min(1),
  iv: z.string().min(1),
});

// ========== Key Backup Routes ==========

/**
 * POST /keys/backup
 * Create or update the encrypted private key backup.
 * Called after registration (new keys) or key rotation.
 *
 * The private key is encrypted client-side with PBKDF2(password),
 * so the server never sees the plaintext private key.
 */
router.post('/backup', authenticate, validate(backupSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { encrypted_private_key, public_key, salt, iv, key_version } = req.body;
    const userId = req.userId!;

    const backup = await prisma.keyBackup.upsert({
      where: { user_id: userId },
      create: {
        user_id: userId,
        encrypted_private_key,
        public_key,
        salt,
        iv,
        key_version,
      },
      update: {
        encrypted_private_key,
        public_key,
        salt,
        iv,
        key_version,
        updated_at: new Date(),
      },
    });

    return res.status(201).json({
      success: true,
      key_version: backup.key_version,
      created_at: backup.created_at,
    });
  } catch (error) {
    console.error('Key backup error:', error);
    return res.status(500).json({ error: 'Failed to backup keys' });
  }
});

/**
 * GET /keys/backup
 * Download the encrypted private key backup.
 * Called when logging in on a new device (no localStorage keys).
 *
 * Returns encrypted data that can only be decrypted with the user's password.
 */
router.get('/backup', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const backup = await prisma.keyBackup.findUnique({
      where: { user_id: userId },
    });

    if (!backup) {
      return res.status(404).json({ error: 'No key backup found' });
    }

    return res.json({
      encrypted_private_key: backup.encrypted_private_key,
      public_key: backup.public_key,
      salt: backup.salt,
      iv: backup.iv,
      key_version: backup.key_version,
      created_at: backup.created_at,
      updated_at: backup.updated_at,
    });
  } catch (error) {
    console.error('Get key backup error:', error);
    return res.status(500).json({ error: 'Failed to fetch key backup' });
  }
});

/**
 * DELETE /keys/backup
 * Delete the key backup (e.g., account deletion).
 */
router.delete('/backup', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.keyBackup.deleteMany({
      where: { user_id: req.userId! },
    });
    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ error: 'Failed to delete key backup' });
  }
});

// ========== Message Key Archive Routes ==========

/**
 * POST /keys/message-keys/archive
 * Store encrypted conversation keys for message history access.
 * Called when deriving a new conversation key or on key rotation.
 *
 * Keys are encrypted client-side with the backup key, so the server
 * cannot read message content even with these archives.
 */
router.post('/message-keys/archive', authenticate, validate(batchMessageKeyArchiveSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { archives } = req.body;
    const userId = req.userId!;

    // Verify user is participant in all referenced conversations
    const conversationIds = archives.map((a: { conversation_id: string }) => a.conversation_id) as string[];
    const uniqueConvIds: string[] = Array.from(new Set<string>(conversationIds));
    const participations = await prisma.conversationParticipant.findMany({
      where: {
        user_id: userId,
        conversation_id: { in: uniqueConvIds },
      },
      select: { conversation_id: true },
    });
    const participantConvIds = new Set(participations.map(p => p.conversation_id));

    const validArchives = archives.filter((a: any) => participantConvIds.has(a.conversation_id));
    if (validArchives.length === 0) {
      return res.status(403).json({ error: 'Not a participant in any referenced conversation' });
    }

    // Upsert each archive entry
    const results = await Promise.allSettled(
      validArchives.map((a: any) =>
        prisma.messageKeyArchive.upsert({
          where: {
            user_id_conversation_id_key_epoch: {
              user_id: userId,
              conversation_id: a.conversation_id,
              key_epoch: a.key_epoch,
            },
          },
          create: {
            user_id: userId,
            conversation_id: a.conversation_id,
            key_epoch: a.key_epoch,
            encrypted_key: a.encrypted_key,
            iv: a.iv,
            remote_public_key: a.remote_public_key || null,
            message_count: a.message_count || 0,
          },
          update: {
            encrypted_key: a.encrypted_key,
            iv: a.iv,
            remote_public_key: a.remote_public_key || null,
            message_count: a.message_count || 0,
            updated_at: new Date(),
          },
        })
      )
    );

    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    return res.status(201).json({ success: true, archived: succeeded, failed });
  } catch (error) {
    console.error('Message key archive error:', error);
    return res.status(500).json({ error: 'Failed to archive message keys' });
  }
});

/**
 * GET /keys/message-keys/:conversationId
 * Get all archived message keys for a conversation.
 * Returns encrypted keys that can only be decrypted with the user's backup key.
 */
router.get('/message-keys/:conversationId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { conversationId } = req.params;
    const userId = req.userId!;

    // Verify membership
    const participant = await prisma.conversationParticipant.findUnique({
      where: { conversation_id_user_id: { conversation_id: conversationId, user_id: userId } },
    });
    if (!participant) {
      return res.status(403).json({ error: 'Not a conversation participant' });
    }

    const archives = await prisma.messageKeyArchive.findMany({
      where: {
        user_id: userId,
        conversation_id: conversationId,
      },
      orderBy: { key_epoch: 'asc' },
      select: {
        key_epoch: true,
        encrypted_key: true,
        iv: true,
        remote_public_key: true,
        message_count: true,
        created_at: true,
      },
    });

    return res.json({ conversation_id: conversationId, archives });
  } catch (error) {
    console.error('Get message key archives error:', error);
    return res.status(500).json({ error: 'Failed to fetch message key archives' });
  }
});

/**
 * GET /keys/message-keys
 * Get all archived message keys for the user across all conversations.
 * Used during device setup to restore full message history access.
 */
router.get('/message-keys', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const archives = await prisma.messageKeyArchive.findMany({
      where: { user_id: userId },
      orderBy: [{ conversation_id: 'asc' }, { key_epoch: 'asc' }],
      select: {
        conversation_id: true,
        key_epoch: true,
        encrypted_key: true,
        iv: true,
        remote_public_key: true,
        message_count: true,
        created_at: true,
      },
    });

    return res.json({ archives });
  } catch (error) {
    console.error('Get all message key archives error:', error);
    return res.status(500).json({ error: 'Failed to fetch message key archives' });
  }
});

// ========== Ratchet State Routes ==========

/**
 * POST /keys/ratchet-state
 * Store or update ratchet state for a conversation.
 * Enables cross-device ratchet synchronization.
 */
router.post('/ratchet-state', authenticate, validate(ratchetStateSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { conversation_id, key_epoch, sending_chain_idx, receiving_chain_idx, encrypted_state, iv } = req.body;
    const userId = req.userId!;

    // Verify membership
    const participant = await prisma.conversationParticipant.findUnique({
      where: { conversation_id_user_id: { conversation_id, user_id: userId } },
    });
    if (!participant) {
      return res.status(403).json({ error: 'Not a conversation participant' });
    }

    await prisma.ratchetState.upsert({
      where: {
        user_id_conversation_id: { user_id: userId, conversation_id },
      },
      create: {
        user_id: userId,
        conversation_id,
        key_epoch,
        sending_chain_idx,
        receiving_chain_idx,
        encrypted_state,
        iv,
      },
      update: {
        key_epoch,
        sending_chain_idx,
        receiving_chain_idx,
        encrypted_state,
        iv,
        updated_at: new Date(),
      },
    });

    return res.status(201).json({ success: true });
  } catch (error) {
    console.error('Ratchet state sync error:', error);
    return res.status(500).json({ error: 'Failed to sync ratchet state' });
  }
});

/**
 * GET /keys/ratchet-state/:conversationId
 * Get ratchet state for a conversation.
 */
router.get('/ratchet-state/:conversationId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { conversationId } = req.params;
    const userId = req.userId!;

    const state = await prisma.ratchetState.findUnique({
      where: {
        user_id_conversation_id: { user_id: userId, conversation_id: conversationId },
      },
    });

    if (!state) {
      return res.status(404).json({ error: 'No ratchet state found' });
    }

    return res.json({
      conversation_id: state.conversation_id,
      key_epoch: state.key_epoch,
      sending_chain_idx: state.sending_chain_idx,
      receiving_chain_idx: state.receiving_chain_idx,
      encrypted_state: state.encrypted_state,
      iv: state.iv,
    });
  } catch (error) {
    console.error('Get ratchet state error:', error);
    return res.status(500).json({ error: 'Failed to fetch ratchet state' });
  }
});

/**
 * GET /keys/ratchet-states
 * Get all ratchet states for the user (bulk restore on new device).
 */
router.get('/ratchet-states', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const states = await prisma.ratchetState.findMany({
      where: { user_id: userId },
      select: {
        conversation_id: true,
        key_epoch: true,
        sending_chain_idx: true,
        receiving_chain_idx: true,
        encrypted_state: true,
        iv: true,
      },
    });

    return res.json({ states });
  } catch (error) {
    console.error('Get all ratchet states error:', error);
    return res.status(500).json({ error: 'Failed to fetch ratchet states' });
  }
});

export default router;
