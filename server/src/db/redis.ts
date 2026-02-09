import { createClient, RedisClientType } from 'redis';
import { config } from '../config';

// Production-ready Redis configuration with retry logic and graceful degradation
export const redis: RedisClientType = createClient({
  url: config.redis.url,
  socket: {
    // Connection timeout
    connectTimeout: 5000,
    // Reconnection strategy with exponential backoff
    reconnectStrategy: (retries: number) => {
      if (retries > 10) {
        console.error('Redis: Max reconnection attempts reached');
        return new Error('Max reconnection attempts reached');
      }
      // Exponential backoff: 100ms, 200ms, 400ms, ... up to 30s
      const delay = Math.min(100 * Math.pow(2, retries), 30000);
      console.log(`Redis: Reconnecting in ${delay}ms (attempt ${retries + 1})`);
      return delay;
    },
    // Keep-alive for connection health
    keepAlive: 30000,
  },
});

// Track connection state for graceful degradation
let isRedisConnected = false;

redis.on('error', (err) => {
  console.error('Redis Client Error:', err.message);
  isRedisConnected = false;
});

redis.on('connect', () => {
  console.log('Redis: Connecting...');
});

redis.on('ready', () => {
  console.log('Redis: Connected and ready');
  isRedisConnected = true;
});

redis.on('reconnecting', () => {
  console.log('Redis: Reconnecting...');
  isRedisConnected = false;
});

redis.on('end', () => {
  console.log('Redis: Connection closed');
  isRedisConnected = false;
});

export const connectRedis = async () => {
  try {
    await redis.connect();
  } catch (error) {
    console.error('Redis: Initial connection failed:', (error as Error).message);
    // Don't throw - allow server to start without Redis
  }
};

// Check if Redis is available for operations
export const isRedisAvailable = (): boolean => isRedisConnected;

// Safe wrapper for Redis operations (graceful degradation)
export async function safeRedisOp<T>(
  operation: () => Promise<T>,
  fallback: T
): Promise<T> {
  if (!isRedisConnected) {
    return fallback;
  }
  try {
    return await operation();
  } catch (error) {
    console.error('Redis operation failed:', (error as Error).message);
    return fallback;
  }
}
