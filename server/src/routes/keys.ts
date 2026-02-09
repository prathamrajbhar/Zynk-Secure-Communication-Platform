/**
 * E2EE Key Management Routes
 * 
 * Handles Signal Protocol key bundles:
 * - Upload identity key, signed pre-key, and one-time pre-keys
 * - Fetch pre-key bundle for initiating encrypted sessions
 * - Replenish one-time pre-keys
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../db/client';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

// ========== Type Definitions ==========

interface PreKeyInput {
  key_id: number;
  public_key: string;
}

// ========== Schemas ==========

const uploadKeysSchema = z.object({
  identity_key: z.string().min(1),       // Base64-encoded identity public key
  registration_id: z.number().int().positive(),
  signed_pre_key: z.object({
    key_id: z.number().int(),
    public_key: z.string().min(1),       // Base64-encoded
    signature: z.string().min(1),        // Base64-encoded
  }),
  pre_keys: z.array(z.object({
    key_id: z.number().int(),
    public_key: z.string().min(1),       // Base64-encoded
  })).min(1).max(100),
});

const replenishPreKeysSchema = z.object({
  pre_keys: z.array(z.object({
    key_id: z.number().int(),
    public_key: z.string().min(1),
  })).min(1).max(100),
});

// ========== Routes ==========

/**
 * POST /keys/upload
 * Upload identity key, signed pre-key, and batch of one-time pre-keys
 * Called after registration or when pre-keys run low.
 */
router.post('/upload', authenticate, validate(uploadKeysSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { identity_key, registration_id, signed_pre_key, pre_keys } = req.body;
    const userId = req.userId!;
    const deviceId = req.deviceId!;

    // Ensure device exists (foreign key constraint protection)
    const device = await prisma.device.findUnique({
      where: { id: deviceId }
    });

    if (!device) {
      console.error(`Device not found for ID: ${deviceId} (User: ${userId})`);
      return res.status(404).json({ error: 'Device session not found. Please log in again.' });
    }

    await prisma.$transaction(async (tx) => {
      // Upsert identity key
      await tx.identityKey.upsert({
        where: {
          user_id_device_id: { user_id: userId, device_id: deviceId }
        },
        create: {
          user_id: userId,
          device_id: deviceId,
          identity_key,
          registration_id,
        },
        update: {
          identity_key,
          registration_id,
          updated_at: new Date(),
        },
      });

      // Upsert signed pre-key (only latest kept per device)
      // Delete old signed pre-keys for this device
      await tx.signedPreKey.deleteMany({
        where: { user_id: userId, device_id: deviceId },
      });

      await tx.signedPreKey.create({
        data: {
          user_id: userId,
          device_id: deviceId,
          key_id: signed_pre_key.key_id,
          public_key: signed_pre_key.public_key,
          signature: signed_pre_key.signature,
        },
      });

      // Batch insert one-time pre-keys (production-level efficiency)
      await tx.preKey.createMany({
        data: (pre_keys as PreKeyInput[]).map((pk: PreKeyInput) => ({
          user_id: userId,
          device_id: deviceId,
          key_id: pk.key_id,
          public_key: pk.public_key,
        })),
        skipDuplicates: true,
      });

      // Update user's public key field
      await tx.user.update({
        where: { id: userId },
        data: { public_key: identity_key },
      });
    });

    return res.status(201).json({ success: true });
  } catch (error) {
    console.error('Key upload error details:', error);
    if (error instanceof Error) {
      console.error('Stack trace:', error.stack);
    }
    return res.status(500).json({ error: 'Failed to upload keys' });
  }
});

/**
 * POST /keys/replenish
 * Add more one-time pre-keys when running low.
 */
router.post('/replenish', authenticate, validate(replenishPreKeysSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { pre_keys } = req.body;
    const userId = req.userId!;
    const deviceId = req.deviceId!;

    // Batch insert pre-keys (single DB roundtrip)
    const result = await prisma.preKey.createMany({
      data: (pre_keys as PreKeyInput[]).map((pk: PreKeyInput) => ({
        user_id: userId,
        device_id: deviceId,
        key_id: pk.key_id,
        public_key: pk.public_key,
      })),
      skipDuplicates: true,
    });

    return res.json({ added: result.count });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to replenish pre-keys' });
  }
});

/**
 * GET /keys/:userId/bundle
 * Fetch a pre-key bundle for a user to initiate an encrypted session.
 * Consumes one one-time pre-key (marks it as used).
 */
router.get('/:userId/bundle', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const deviceId = req.query.device_id as string | undefined;

    // Build identity key query
    const identityKeyWhere: { user_id: string; device_id?: string } = { user_id: userId };
    if (deviceId) identityKeyWhere.device_id = deviceId;

    const identityKey = await prisma.identityKey.findFirst({
      where: identityKeyWhere,
      orderBy: { updated_at: 'desc' },
    });

    if (!identityKey) {
      return res.status(404).json({ error: 'No key bundle found for user' });
    }

    // Get signed pre-key
    const signedPreKey = await prisma.signedPreKey.findFirst({
      where: { user_id: userId, device_id: identityKey.device_id },
      orderBy: { created_at: 'desc' },
    });

    if (!signedPreKey) {
      return res.status(404).json({ error: 'No signed pre-key found' });
    }

    // Atomic pre-key consumption using transaction (prevents race conditions)
    // This ensures two concurrent requests don't get the same pre-key
    const result = await prisma.$transaction(async (tx) => {
      // Find and immediately mark as used in one atomic operation
      const preKey = await tx.preKey.findFirst({
        where: {
          user_id: userId,
          device_id: identityKey.device_id,
          used: false,
        },
        orderBy: { key_id: 'asc' },
      });

      if (preKey) {
        await tx.preKey.update({
          where: { id: preKey.id },
          data: { used: true },
        });
      }

      // Count remaining in same transaction for consistency
      const remainingPreKeys = await tx.preKey.count({
        where: {
          user_id: userId,
          device_id: identityKey.device_id,
          used: false,
        },
      });

      return { preKey, remainingPreKeys };
    });

    // Warn if pre-key pool is running low (production best practice)
    const lowPoolThreshold = 10;
    const headers: Record<string, string> = {};
    if (result.remainingPreKeys < lowPoolThreshold) {
      headers['X-PreKey-Count'] = result.remainingPreKeys.toString();
      headers['X-PreKey-Warning'] = 'LOW_PREKEY_POOL';
    }

    // Set headers if any
    Object.entries(headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    return res.json({
      user_id: userId,
      device_id: identityKey.device_id,
      registration_id: identityKey.registration_id,
      identity_key: identityKey.identity_key,
      signed_pre_key: {
        key_id: signedPreKey.key_id,
        public_key: signedPreKey.public_key,
        signature: signedPreKey.signature,
      },
      pre_key: result.preKey
        ? { key_id: result.preKey.key_id, public_key: result.preKey.public_key }
        : null,
      remaining_pre_keys: result.remainingPreKeys,
    });
  } catch (error) {
    console.error('Get key bundle error:', error);
    return res.status(500).json({ error: 'Failed to fetch key bundle' });
  }
});

/**
 * GET /keys/count
 * Get remaining pre-key count for the current device.
 * Client should replenish when count drops below threshold (e.g., 10).
 */
router.get('/count', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const count = await prisma.preKey.count({
      where: {
        user_id: req.userId!,
        device_id: req.deviceId!,
        used: false,
      },
    });

    return res.json({ remaining_pre_keys: count });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to get pre-key count' });
  }
});

/**
 * GET /keys/:userId/identity
 * Get the identity key (fingerprint) for a user — used for safety number verification.
 */
router.get('/:userId/identity', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;

    const identityKeys = await prisma.identityKey.findMany({
      where: { user_id: userId },
      select: {
        device_id: true,
        identity_key: true,
        registration_id: true,
        created_at: true,
      },
      orderBy: { created_at: 'desc' },
    });

    if (identityKeys.length === 0) {
      return res.status(404).json({ error: 'No identity keys found for user' });
    }

    return res.json({ user_id: userId, identity_keys: identityKeys });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch identity key' });
  }
});

export default router;
