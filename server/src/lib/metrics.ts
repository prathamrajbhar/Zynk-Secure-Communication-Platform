import { Request, Response, NextFunction } from 'express';
import { register, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

// ============================================================================
// Prometheus Metrics for Zynk
//
// Exposes metrics at /metrics endpoint for Prometheus scraping.
// Includes: HTTP request metrics, WebSocket metrics, business metrics,
//           Node.js runtime metrics (memory, CPU, event loop)
// ============================================================================

// Collect default Node.js metrics (memory, CPU, event loop, GC)
collectDefaultMetrics({
  prefix: 'zynk_',
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
});

// ======================== HTTP Metrics ========================

export const httpRequestsTotal = new Counter({
  name: 'zynk_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'] as const,
});

export const httpRequestDuration = new Histogram({
  name: 'zynk_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

export const httpRequestSize = new Histogram({
  name: 'zynk_http_request_size_bytes',
  help: 'HTTP request body size in bytes',
  labelNames: ['method', 'route'] as const,
  buckets: [100, 1000, 10000, 100000, 1000000, 10000000],
});

export const httpResponseSize = new Histogram({
  name: 'zynk_http_response_size_bytes',
  help: 'HTTP response body size in bytes',
  labelNames: ['method', 'route'] as const,
  buckets: [100, 1000, 10000, 100000, 1000000, 10000000],
});

// ======================== WebSocket Metrics ========================

export const wsConnectionsActive = new Gauge({
  name: 'zynk_ws_connections_active',
  help: 'Number of active WebSocket connections',
});

export const wsConnectionsTotal = new Counter({
  name: 'zynk_ws_connections_total',
  help: 'Total WebSocket connections established',
});

export const wsMessagesTotal = new Counter({
  name: 'zynk_ws_messages_total',
  help: 'Total WebSocket messages sent/received',
  labelNames: ['direction', 'event'] as const,
});

export const wsMessageDuration = new Histogram({
  name: 'zynk_ws_message_duration_seconds',
  help: 'WebSocket message processing duration',
  labelNames: ['event'] as const,
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.5, 1],
});

// ======================== Business Metrics ========================

export const messagesTotal = new Counter({
  name: 'zynk_messages_total',
  help: 'Total messages sent',
  labelNames: ['type', 'encryption'] as const,
});

export const messageDeliveryDuration = new Histogram({
  name: 'zynk_message_delivery_duration_seconds',
  help: 'Time from message send to delivery confirmation',
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
});

export const callsTotal = new Counter({
  name: 'zynk_calls_total',
  help: 'Total calls initiated',
  labelNames: ['type', 'status'] as const,
});

export const callDuration = new Histogram({
  name: 'zynk_call_duration_seconds',
  help: 'Call duration in seconds',
  labelNames: ['type'] as const,
  buckets: [10, 30, 60, 120, 300, 600, 1800, 3600],
});

export const fileUploadsTotal = new Counter({
  name: 'zynk_file_uploads_total',
  help: 'Total files uploaded',
  labelNames: ['mime_type'] as const,
});

export const fileUploadSize = new Histogram({
  name: 'zynk_file_upload_size_bytes',
  help: 'Uploaded file sizes in bytes',
  buckets: [1024, 10240, 102400, 1048576, 10485760, 52428800],
});

export const activeUsersGauge = new Gauge({
  name: 'zynk_active_users',
  help: 'Number of currently online users',
});

export const registrationsTotal = new Counter({
  name: 'zynk_registrations_total',
  help: 'Total user registrations',
});

export const authFailuresTotal = new Counter({
  name: 'zynk_auth_failures_total',
  help: 'Total authentication failures',
  labelNames: ['reason'] as const,
});

// ======================== Database Metrics ========================

export const dbQueryDuration = new Histogram({
  name: 'zynk_db_query_duration_seconds',
  help: 'Database query duration in seconds',
  labelNames: ['operation', 'model'] as const,
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2],
});

export const dbConnectionPool = new Gauge({
  name: 'zynk_db_connections',
  help: 'Database connection pool status',
  labelNames: ['state'] as const,
});

// ======================== Redis Metrics ========================

export const redisOperationsTotal = new Counter({
  name: 'zynk_redis_operations_total',
  help: 'Total Redis operations',
  labelNames: ['operation', 'status'] as const,
});

export const redisOperationDuration = new Histogram({
  name: 'zynk_redis_operation_duration_seconds',
  help: 'Redis operation duration',
  labelNames: ['operation'] as const,
  buckets: [0.0001, 0.0005, 0.001, 0.005, 0.01, 0.05, 0.1],
});

// ======================== Circuit Breaker Metrics ========================

export const circuitBreakerState = new Gauge({
  name: 'zynk_circuit_breaker_state',
  help: 'Circuit breaker state (0=closed, 1=half-open, 2=open)',
  labelNames: ['service'] as const,
});

export const circuitBreakerTrips = new Counter({
  name: 'zynk_circuit_breaker_trips_total',
  help: 'Total circuit breaker trips',
  labelNames: ['service'] as const,
});

// ======================== Middleware ========================

/**
 * Normalize route path to prevent high-cardinality labels
 * e.g., /api/v1/users/abc-123 → /api/v1/users/:id
 */
function normalizeRoute(req: Request): string {
  if (req.route?.path) {
    return `${req.baseUrl}${req.route.path}`;
  }
  // Fallback: replace UUIDs and numeric IDs
  return (req.originalUrl || req.url)
    .split('?')[0]
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/\d+/g, '/:id');
}

/**
 * Metrics collection middleware for HTTP requests
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  // Skip metrics endpoint itself
  if (req.path === '/metrics') return next();

  const end = httpRequestDuration.startTimer();
  const requestSize = parseInt(req.get('Content-Length') || '0', 10);

  res.on('finish', () => {
    const route = normalizeRoute(req);
    const statusCode = res.statusCode.toString();
    const method = req.method;

    httpRequestsTotal.inc({ method, route, status_code: statusCode });
    end({ method, route, status_code: statusCode });

    if (requestSize > 0) {
      httpRequestSize.observe({ method, route }, requestSize);
    }

    const responseSize = parseInt(res.get('Content-Length') || '0', 10);
    if (responseSize > 0) {
      httpResponseSize.observe({ method, route }, responseSize);
    }
  });

  next();
}

/**
 * Metrics endpoint handler for Prometheus scraping
 */
export async function metricsHandler(req: Request, res: Response) {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    res.status(500).json({ error: 'Failed to collect metrics' });
  }
}

// ======================== Convenience Export ========================

/**
 * Grouped business metrics for easy import in route handlers
 */
export const businessMetrics = {
  messagesSent: messagesTotal,
  messageDelivery: messageDeliveryDuration,
  calls: callsTotal,
  callDuration,
  fileUploads: fileUploadsTotal,
  fileSize: fileUploadSize,
  activeUsers: activeUsersGauge,
  registrations: registrationsTotal,
  authFailures: authFailuresTotal,
  wsConnections: wsConnectionsActive,
  wsMessages: wsMessagesTotal,
};
