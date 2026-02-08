import { createClient } from 'redis';
import { config } from '../config';

export const redis = createClient({
  url: config.redis.url,
});

redis.on('error', (err) => {
  console.error('Redis Client Error:', err);
});

redis.on('connect', () => {
  console.log('Connected to Redis');
});

export const connectRedis = async () => {
  await redis.connect();
};
