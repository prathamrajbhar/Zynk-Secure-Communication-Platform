import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';

import { config } from './config';
import prisma from './db/client';
import { connectRedis } from './db/redis';
import { errorHandler, notFound } from './middleware/error';
import { setupWebSocket } from './websocket';

// Import routes
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import messageRoutes from './routes/messages';
import groupRoutes from './routes/groups';
import callRoutes from './routes/calls';
import fileRoutes from './routes/files';
import keyRoutes from './routes/keys';

const app = express();
const server = http.createServer(app);

// Middleware
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: (origin, callback) => {
    // If "*" is in the allowed origins, allow any origin
    if (config.cors.origin.includes('*')) {
      callback(null, true);
    } else if (!origin || config.cors.origin.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
}),
);
app.use(morgan(config.express.morganMode));
app.use(express.json({ limit: config.express.bodyLimit }));
app.use(express.urlencoded({ extended: true, limit: config.express.bodyLimit }));
app.use(cookieParser());

// Debug Request Logger (Development only)
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
      if (req.method !== 'GET') console.log('Body:', JSON.stringify(req.body, null, 2));
    }
    next();
  });
}

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: { error: config.rateLimit.message },
});
app.use('/api/', limiter);

// Serve uploaded files
app.use('/uploads', express.static(path.resolve(config.upload.dir)));

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/messages', messageRoutes);
app.use('/api/v1/groups', groupRoutes);
app.use('/api/v1/calls', callRoutes);
app.use('/api/v1/files', fileRoutes);
app.use('/api/v1/keys', keyRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// Error handling
app.use(notFound);
app.use(errorHandler);

// Setup WebSocket
export const io = setupWebSocket(server);

// Start server
async function start() {
  try {
    // Test database connection
    await prisma.$queryRaw`SELECT 1`;
    console.log('PostgreSQL connected via Prisma');

    // Connect Redis
    try {
      await connectRedis();
      console.log('Redis connected');
    } catch (error) {
      console.warn('Redis connection failed (continuing without Redis):', (error as Error).message);
    }

    server.listen(config.port, () => {
      console.log(`
╔══════════════════════════════════════════════╗
║                                              ║
║    🔐 Zynk Server running on port ${config.port}       ║
║    📡 WebSocket ready                        ║
║    🌐 API: http://localhost:${config.port}/api/v1      ║
║    ❤️  Health: http://localhost:${config.port}/api/health║
║    🛡️  CORS Allowed: ${config.cors.origin.join(', ')}
║                                              ║
╚══════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();

export { app, server };
