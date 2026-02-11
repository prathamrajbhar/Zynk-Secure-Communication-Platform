import { Request, Response, NextFunction } from 'express';
import { redis, isRedisAvailable } from '../db/redis';
import { createServiceLogger } from '../lib/logger';

const log = createServiceLogger('idempotency');

// ============================================================================
// Idempotency Key Middleware
//
// Prevents duplicate operations (especially message sends) by tracking
// unique idempotency keys. If the same key is seen twice:
// - Returns the cached response from the first execution
// - Never executes the handler again
//
// Usage:
//   Client sends header:  X-Idempotency-Key: <unique-uuid>
//   Server caches result for 24 hours
//
// Critical for:
// - Message sends (prevents duplicate messages on network retry)
// - Payment operations
// - File uploads
// - Any non-idempotent mutation
// ============================================================================

const IDEMPOTENCY_TTL = 86400; // 24 hours in seconds

interface CachedResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: any;
}

/**
 * Idempotency key middleware
 * 
 * Attach to mutation endpoints (POST, PUT, PATCH, DELETE) where
 * duplicate execution could cause problems.
 */
export function idempotencyKey(req: Request, res: Response, next: NextFunction) {
  const key = req.headers['x-idempotency-key'] as string;

  // If no idempotency key provided, proceed normally
  if (!key) return next();

  // Validate key format (should be a UUID or similar)
  if (key.length < 8 || key.length > 128) {
    return res.status(400).json({
      error: 'Invalid idempotency key. Must be 8-128 characters.',
    });
  }

  if (!isRedisAvailable()) {
    // Without Redis, we can't guarantee idempotency
    // Proceed but log warning
    log.warn({ key }, 'Redis unavailable - idempotency not enforced');
    return next();
  }

  const userId = (req as any).userId || 'anonymous';
  const cacheKey = `idempotency:${userId}:${key}`;

  // Check for existing response
  handleIdempotency(cacheKey, req, res, next);
}

async function handleIdempotency(
  cacheKey: string,
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // Try to set a lock (NX = only if not exists)
    const lockKey = `${cacheKey}:lock`;
    const acquired = await redis.set(lockKey, 'processing', {
      NX: true,
      EX: 60, // Lock expires in 60 seconds (for long-running requests)
    });

    if (!acquired) {
      // Check if there's already a cached response
      const cached = await redis.get(cacheKey);
      if (cached) {
        const cachedResponse: CachedResponse = JSON.parse(cached);
        log.info({ cacheKey }, 'Returning cached idempotent response');
        
        // Set headers
        Object.entries(cachedResponse.headers).forEach(([k, v]) => {
          res.setHeader(k, v);
        });
        res.setHeader('X-Idempotent-Replayed', 'true');
        
        return res.status(cachedResponse.statusCode).json(cachedResponse.body);
      }

      // Still processing from another request
      return res.status(409).json({
        error: 'Request with this idempotency key is still being processed.',
      });
    }

    // Intercept response to cache it
    const originalJson = res.json.bind(res);
    res.json = function (body: any) {
      // Cache the response
      const cachedResponse: CachedResponse = {
        statusCode: res.statusCode,
        headers: {
          'content-type': 'application/json',
        },
        body,
      };

      // Store asynchronously
      redis.setEx(cacheKey, IDEMPOTENCY_TTL, JSON.stringify(cachedResponse))
        .then(() => redis.del(`${cacheKey}:lock`))
        .catch((err) => log.error({ err, cacheKey }, 'Failed to cache idempotent response'));

      return originalJson(body);
    };

    next();
  } catch (error) {
    log.error({ error, cacheKey }, 'Idempotency check failed');
    // Proceed without idempotency on error
    next();
  }
}
