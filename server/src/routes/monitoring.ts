import { Router } from 'express';
import { 
  getHealthStatus, 
  getMetrics, 
  getPrometheusMetrics,
  checkAlerts 
} from '../monitoring/metrics';

const router = Router();

// Health check with detailed metrics
router.get('/health', async (req, res) => {
  try {
    const health = await getHealthStatus();
    res.json(health);
  } catch (error) {
    res.status(500).json({ status: 'unhealthy', error: 'Health check failed' });
  }
});

// Metrics endpoint (JSON format)
router.get('/metrics', (req, res) => {
  const metrics = getMetrics();
  res.json(metrics);
});

// Prometheus metrics endpoint
router.get('/metrics/prometheus', (req, res) => {
  const metrics = getPrometheusMetrics();
  res.set('Content-Type', 'text/plain');
  res.send(metrics);
});

// Alerts endpoint
router.get('/alerts', (req, res) => {
  const alerts = checkAlerts();
  res.json({ alerts, count: alerts.length });
});

export default router;
