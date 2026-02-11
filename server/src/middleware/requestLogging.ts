import { Request, Response, NextFunction } from 'express';
import { logger, generateCorrelationId, createRequestLogger } from '../lib/logger';

// Extend Express Request to include correlation ID and logger
declare global {
  namespace Express {
    interface Request {
      correlationId: string;
      log: ReturnType<typeof createRequestLogger>;
    }
  }
}

/**
 * Request logging middleware
 * 
 * Adds:
 * - Correlation ID (X-Correlation-ID header) for distributed tracing
 * - Structured request/response logging
 * - Response time measurement
 * - Child logger attached to request
 */
export function requestLogging(req: Request, res: Response, next: NextFunction) {
  // Use incoming correlation ID or generate new one
  const correlationId = (req.headers['x-correlation-id'] as string) || generateCorrelationId();
  req.correlationId = correlationId;

  // Set correlation ID on response
  res.setHeader('X-Correlation-ID', correlationId);

  // Create child logger with request context
  req.log = createRequestLogger(correlationId, (req as any).userId);

  // Record start time
  const startTime = process.hrtime.bigint();

  // Log request
  req.log.info({
    req: {
      method: req.method,
      url: req.originalUrl || req.url,
      query: req.query,
      remoteAddress: req.ip,
      userAgent: req.get('User-Agent'),
      contentLength: req.get('Content-Length'),
      correlationId,
    },
  }, `→ ${req.method} ${req.originalUrl || req.url}`);

  // Log response on finish
  res.on('finish', () => {
    const durationNs = process.hrtime.bigint() - startTime;
    const durationMs = Number(durationNs) / 1e6;

    const logData = {
      res: {
        statusCode: res.statusCode,
        contentLength: res.get('Content-Length'),
      },
      responseTime: Math.round(durationMs * 100) / 100,
      correlationId,
    };

    const message = `← ${req.method} ${req.originalUrl || req.url} ${res.statusCode} ${durationMs.toFixed(1)}ms`;

    if (res.statusCode >= 500) {
      req.log.error(logData, message);
    } else if (res.statusCode >= 400) {
      req.log.warn(logData, message);
    } else {
      req.log.info(logData, message);
    }
  });

  next();
}
