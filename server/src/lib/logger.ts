import pino from 'pino';
import { config } from '../config';
import crypto from 'crypto';

// ============================================================================
// Production-Grade Structured Logging
//
// Features:
// - JSON structured output for log aggregation (ELK/Loki)
// - Correlation IDs for request tracing
// - Log levels: fatal, error, warn, info, debug, trace
// - Redaction of sensitive fields (passwords, tokens, keys)
// - Child loggers with context (request, user, service)
// ============================================================================

const redactPaths = [
  'password',
  'password_hash',
  'token',
  'refreshToken',
  'session_token',
  'refresh_token',
  'authorization',
  'cookie',
  'secret',
  'private_key',
  'encrypted_content',
  'encrypted_key',
  'push_token',
];

export const logger = pino({
  level: process.env.LOG_LEVEL || (config.nodeEnv === 'production' ? 'info' : 'debug'),
  
  // Redact sensitive fields
  redact: {
    paths: redactPaths.flatMap(p => [
      p,
      `*.${p}`,
      `*.*.${p}`,
      `req.headers.authorization`,
      `req.headers.cookie`,
    ]),
    censor: '[REDACTED]',
  },

  // Serializers for common objects
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      query: req.query,
      params: req.params,
      remoteAddress: req.ip || req.remoteAddress,
      userAgent: req.headers?.['user-agent'],
      correlationId: req.correlationId,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
    err: pino.stdSerializers.err,
  },

  // Production: JSON output for log aggregation
  // Development: Pretty print for readability
  ...(config.nodeEnv !== 'production' && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss.l',
        ignore: 'pid,hostname',
      },
    },
  }),

  // Base context for all log entries
  base: {
    service: 'zynk-server',
    version: process.env.npm_package_version || '1.0.0',
    env: config.nodeEnv,
  },

  // Timestamp format
  timestamp: pino.stdTimeFunctions.isoTime,
});

/**
 * Generate a unique correlation ID for request tracing
 */
export function generateCorrelationId(): string {
  return crypto.randomUUID();
}

/**
 * Create a child logger with request context
 */
export function createRequestLogger(correlationId: string, userId?: string) {
  return logger.child({
    correlationId,
    ...(userId && { userId }),
  });
}

/**
 * Create a child logger for a specific service/module
 */
export function createServiceLogger(service: string) {
  return logger.child({ service });
}

// Audit logger for security-sensitive operations
export const auditLogger = logger.child({ type: 'audit' });

/**
 * Log an audit event for security-sensitive operations
 */
export function logAudit(event: {
  action: string;
  userId?: string;
  targetId?: string;
  ip?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
  outcome: 'success' | 'failure';
}) {
  auditLogger.info({
    audit: true,
    action: event.action,
    userId: event.userId,
    targetId: event.targetId,
    ip: event.ip,
    userAgent: event.userAgent,
    details: event.details,
    outcome: event.outcome,
    timestamp: new Date().toISOString(),
  }, `AUDIT: ${event.action} - ${event.outcome}`);
}

export default logger;
