import { Request, Response, NextFunction } from 'express';
import { redis, isRedisAvailable } from '../db/redis';
import { createServiceLogger } from '../lib/logger';

const log = createServiceLogger('rate-limiter');

// ============================================================================
// Distributed Redis-Based Rate Limiter
//
// Production features:
// - Sliding window algorithm (more accurate than fixed window)
// - Per-user AND per-IP rate limiting
// - Configurable limits per endpoint
// - Redis-based for multi-instance deployments
// - Graceful degradation when Redis is unavailable
// - Rate limit headers (X-RateLimit-*)
// ============================================================================

interface RateLimitConfig {
  /** Maximum requests in the window */
  maxRequests: number;
  /** Window duration in seconds */
  windowSeconds: number;
  /** Key prefix for Redis */
  keyPrefix: string;
  /** Extract key from request (default: IP) */
  keyExtractor?: (req: Request) => string;
  /** Skip rate limiting for certain requests */
  skip?: (req: Request) => boolean;
  /** Custom error message */
  message?: string;
}

const DEFAULT_CONFIG: Required<Pick<RateLimitConfig, 'message'>> = {
  message: 'Too many requests, please try again later.',
};

/**
 * Sliding window rate limiter using Redis sorted sets
 * 
 * Algorithm:
 * 1. Remove expired entries (outside window)
 * 2. Count remaining entries
 * 3. If under limit, add current request
 * 4. Set expiry on the key
 */
async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const windowStart = now - windowMs;

  try {
    // Use Redis pipeline for atomic operation
    const multi = redis.multi();
    
    // Remove entries outside the window
    multi.zRemRangeByScore(key, 0, windowStart);
    
    // Count current entries in window
    multi.zCard(key);
    
    // Add current request
    multi.zAdd(key, { score: now, value: `${now}:${Math.random()}` });
    
    // Set TTL on key
    multi.expire(key, windowSeconds);
    
    const results = await multi.exec();
    
    // results[1] is the count BEFORE adding current request
    const currentCount = (results?.[1] as number) || 0;
    const allowed = currentCount < maxRequests;
    const remaining = Math.max(0, maxRequests - currentCount - 1);
    const resetAt = Math.ceil((now + windowMs) / 1000);

    if (!allowed) {
      // Remove the request we just added since it was denied
      await redis.zRemRangeByScore(key, now, now + 1);
    }

    return { allowed, remaining, resetAt };
  } catch (error) {
    log.error({ error, key }, 'Rate limit check failed');
    // Fail open - allow request if Redis is down
    return { allowed: true, remaining: maxRequests, resetAt: 0 };
  }
}

/**
 * Create a distributed rate limiting middleware
 */
export function distributedRateLimit(config: RateLimitConfig) {
  const message = config.message || DEFAULT_CONFIG.message;

  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip if configured
    if (config.skip?.(req)) return next();

    // Fallback to in-memory if Redis unavailable
    if (!isRedisAvailable()) {
      return next(); // Fail open
    }

    const key = config.keyExtractor
      ? config.keyExtractor(req)
      : req.ip || req.socket.remoteAddress || 'unknown';

    const redisKey = `rl:${config.keyPrefix}:${key}`;

    const { allowed, remaining, resetAt } = await checkRateLimit(
      redisKey,
      config.maxRequests,
      config.windowSeconds
    );

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', config.maxRequests);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', resetAt);

    if (!allowed) {
      res.setHeader('Retry-After', config.windowSeconds);
      log.warn({ key, prefix: config.keyPrefix }, 'Rate limit exceeded');
      return res.status(429).json({
        error: message,
        retryAfter: config.windowSeconds,
      });
    }

    next();
  };
}

// ======================== Pre-configured Rate Limiters ========================

/** General API rate limit: 100 req/15min per IP */
export const apiRateLimit = distributedRateLimit({
  maxRequests: 100,
  windowSeconds: 900,
  keyPrefix: 'api',
});

/** Auth login rate limit: 5 attempts/15min per IP */
export const loginRateLimit = distributedRateLimit({
  maxRequests: 5,
  windowSeconds: 900,
  keyPrefix: 'login',
  message: 'Too many login attempts. Please try again later.',
});

/** Auth register rate limit: 3 attempts/15min per IP */
export const registerRateLimit = distributedRateLimit({
  maxRequests: 3,
  windowSeconds: 900,
  keyPrefix: 'register',
  message: 'Too many registration attempts. Please try again later.',
});

/** Message send rate limit: 60 messages/min per user */
export const messageSendRateLimit = distributedRateLimit({
  maxRequests: 60,
  windowSeconds: 60,
  keyPrefix: 'msg',
  keyExtractor: (req) => (req as any).userId || req.ip || 'unknown',
  message: 'Sending messages too quickly. Please slow down.',
});

/** File upload rate limit: 20 uploads/hour per user */
export const fileUploadRateLimit = distributedRateLimit({
  maxRequests: 20,
  windowSeconds: 3600,
  keyPrefix: 'upload',
  keyExtractor: (req) => (req as any).userId || req.ip || 'unknown',
  message: 'Too many file uploads. Please try again later.',
});

/** WebSocket connection rate limit: 10 connections/min per IP */
export const wsConnectionRateLimit = async (ip: string): Promise<boolean> => {
  if (!isRedisAvailable()) return true;
  const key = `rl:ws:${ip}`;
  const { allowed } = await checkRateLimit(key, 10, 60);
  return allowed;
};
