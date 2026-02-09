import dotenv from 'dotenv';
import crypto from 'crypto';
dotenv.config();

// SECURITY: Enforce strong secrets in production
function requireSecret(name: string, envVar: string | undefined, fallback: string): string {
  if (process.env.NODE_ENV === 'production') {
    if (!envVar || envVar === fallback) {
      console.error(`FATAL: ${name} must be set in production and must not be the default value.`);
      process.exit(1);
    }
    if (envVar.length < 32) {
      console.error(`FATAL: ${name} must be at least 32 characters in production.`);
      process.exit(1);
    }
    return envVar;
  }
  // Development: use env var or generate a random one (never use a static fallback)
  return envVar || crypto.randomBytes(48).toString('hex');
}

export const config = {
  port: parseInt(process.env.PORT || '8000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: process.env.DB_NAME || 'zynk',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    url: process.env.DATABASE_URL || '',
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  jwt: {
    secret: requireSecret('JWT_SECRET', process.env.JWT_SECRET, 'dev-jwt-secret-change-in-production'),
    refreshSecret: requireSecret('JWT_REFRESH_SECRET', process.env.JWT_REFRESH_SECRET, 'dev-jwt-refresh-secret-change-in-production'),
    expiresIn: process.env.JWT_EXPIRES_IN || '15m', // Reduced from 1h to 15m
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d', // Reduced from 30d to 7d
  },

  upload: {
    dir: process.env.UPLOAD_DIR || './uploads',
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '52428800', 10), // 50MB default (reduced from 100MB)
  },

  cors: {
    origin: (process.env.CORS_ORIGIN || 'http://localhost:3000').split(','),
  },

  turn: {
    urls: process.env.TURN_URLS || '',
    username: process.env.TURN_USERNAME || '',
    credential: process.env.TURN_CREDENTIAL || '',
  },

  stun: {
    urls: (process.env.STUN_URLS || 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302,stun:stun2.l.google.com:19302').split(','),
  },

  call: {
    ringTimeoutMs: parseInt(process.env.CALL_RING_TIMEOUT_MS || '30000', 10),
    maxDurationSecs: parseInt(process.env.CALL_MAX_DURATION_SECS || '3600', 10),
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 min default
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    message: process.env.RATE_LIMIT_MESSAGE || 'Too many requests, please try again later.',
  },

  // Separate stricter rate limits for auth endpoints
  authRateLimit: {
    windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 min
    maxLogin: parseInt(process.env.AUTH_RATE_LIMIT_MAX_LOGIN || '5', 10), // 5 login attempts per 15 min
    maxRegister: parseInt(process.env.AUTH_RATE_LIMIT_MAX_REGISTER || '3', 10), // 3 registrations per 15 min
  },

  security: {
    // Bcrypt cost factor (12 is recommended minimum for production)
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
    // Minimum password length
    minPasswordLength: parseInt(process.env.MIN_PASSWORD_LENGTH || '8', 10),
    // Maximum devices per user
    maxDevices: parseInt(process.env.MAX_DEVICES || '5', 10),
    // Session expiry (for DB-stored sessions)
    sessionExpiryMs: parseInt(process.env.SESSION_EXPIRY_MS || '900000', 10), // 15 min
    refreshExpiryMs: parseInt(process.env.REFRESH_EXPIRY_MS || '604800000', 10), // 7 days
  },

  express: {
    bodyLimit: process.env.BODY_LIMIT || '2mb', // Reduced from 10mb
    morganMode: process.env.MORGAN_MODE || 'dev',
  },
};
