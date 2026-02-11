import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { config } from '../config';
import { createServiceLogger } from '../lib/logger';

const log = createServiceLogger('ws-scaling');

// ============================================================================
// WebSocket Horizontal Scaling via Redis Pub/Sub
//
// When running multiple server instances behind a load balancer, WebSocket
// events need to be broadcast across ALL instances, not just the one
// handling the connection.
//
// Solution: Socket.IO Redis adapter uses Redis Pub/Sub to relay events
// between all server instances.
//
// Architecture:
//   Client ↔ Server1 ↔ Redis Pub/Sub ↔ Server2 ↔ Client
//                                    ↔ Server3 ↔ Client
// ============================================================================

export async function setupRedisAdapter(io: SocketIOServer): Promise<void> {
  if (config.nodeEnv !== 'production' && !process.env.FORCE_REDIS_ADAPTER) {
    log.info('Skipping Redis adapter in non-production mode');
    return;
  }

  try {
    const pubClient = createClient({
      url: config.redis.url,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) return new Error('Max reconnection attempts');
          return Math.min(retries * 100, 3000);
        },
      },
    });

    const subClient = pubClient.duplicate();

    pubClient.on('error', (err) => log.error({ err }, 'Redis adapter pub client error'));
    subClient.on('error', (err) => log.error({ err }, 'Redis adapter sub client error'));

    await Promise.all([pubClient.connect(), subClient.connect()]);

    io.adapter(createAdapter(pubClient, subClient));

    log.info('WebSocket Redis adapter initialized — horizontal scaling active');
  } catch (error) {
    log.error({ error }, 'Failed to setup Redis adapter — WebSocket events will be local-only');
  }
}
