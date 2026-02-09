import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { config } from '../config';
import prisma from '../db/client';
import { redis, isRedisAvailable } from '../db/redis';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { Platform } from '@prisma/client';

import { registerPushToken } from '../services/pushNotification';

const router = Router();

// Validation schemas
const registerSchema = z.object({
  username: z.string().min(3).max(64).regex(/^[a-zA-Z0-9_]+$/, 'Username must contain only letters, numbers, and underscores'),
  password: config.nodeEnv === 'production'
    ? z.string()
      .min(8, 'Password must be at least 8 characters')
      .max(128)
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number')
      .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character')
    : z.string().min(4), // Relaxed for development
  device_name: z.string().optional().default('Web Browser'),
  device_fingerprint: z.string().optional(),
  public_key: z.string().optional(),
});

const loginSchema = z.object({
  username: z.string().min(3).max(64),
  password: z.string().min(1).max(128),
  device_fingerprint: z.string().optional(),
  device_name: z.string().optional().default('Web Browser'),
});

// Generate tokens
function generateTokens(userId: string, deviceId: string) {
  const sessionToken = jwt.sign(
    { userId, deviceId },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn as any }
  );
  const refreshToken = jwt.sign(
    { userId, deviceId, type: 'refresh' },
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshExpiresIn as any }
  );
  return { sessionToken, refreshToken };
}

// POST /auth/register
router.post('/register', validate(registerSchema), async (req, res: Response) => {
  try {
    const { username, password, device_name, device_fingerprint, public_key } = req.body;

    // Check if username exists
    const existingUser = await prisma.user.findUnique({
      where: { username },
      select: { id: true }
    });

    if (existingUser) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    // Hash password with configurable cost factor
    const passwordHash = await bcrypt.hash(password, config.security.bcryptRounds);

    // Create user, profile, and device in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username,
          password_hash: passwordHash,
          public_key: public_key || '',
          profile: {
            create: {
              display_name: username,
            }
          }
        }
      });

      const fingerprint = device_fingerprint || uuidv4();
      const device = await tx.device.create({
        data: {
          user_id: user.id,
          device_name,
          device_fingerprint: fingerprint,
          platform: 'web' as Platform,
          last_active_at: new Date(),
        }
      });

      return { user, device };
    });

    const { user, device } = result;

    // Generate tokens
    const { sessionToken, refreshToken } = generateTokens(user.id, device.id);

    // Store session with shorter expiry
    const expiresAt = new Date(Date.now() + config.security.sessionExpiryMs);
    const refreshExpiresAt = new Date(Date.now() + config.security.refreshExpiryMs);

    await prisma.session.create({
      data: {
        user_id: user.id,
        device_id: device.id,
        session_token: sessionToken,
        refresh_token: refreshToken,
        expires_at: expiresAt,
        refresh_expires_at: refreshExpiresAt,
      }
    });

    return res.status(201).json({
      user_id: user.id,
      username,
      session_token: sessionToken,
      refresh_token: refreshToken,
      expires_at: Math.floor(expiresAt.getTime() / 1000),
    });
  } catch (error) {
    console.error('Register error:', error);
    // SECURITY: Generic error message to prevent information disclosure
    return res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /auth/login
router.post('/login', validate(loginSchema), async (req, res: Response) => {
  try {
    const { username, password, device_fingerprint, device_name } = req.body;

    // Find user
    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true, password_hash: true }
    });

    // SECURITY: Use constant-time error response for both "user not found" and "wrong password"
    // to prevent username enumeration attacks
    if (!user) {
      // Still run bcrypt.compare against a dummy hash to prevent timing attacks
      await bcrypt.compare(password, '$2a$12$LJ3m4YZ9K8a2Q0v5P1r0Ue.dummy.hash.to.prevent.timing.attacks');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Find or create device
    const fingerprint = device_fingerprint || uuidv4();
    let device = await prisma.device.findFirst({
      where: {
        user_id: user.id,
        device_fingerprint: fingerprint
      }
    });

    if (!device) {
      // Enforce 5-device limit per MVP spec
      const deviceCount = await prisma.device.count({ where: { user_id: user.id } });
      if (deviceCount >= config.security.maxDevices) {
        // Return the list of devices so the client can let the user pick one to remove
        const devices = await prisma.device.findMany({
          where: { user_id: user.id },
          select: {
            id: true,
            device_name: true,
            platform: true,
            last_active_at: true,
            created_at: true,
          },
          orderBy: { last_active_at: 'desc' },
        });
        return res.status(403).json({
          error: `Maximum of ${config.security.maxDevices} devices reached. Remove a device to sign in on this one.`,
          code: 'MAX_DEVICES_REACHED',
          max_devices: config.security.maxDevices,
          devices,
        });
      }

      device = await prisma.device.create({
        data: {
          user_id: user.id,
          device_name: device_name || 'Web Browser',
          device_fingerprint: fingerprint,
          platform: 'web' as Platform,
          last_active_at: new Date(),
        }
      });
    } else {
      await prisma.device.update({
        where: { id: device.id },
        data: { last_active_at: new Date() }
      });
    }

    const deviceId = device.id;

    // Generate tokens
    const { sessionToken, refreshToken } = generateTokens(user.id, deviceId);

    // Transaction for session management and last seen update
    const expiresAt = new Date(Date.now() + config.security.sessionExpiryMs);
    const refreshExpiresAt = new Date(Date.now() + config.security.refreshExpiryMs);

    await prisma.$transaction([
      // Delete old sessions for this device
      prisma.session.deleteMany({
        where: { device_id: deviceId }
      }),
      // Store new session
      prisma.session.create({
        data: {
          user_id: user.id,
          device_id: deviceId,
          session_token: sessionToken,
          refresh_token: refreshToken,
          expires_at: expiresAt,
          refresh_expires_at: refreshExpiresAt,
        }
      }),
      // Update profile last seen
      prisma.userProfile.update({
        where: { user_id: user.id },
        data: { last_seen_at: new Date() }
      })
    ]);

    return res.status(200).json({
      user_id: user.id,
      session_token: sessionToken,
      refresh_token: refreshToken,
      device_id: deviceId,
      expires_at: Math.floor(expiresAt.getTime() / 1000),
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Login failed' });
  }
});

// Validation schema for force-login
const forceLoginSchema = z.object({
  username: z.string().min(3).max(64),
  password: z.string().min(1).max(128),
  remove_device_id: z.string().uuid('Invalid device ID'),
  device_fingerprint: z.string().optional(),
  device_name: z.string().optional().default('Web Browser'),
});

// POST /auth/force-login — remove a device and login when at max device limit
router.post('/force-login', validate(forceLoginSchema), async (req, res: Response) => {
  try {
    const { username, password, remove_device_id, device_fingerprint, device_name } = req.body;

    // Find user
    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true, password_hash: true }
    });

    if (!user) {
      await bcrypt.compare(password, '$2a$12$LJ3m4YZ9K8a2Q0v5P1r0Ue.dummy.hash.to.prevent.timing.attacks');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify the device to remove belongs to this user
    const deviceToRemove = await prisma.device.findFirst({
      where: { id: remove_device_id, user_id: user.id }
    });

    if (!deviceToRemove) {
      return res.status(404).json({ error: 'Device not found or does not belong to this user' });
    }

    // Remove the device and its sessions, then create new device + session in one transaction
    const fingerprint = device_fingerprint || uuidv4();

    const result = await prisma.$transaction(async (tx) => {
      // Invalidate sessions of the removed device in Redis
      const removedSessions = await tx.session.findMany({
        where: { device_id: remove_device_id, user_id: user.id },
        select: { session_token: true }
      });

      // Delete sessions and device being removed
      await tx.session.deleteMany({ where: { device_id: remove_device_id, user_id: user.id } });
      await tx.device.delete({ where: { id: remove_device_id } });

      // Find or create new device
      let device = await tx.device.findFirst({
        where: { user_id: user.id, device_fingerprint: fingerprint }
      });

      if (!device) {
        device = await tx.device.create({
          data: {
            user_id: user.id,
            device_name: device_name || 'Web Browser',
            device_fingerprint: fingerprint,
            platform: 'web' as Platform,
            last_active_at: new Date(),
          }
        });
      } else {
        device = await tx.device.update({
          where: { id: device.id },
          data: { last_active_at: new Date() }
        });
      }

      // Generate tokens
      const { sessionToken, refreshToken } = generateTokens(user.id, device.id);
      const expiresAt = new Date(Date.now() + config.security.sessionExpiryMs);
      const refreshExpiresAt = new Date(Date.now() + config.security.refreshExpiryMs);

      // Delete old sessions for this device, create new one, update profile
      await tx.session.deleteMany({ where: { device_id: device.id } });
      await tx.session.create({
        data: {
          user_id: user.id,
          device_id: device.id,
          session_token: sessionToken,
          refresh_token: refreshToken,
          expires_at: expiresAt,
          refresh_expires_at: refreshExpiresAt,
        }
      });
      await tx.userProfile.update({
        where: { user_id: user.id },
        data: { last_seen_at: new Date() }
      });

      return { device, sessionToken, refreshToken, expiresAt, removedSessions };
    });

    // Invalidate removed device sessions in Redis (outside transaction)
    if (isRedisAvailable()) {
      try {
        const crypto = await import('crypto');
        for (const session of result.removedSessions) {
          const tokenHash = crypto.createHash('sha256').update(session.session_token).digest('hex').substring(0, 32);
          const cacheKey = `session:${tokenHash}`;
          await redis.setEx(cacheKey, 300, 'invalid');
        }
      } catch {
        // Redis error is non-fatal
      }
    }

    return res.status(200).json({
      user_id: user.id,
      session_token: result.sessionToken,
      refresh_token: result.refreshToken,
      device_id: result.device.id,
      removed_device_id: remove_device_id,
      expires_at: Math.floor(result.expiresAt.getTime() / 1000),
    });
  } catch (error) {
    console.error('Force-login error:', error);
    return res.status(500).json({ error: 'Force login failed' });
  }
});

// POST /auth/refresh
router.post('/refresh', async (req, res: Response) => {
  try {
    // Accept refresh token from Authorization header OR request body
    const authHeader = req.headers.authorization;
    let token: string | undefined;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.body?.refresh_token) {
      token = req.body.refresh_token;
    }

    if (!token) {
      return res.status(401).json({ error: 'Refresh token required' });
    }
    const decoded = jwt.verify(token, config.jwt.refreshSecret) as { userId: string; deviceId: string };

    // Verify session exists
    const session = await prisma.session.findFirst({
      where: {
        user_id: decoded.userId,
        device_id: decoded.deviceId,
        refresh_token: token
      }
    });

    if (!session) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    // Generate new tokens
    const { sessionToken, refreshToken } = generateTokens(decoded.userId, decoded.deviceId);

    // Update session
    const expiresAt = new Date(Date.now() + config.security.sessionExpiryMs);
    const refreshExpiresAt = new Date(Date.now() + config.security.refreshExpiryMs);

    await prisma.session.update({
      where: { id: session.id },
      data: {
        session_token: sessionToken,
        refresh_token: refreshToken,
        expires_at: expiresAt,
        refresh_expires_at: refreshExpiresAt,
        last_used_at: new Date(),
      }
    });

    return res.status(200).json({
      session_token: sessionToken,
      refresh_token: refreshToken,
      expires_at: Math.floor(expiresAt.getTime() / 1000),
    });
  } catch (error) {
    return res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// POST /auth/logout
router.post('/logout', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    // Get the session token from the Authorization header to invalidate its cache
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    // Delete session from database
    await prisma.session.deleteMany({
      where: {
        user_id: req.userId,
        device_id: req.deviceId
      }
    });

    // Invalidate Redis session cache so the token is immediately rejected
    if (token && isRedisAvailable()) {
      try {
        const crypto = await import('crypto');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex').substring(0, 32);
        const cacheKey = `session:${tokenHash}`;
        await redis.setEx(cacheKey, 300, 'invalid');
      } catch {
        // Redis error is non-fatal
      }
    }

    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ error: 'Logout failed' });
  }
});

// POST /auth/logout-all — logout from all devices
router.post('/logout-all', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    // Get all session tokens for this user to invalidate Redis cache
    const sessions = await prisma.session.findMany({
      where: { user_id: req.userId },
      select: { session_token: true }
    });

    await prisma.session.deleteMany({
      where: { user_id: req.userId }
    });

    // Invalidate all session caches in Redis
    if (isRedisAvailable()) {
      try {
        const crypto = await import('crypto');
        for (const session of sessions) {
          const tokenHash = crypto.createHash('sha256').update(session.session_token).digest('hex').substring(0, 32);
          const cacheKey = `session:${tokenHash}`;
          await redis.setEx(cacheKey, 300, 'invalid');
        }
      } catch {
        // Redis error is non-fatal
      }
    }

    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ error: 'Failed to logout from all devices' });
  }
});

// GET /auth/devices
router.get('/devices', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const devices = await prisma.device.findMany({
      where: { user_id: req.userId },
      select: {
        id: true,
        device_name: true,
        platform: true,
        last_active_at: true,
        created_at: true
      },
      orderBy: { last_active_at: 'desc' }
    });
    return res.json({ devices });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch devices' });
  }
});

// DELETE /auth/devices/:deviceId
router.delete('/devices/:deviceId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;

    await prisma.$transaction([
      prisma.session.deleteMany({
        where: {
          device_id: deviceId,
          user_id: req.userId
        }
      }),
      prisma.device.deleteMany({
        where: {
          id: deviceId,
          user_id: req.userId
        }
      })
    ]);

    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ error: 'Failed to delete device' });
  }
});

// POST /auth/devices/push-token — register push notification token for current device
router.post('/devices/push-token', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { push_token } = req.body;
    if (!push_token || typeof push_token !== 'string') {
      return res.status(400).json({ error: 'push_token required' });
    }
    await registerPushToken(req.deviceId!, push_token);
    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to register push token' });
  }
});

// GET /auth/me - get current user info
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        username: true,
        created_at: true,
        profile: {
          select: {
            display_name: true,
            avatar_url: true,
            bio: true,
            privacy_settings: true
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Flattening the user profile like the previous response
    const response = {
      id: user.id,
      username: user.username,
      created_at: user.created_at,
      display_name: user.profile?.display_name,
      avatar_url: user.profile?.avatar_url,
      bio: user.profile?.bio,
      privacy_settings: user.profile?.privacy_settings
    };

    return res.json(response);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch user' });
  }
});

export default router;
