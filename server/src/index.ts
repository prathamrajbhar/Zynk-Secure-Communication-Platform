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

const app = express();
const server = http.createServer(app);

// Middleware
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: config.cors.origin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: { error: 'Too many requests, please try again later' },
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
║    🛡️  CORS Allowed: ${config.cors.origin}
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
