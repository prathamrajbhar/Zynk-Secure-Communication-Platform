import { Request, Response, NextFunction } from 'express';
import { performance } from 'perf_hooks';

// Simple in-memory metrics (use Prometheus client in production)
interface Metrics {
  requests: {
    total: number;
    byStatus: Record<number, number>;
    byMethod: Record<string, number>;
    byPath: Record<string, number>;
  };
  latency: {
    p50: number;
    p95: number;
    p99: number;
    samples: number[];
  };
  errors: {
    total: number;
    byType: Record<string, number>;
  };
  websocket: {
    connections: number;
    messages: number;
  };
}

const metrics: Metrics = {
  requests: {
    total: 0,
    byStatus: {},
    byMethod: {},
    byPath: {}
  },
  latency: {
    p50: 0,
    p95: 0,
    p99: 0,
    samples: []
  },
  errors: {
    total: 0,
    byType: {}
  },
  websocket: {
    connections: 0,
    messages: 0
  }
};

// Middleware to track request metrics
export const metricsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const startTime = performance.now();

  // Track request
  metrics.requests.total++;
  
  // Track by method
  const method = req.method;
  metrics.requests.byMethod[method] = (metrics.requests.byMethod[method] || 0) + 1;

  // Track by path (simplified)
  const path = req.path.split('/').slice(0, 4).join('/'); // Group similar paths
  metrics.requests.byPath[path] = (metrics.requests.byPath[path] || 0) + 1;

  // Capture response
  const originalSend = res.send;
  res.send = function(data: any) {
    const duration = performance.now() - startTime;
    
    // Track latency
    metrics.latency.samples.push(duration);
    if (metrics.latency.samples.length > 1000) {
      metrics.latency.samples.shift(); // Keep only last 1000 samples
    }
    
    // Calculate percentiles
    const sorted = [...metrics.latency.samples].sort((a, b) => a - b);
    metrics.latency.p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
    metrics.latency.p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
    metrics.latency.p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;

    // Track by status
    const status = res.statusCode;
    metrics.requests.byStatus[status] = (metrics.requests.byStatus[status] || 0) + 1;

    // Track errors
    if (status >= 400) {
      metrics.errors.total++;
      const errorType = status >= 500 ? '5xx' : '4xx';
      metrics.errors.byType[errorType] = (metrics.errors.byType[errorType] || 0) + 1;
    }

    return originalSend.call(this, data);
  };

  next();
};

// WebSocket metrics
export const trackWebSocketConnection = (connected: boolean) => {
  if (connected) {
    metrics.websocket.connections++;
  } else {
    metrics.websocket.connections = Math.max(0, metrics.websocket.connections - 1);
  }
};

export const trackWebSocketMessage = () => {
  metrics.websocket.messages++;
};

// Get current metrics
export const getMetrics = (): Metrics => {
  return {
    ...metrics,
    latency: {
      ...metrics.latency,
      samples: [] // Don't expose raw samples
    }
  };
};

// Health check with detailed status
export const getHealthStatus = async () => {
  const uptime = process.uptime();
  const memoryUsage = process.memoryUsage();
  
  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(uptime),
    memory: {
      heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
      heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
      rss: Math.round(memoryUsage.rss / 1024 / 1024), // MB
      external: Math.round(memoryUsage.external / 1024 / 1024) // MB
    },
    cpu: process.cpuUsage(),
    metrics: getMetrics()
  };
};

// Prometheus format (optional)
export const getPrometheusMetrics = (): string => {
  const m = getMetrics();
  
  let output = '';
  
  // Requests
  output += '# HELP http_requests_total Total number of HTTP requests\n';
  output += '# TYPE http_requests_total counter\n';
  output += `http_requests_total ${m.requests.total}\n\n`;
  
  // Requests by status
  output += '# HELP http_requests_by_status HTTP requests by status code\n';
  output += '# TYPE http_requests_by_status counter\n';
  Object.entries(m.requests.byStatus).forEach(([status, count]) => {
    output += `http_requests_by_status{status="${status}"} ${count}\n`;
  });
  output += '\n';
  
  // Latency
  output += '# HELP http_request_duration_milliseconds HTTP request latency\n';
  output += '# TYPE http_request_duration_milliseconds summary\n';
  output += `http_request_duration_milliseconds{quantile="0.5"} ${m.latency.p50}\n`;
  output += `http_request_duration_milliseconds{quantile="0.95"} ${m.latency.p95}\n`;
  output += `http_request_duration_milliseconds{quantile="0.99"} ${m.latency.p99}\n\n`;
  
  // Errors
  output += '# HELP http_errors_total Total number of HTTP errors\n';
  output += '# TYPE http_errors_total counter\n';
  output += `http_errors_total ${m.errors.total}\n\n`;
  
  // WebSocket
  output += '# HELP websocket_connections Current WebSocket connections\n';
  output += '# TYPE websocket_connections gauge\n';
  output += `websocket_connections ${m.websocket.connections}\n\n`;
  
  output += '# HELP websocket_messages_total Total WebSocket messages\n';
  output += '# TYPE websocket_messages_total counter\n';
  output += `websocket_messages_total ${m.websocket.messages}\n\n`;
  
  return output;
};

// Alert thresholds
export const checkAlerts = () => {
  const alerts = [];
  const m = getMetrics();
  
  // High error rate
  const errorRate = m.errors.total / m.requests.total;
  if (errorRate > 0.05) { // 5% error rate
    alerts.push({
      level: 'warning',
      message: `High error rate: ${(errorRate * 100).toFixed(2)}%`
    });
  }
  
  // High latency
  if (m.latency.p95 > 1000) { // 1 second
    alerts.push({
      level: 'warning',
      message: `High latency: P95 = ${m.latency.p95.toFixed(0)}ms`
    });
  }
  
  // Memory usage
  const memUsage = process.memoryUsage();
  const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
  if (heapUsedPercent > 90) {
    alerts.push({
      level: 'critical',
      message: `High memory usage: ${heapUsedPercent.toFixed(1)}%`
    });
  }
  
  return alerts;
};

// Reset metrics (for testing)
export const resetMetrics = () => {
  metrics.requests = { total: 0, byStatus: {}, byMethod: {}, byPath: {} };
  metrics.latency = { p50: 0, p95: 0, p99: 0, samples: [] };
  metrics.errors = { total: 0, byType: {} };
  metrics.websocket = { connections: 0, messages: 0 };
};
