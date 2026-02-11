import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';

import { config } from './config';
import prisma from './db/client';
import { connectRedis } from './db/redis';
import { errorHandler, notFound } from './middleware/error';
import { setupWebSocket } from './websocket';

// Production infrastructure imports
import { logger } from './lib/logger';
import { requestLogging } from './middleware/requestLogging';
import { metricsMiddleware, metricsHandler } from './lib/metrics';
import { healthSimple, healthLive, healthReady, healthDeep } from './lib/healthCheck';

// In production, redirect all console.error/warn to structured logger
// so legacy code paths still produce structured JSON logs
if (process.env.NODE_ENV === 'production') {
  console.error = (...args: any[]) => logger.error({ args }, String(args[0]));
  console.warn = (...args: any[]) => logger.warn({ args }, String(args[0]));
  console.log = (...args: any[]) => logger.info({ args }, String(args[0]));
}

// Import routes
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import messageRoutes from './routes/messages';
import groupRoutes from './routes/groups';
import callRoutes from './routes/calls';
import fileRoutes from './routes/files';
import keyRoutes from './routes/keys';
import keyBackupRoutes from './routes/keyBackup';
import reportRoutes from './routes/reports';
import pollRoutes from './routes/polls';
import adminRoutes from './routes/admin';
import accountRoutes from './routes/account';

const app = express();
const server = http.createServer(app);

// ========== Security Middleware ==========

// Helmet with strict CSP and security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", ...config.cors.origin],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'", "blob:"],
      frameSrc: ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  noSniff: true,
}));

// Simplified security headers (Helmet already sets most of these)
app.use((req, res, next) => {
  // Allow camera and microphone for WebRTC voice/video calls
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
  // Prevent caching of API responses containing sensitive data
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
  }
  next();
});

// CORS - SECURITY: Never allow wildcard in production
app.use(cors({
  origin: (origin, callback) => {
    if (config.nodeEnv === 'production' && config.cors.origin.includes('*')) {
      callback(new Error('Wildcard CORS origin is not allowed in production'));
      return;
    }
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
  exposedHeaders: ['X-PreKey-Count', 'X-PreKey-Warning'],
  maxAge: 600, // 10 min preflight cache
}));

// ========== Response Compression ==========
// Compress all responses (gzip/brotli) - reduces bandwidth by 60-80%
app.use(compression({
  level: 6, // Balanced compression level
  threshold: 1024, // Only compress responses > 1KB
  filter: (req, res) => {
    // Don't compress already-compressed responses or SSE
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  },
}));

// ========== Structured Logging & Observability ==========
// Correlation ID + structured JSON logging for all requests
app.use(requestLogging);

// Prometheus metrics collection
app.use(metricsMiddleware);

// Morgan for access logs (development only — production uses structured logger)
if (config.nodeEnv !== 'production') {
  app.use(morgan('dev'));
}

app.use(express.json({ limit: config.express.bodyLimit }));
app.use(express.urlencoded({ extended: true, limit: config.express.bodyLimit }));
app.use(cookieParser());

// Debug Request Logger (Development only - SECURITY: never log bodies in production)
if (config.nodeEnv !== 'production') {
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
      // SECURITY: Don't log request bodies (may contain passwords/tokens)
    }
    next();
  });
}

// ========== Rate Limiting ==========

// Disable rate limiting in development/test for easier testing
const isTestOrDev = config.nodeEnv === 'development' || config.nodeEnv === 'test';

// Global rate limiter
const globalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: isTestOrDev ? 999999 : config.rateLimit.max, // Effectively disabled in dev
  message: { error: config.rateLimit.message },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', globalLimiter);

// Strict rate limiter for authentication endpoints (brute-force protection)
const authLoginLimiter = rateLimit({
  windowMs: config.authRateLimit.windowMs,
  max: isTestOrDev ? 999999 : config.authRateLimit.maxLogin,
  message: { error: 'Too many login attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});

const authRegisterLimiter = rateLimit({
  windowMs: config.authRateLimit.windowMs,
  max: isTestOrDev ? 999999 : config.authRateLimit.maxRegister,
  message: { error: 'Too many registration attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ========== API Routes ==========

// Apply auth-specific rate limiting
app.use('/api/v1/auth/login', authLoginLimiter);
app.use('/api/v1/auth/register', authRegisterLimiter);

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/messages', messageRoutes);
app.use('/api/v1/groups', groupRoutes);
app.use('/api/v1/calls', callRoutes);
app.use('/api/v1/files', fileRoutes);
app.use('/api/v1/keys', keyRoutes);
app.use('/api/v1/keys', keyBackupRoutes);
app.use('/api/v1/reports', reportRoutes);
app.use('/api/v1/polls', pollRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/account', accountRoutes);

// ========== Health Check Endpoints ==========
app.get('/api/health', healthSimple);        // Load balancer
app.get('/api/health/live', healthLive);      // Kubernetes liveness
app.get('/api/health/ready', healthReady);    // Kubernetes readiness
app.get('/api/health/deep', healthDeep);      // Deep diagnostics

// ========== Prometheus Metrics Endpoint ==========
app.get('/metrics', metricsHandler);

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
    logger.info('PostgreSQL connected via Prisma');

    // Connect Redis
    try {
      await connectRedis();
      logger.info('Redis connected');
    } catch (error) {
      logger.warn({ error }, 'Redis connection failed (continuing without Redis)');
    }

    server.listen(config.port, () => {
      logger.info({
        port: config.port,
        env: config.nodeEnv,
        cors: config.cors.origin,
      }, `Zynk Server started on port ${config.port}`);

      if (config.nodeEnv !== 'production') {
        console.log(`
╔══════════════════════════════════════════════╗
║  🔐 Zynk Server running on port ${config.port}        ║
║  📡 WebSocket ready                         ║
║  🌐 API: http://localhost:${config.port}/api/v1       ║
║  📊 Metrics: http://localhost:${config.port}/metrics   ║
║  ❤️  Health: http://localhost:${config.port}/api/health ║
╚══════════════════════════════════════════════╝
        `);
      }
    });
  } catch (error) {
    logger.fatal({ error }, 'Failed to start server');
    process.exit(1);
  }
}

start();

// ========== Graceful Shutdown ==========
const shutdown = async (signal: string) => {
  logger.info({ signal }, 'Graceful shutdown initiated');

  // Stop accepting new connections
  server.close(async () => {
    logger.info('HTTP server closed');

    try {
      // Close WebSocket connections
      io.close();
      logger.info('WebSocket server closed');

      // Disconnect database
      await prisma.$disconnect();
      logger.info('Database disconnected');

      process.exit(0);
    } catch (error) {
      logger.error({ error }, 'Error during shutdown');
      process.exit(1);
    }
  });

  // Force exit after 10 seconds if graceful shutdown fails
  setTimeout(() => {
    logger.fatal('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { app, server };
