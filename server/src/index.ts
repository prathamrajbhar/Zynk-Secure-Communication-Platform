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
  xssFilter: true,
}));

// Simplified security headers (Helmet already sets most of these)
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
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

// ========== Logging ==========
// Use 'combined' format in production for better log aggregation
if (config.nodeEnv !== 'production') {
  app.use(morgan('dev'));
} else {
  // Production: Apache combined log format, skip health checks
  app.use(morgan('combined', {
    skip: (req) => req.path === '/api/health',
  }));
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

// SECURITY: DO NOT serve uploads statically without authentication
// Files are served through the authenticated /api/v1/files/:fileId/download endpoint
// app.use('/uploads', express.static(path.resolve(config.upload.dir))); // REMOVED

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

// Health check (no sensitive info)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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

// ========== Graceful Shutdown ==========
const shutdown = async (signal: string) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);

  // Stop accepting new connections
  server.close(async () => {
    console.log('HTTP server closed');

    try {
      // Close WebSocket connections
      io.close();
      console.log('WebSocket server closed');

      // Disconnect database
      await prisma.$disconnect();
      console.log('Database disconnected');

      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  });

  // Force exit after 10 seconds if graceful shutdown fails
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { app, server };
