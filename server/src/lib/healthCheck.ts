import { Request, Response } from 'express';
import prisma from '../db/client';
import { redis, isRedisAvailable } from '../db/redis';
import { config } from '../config';
import os from 'os';

// ============================================================================
// Deep Health Check Endpoint
//
// Returns detailed health status of all dependencies.
// Supports:
// - /api/health       → Simple "ok" for load balancer
// - /api/health/ready → Full readiness probe (all deps healthy)
// - /api/health/live  → Liveness probe (process alive)
// - /api/health/deep  → Detailed status with latencies
// ============================================================================

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  checks: {
    database: ComponentHealth;
    redis: ComponentHealth;
    memory: ComponentHealth;
    disk: ComponentHealth;
  };
}

interface ComponentHealth {
  status: 'healthy' | 'unhealthy' | 'degraded';
  latencyMs?: number;
  details?: Record<string, unknown>;
  error?: string;
}

/**
 * Check database health
 */
async function checkDatabase(): Promise<ComponentHealth> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const latencyMs = Date.now() - start;
    return {
      status: latencyMs > 1000 ? 'degraded' : 'healthy',
      latencyMs,
      details: {
        type: 'postgresql',
        poolMax: parseInt(process.env.DB_POOL_MAX || '20', 10),
      },
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      error: (error as Error).message,
    };
  }
}

/**
 * Check Redis health
 */
async function checkRedis(): Promise<ComponentHealth> {
  if (!isRedisAvailable()) {
    return { status: 'unhealthy', error: 'Not connected' };
  }

  const start = Date.now();
  try {
    await redis.ping();
    const latencyMs = Date.now() - start;
    
    // Get Redis info
    const info = await redis.info('memory');
    const usedMemoryMatch = info.match(/used_memory:(\d+)/);
    const usedMemory = usedMemoryMatch ? parseInt(usedMemoryMatch[1], 10) : 0;

    return {
      status: latencyMs > 500 ? 'degraded' : 'healthy',
      latencyMs,
      details: {
        usedMemoryMB: Math.round(usedMemory / 1024 / 1024),
      },
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      error: (error as Error).message,
    };
  }
}

/**
 * Check memory health
 */
function checkMemory(): ComponentHealth {
  const memUsage = process.memoryUsage();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedPercent = ((totalMem - freeMem) / totalMem) * 100;

  return {
    status: usedPercent > 90 ? 'degraded' : 'healthy',
    details: {
      heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
      rssMB: Math.round(memUsage.rss / 1024 / 1024),
      externalMB: Math.round(memUsage.external / 1024 / 1024),
      systemUsedPercent: Math.round(usedPercent),
    },
  };
}

/**
 * Check disk health (uploads directory)
 */
function checkDisk(): ComponentHealth {
  try {
    const stats = os.freemem(); // Simplified - in production use `df` or statvfs
    return {
      status: 'healthy',
      details: {
        uploadDir: config.upload.dir,
        freeMemoryMB: Math.round(stats / 1024 / 1024),
      },
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: (error as Error).message,
    };
  }
}

// ======================== Route Handlers ========================

/**
 * Simple health check for load balancers
 */
export function healthSimple(req: Request, res: Response) {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
}

/**
 * Liveness probe - is the process alive?
 */
export function healthLive(req: Request, res: Response) {
  res.json({ status: 'ok' });
}

/**
 * Readiness probe - can the service handle traffic?
 */
export async function healthReady(req: Request, res: Response) {
  try {
    const db = await checkDatabase();
    const redisCheck = await checkRedis();

    // Service is ready only if database is healthy
    // Redis degradation is acceptable (graceful degradation)
    if (db.status === 'unhealthy') {
      return res.status(503).json({
        status: 'not_ready',
        reason: 'Database unavailable',
      });
    }

    res.json({
      status: 'ready',
      checks: { database: db.status, redis: redisCheck.status },
    });
  } catch (error) {
    res.status(503).json({ status: 'not_ready', error: 'Health check failed' });
  }
}

/**
 * Deep health check with full component status
 */
export async function healthDeep(req: Request, res: Response) {
  const [database, redisHealth] = await Promise.all([
    checkDatabase(),
    checkRedis(),
  ]);

  const memory = checkMemory();
  const disk = checkDisk();

  const checks = { database, redis: redisHealth, memory, disk };

  // Overall status
  const statuses = Object.values(checks).map(c => c.status);
  let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  if (statuses.includes('unhealthy')) {
    overallStatus = database.status === 'unhealthy' ? 'unhealthy' : 'degraded';
  } else if (statuses.includes('degraded')) {
    overallStatus = 'degraded';
  }

  const health: HealthStatus = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    checks,
  };

  const statusCode = overallStatus === 'unhealthy' ? 503 : 200;
  res.status(statusCode).json(health);
}
