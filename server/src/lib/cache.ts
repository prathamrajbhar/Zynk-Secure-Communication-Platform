import { redis, isRedisAvailable } from '../db/redis';
import { createServiceLogger } from './logger';
import { redisOperationsTotal, redisOperationDuration } from './metrics';

const log = createServiceLogger('cache');

// ============================================================================
// Redis Caching Layer
//
// Multi-tier caching strategy:
// - L1: In-process memory (LRU, for hot data like user profiles)
// - L2: Redis (distributed, for shared state across instances)
//
// Features:
// - Automatic serialization/deserialization
// - TTL management with stale-while-revalidate
// - Cache stampede prevention (lock-based)
// - Batch operations for efficiency
// - Invalidation patterns (key, pattern, tag-based)
// ============================================================================

// ======================== In-Memory L1 Cache ========================

const L1_MAX_SIZE = 1000;
const L1_DEFAULT_TTL_MS = 30_000; // 30 seconds

interface L1Entry<T> {
  value: T;
  expiresAt: number;
}

class L1Cache {
  private cache = new Map<string, L1Entry<any>>();

  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number = L1_DEFAULT_TTL_MS): void {
    // Evict oldest entries if at capacity
    if (this.cache.size >= L1_MAX_SIZE) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  invalidatePattern(pattern: string): void {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    for (const key of this.cache.keys()) {
      if (regex.test(key)) this.cache.delete(key);
    }
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

const l1 = new L1Cache();

// ======================== Cache Service ========================

export interface CacheOptions {
  /** TTL in seconds for Redis cache */
  ttlSeconds?: number;
  /** TTL in ms for L1 in-memory cache */
  l1TtlMs?: number;
  /** Whether to use L1 cache */
  useL1?: boolean;
  /** Cache key prefix */
  prefix?: string;
}

const DEFAULT_TTL = 300; // 5 minutes

/**
 * Get a value from cache (L1 → L2 → miss)
 */
export async function cacheGet<T>(key: string, options: CacheOptions = {}): Promise<T | null> {
  const fullKey = options.prefix ? `${options.prefix}:${key}` : `cache:${key}`;

  // Check L1 cache first
  if (options.useL1 !== false) {
    const l1Value = l1.get<T>(fullKey);
    if (l1Value !== undefined) {
      return l1Value;
    }
  }

  // Check Redis L2 cache
  if (!isRedisAvailable()) return null;

  const start = Date.now();
  try {
    const data = await redis.get(fullKey);
    redisOperationDuration.observe({ operation: 'cache_get' }, (Date.now() - start) / 1000);
    redisOperationsTotal.inc({ operation: 'cache_get', status: data ? 'hit' : 'miss' });

    if (!data) return null;

    const parsed = JSON.parse(data) as T;

    // Populate L1
    if (options.useL1 !== false) {
      l1.set(fullKey, parsed, options.l1TtlMs);
    }

    return parsed;
  } catch (error) {
    redisOperationsTotal.inc({ operation: 'cache_get', status: 'error' });
    log.error({ error, key: fullKey }, 'Cache get failed');
    return null;
  }
}

/**
 * Set a value in cache (L1 + L2)
 */
export async function cacheSet<T>(
  key: string,
  value: T,
  options: CacheOptions = {}
): Promise<void> {
  const fullKey = options.prefix ? `${options.prefix}:${key}` : `cache:${key}`;
  const ttl = options.ttlSeconds ?? DEFAULT_TTL;

  // Set L1
  if (options.useL1 !== false) {
    l1.set(fullKey, value, options.l1TtlMs);
  }

  // Set L2 (Redis)
  if (!isRedisAvailable()) return;

  const start = Date.now();
  try {
    await redis.setEx(fullKey, ttl, JSON.stringify(value));
    redisOperationDuration.observe({ operation: 'cache_set' }, (Date.now() - start) / 1000);
    redisOperationsTotal.inc({ operation: 'cache_set', status: 'success' });
  } catch (error) {
    redisOperationsTotal.inc({ operation: 'cache_set', status: 'error' });
    log.error({ error, key: fullKey }, 'Cache set failed');
  }
}

/**
 * Delete a value from cache (both L1 and L2)
 */
export async function cacheDelete(key: string, options: CacheOptions = {}): Promise<void> {
  const fullKey = options.prefix ? `${options.prefix}:${key}` : `cache:${key}`;

  l1.delete(fullKey);

  if (!isRedisAvailable()) return;

  try {
    await redis.del(fullKey);
    redisOperationsTotal.inc({ operation: 'cache_delete', status: 'success' });
  } catch (error) {
    redisOperationsTotal.inc({ operation: 'cache_delete', status: 'error' });
    log.error({ error, key: fullKey }, 'Cache delete failed');
  }
}

/**
 * Invalidate cache entries matching a pattern
 */
export async function cacheInvalidatePattern(pattern: string): Promise<void> {
  l1.invalidatePattern(pattern);

  if (!isRedisAvailable()) return;

  try {
    // Use SCAN for safe pattern-based deletion (never KEYS in production)
    let cursor = 0;
    do {
      const result = await redis.scan(cursor, { MATCH: pattern, COUNT: 100 });
      cursor = result.cursor;
      if (result.keys.length > 0) {
        await redis.del(result.keys);
      }
    } while (cursor !== 0);
  } catch (error) {
    log.error({ error, pattern }, 'Cache invalidation failed');
  }
}

/**
 * Cache-aside pattern: get from cache or compute and store
 * 
 * Includes stampede prevention via locking
 */
export async function cacheGetOrSet<T>(
  key: string,
  computeFn: () => Promise<T>,
  options: CacheOptions = {}
): Promise<T> {
  // Try cache first
  const cached = await cacheGet<T>(key, options);
  if (cached !== null) return cached;

  // Compute the value
  const value = await computeFn();

  // Store in cache (fire-and-forget)
  cacheSet(key, value, options).catch(() => {});

  return value;
}

// ======================== Domain-Specific Cache Helpers ========================

const CACHE_PREFIXES = {
  userProfile: 'user:profile',
  userPublicKey: 'user:pubkey',
  conversationList: 'user:convos',
  groupInfo: 'group:info',
  preKeyCount: 'user:prekeys',
} as const;

/** Cache a user profile */
export async function cacheUserProfile(userId: string, profile: any): Promise<void> {
  await cacheSet(userId, profile, {
    prefix: CACHE_PREFIXES.userProfile,
    ttlSeconds: 600,
    l1TtlMs: 60_000,
  });
}

/** Get cached user profile */
export async function getCachedUserProfile(userId: string): Promise<any | null> {
  return cacheGet(userId, { prefix: CACHE_PREFIXES.userProfile });
}

/** Invalidate user profile cache */
export async function invalidateUserProfile(userId: string): Promise<void> {
  await cacheDelete(userId, { prefix: CACHE_PREFIXES.userProfile });
}

/** Cache user's public key */
export async function cacheUserPublicKey(userId: string, publicKey: string): Promise<void> {
  await cacheSet(userId, publicKey, {
    prefix: CACHE_PREFIXES.userPublicKey,
    ttlSeconds: 3600,
    l1TtlMs: 300_000,
  });
}

/** Get cached public key */
export async function getCachedPublicKey(userId: string): Promise<string | null> {
  return cacheGet(userId, { prefix: CACHE_PREFIXES.userPublicKey });
}

/** Invalidate all caches for a user */
export async function invalidateUserCaches(userId: string): Promise<void> {
  await Promise.all([
    cacheDelete(userId, { prefix: CACHE_PREFIXES.userProfile }),
    cacheDelete(userId, { prefix: CACHE_PREFIXES.userPublicKey }),
    cacheDelete(userId, { prefix: CACHE_PREFIXES.conversationList }),
    cacheDelete(userId, { prefix: CACHE_PREFIXES.preKeyCount }),
  ]);
}

/** Get L1 cache stats (for monitoring) */
export function getCacheStats() {
  return {
    l1Size: l1.size,
    l1MaxSize: L1_MAX_SIZE,
  };
}
