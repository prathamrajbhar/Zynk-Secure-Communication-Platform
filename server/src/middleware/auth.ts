import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config';
import prisma from '../db/client';
import { redis, isRedisAvailable } from '../db/redis';

export interface AuthRequest extends Request {
  userId?: string;
  deviceId?: string;
}

// Session cache TTL in seconds (5 minutes)
const SESSION_CACHE_TTL = 300;

/**
 * Authentication middleware with session validation and Redis caching.
 * 
 * SECURITY IMPROVEMENTS:
 * 1. Token only accepted from Authorization header (not query string)
 * 2. Session validated against database (supports revocation)
 * 3. Expired sessions are rejected even if JWT is still valid
 * 4. Redis caching reduces DB load (with graceful degradation)
 */
export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    // SECURITY: Only accept token from Authorization header, never from query strings
    // Query string tokens leak into logs, browser history, and referrer headers
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, config.jwt.secret) as { userId: string; deviceId: string };

    // Check Redis cache first (if available)
    // SECURITY: Use SHA-256 hash of token as cache key.
    // Previously used token.substring(0,32) which is IDENTICAL for all HS256 JWTs
    // (the first 32 chars are the base64-encoded JWT header — same for every token).
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex').substring(0, 32);
    const cacheKey = `session:${tokenHash}`;
    let sessionValid = false;

    if (isRedisAvailable()) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached === 'valid') {
          sessionValid = true;
        } else if (cached === 'invalid') {
          return res.status(401).json({ error: 'Session expired or revoked' });
        }
      } catch {
        // Redis error - fall through to DB check
      }
    }

    // If not cached, validate session in database
    if (!sessionValid) {
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
        // Cache invalid result
        if (isRedisAvailable()) {
          try {
            await redis.setEx(cacheKey, SESSION_CACHE_TTL, 'invalid');
          } catch { /* ignore cache errors */ }
        }
        return res.status(401).json({ error: 'Session expired or revoked' });
      }

      // Cache valid session
      if (isRedisAvailable()) {
        try {
          await redis.setEx(cacheKey, SESSION_CACHE_TTL, 'valid');
        } catch { /* ignore cache errors */ }
      }
    }

    req.userId = decoded.userId;
    req.deviceId = decoded.deviceId;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: 'Token expired' });
    }
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

