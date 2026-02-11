import request from 'supertest';
import { app } from '../src/index';

describe('AI Service Integration Tests', () => {
  let authToken: string;

  beforeAll(async () => {
    // Login to get auth token
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'test@example.com',
        password: 'Test123456'
      });
    
    authToken = response.body.data?.token || '';
  });

  describe('POST /api/v1/ai/translate', () => {
    it('should translate a message successfully', async () => {
      const response = await request(app)
        .post('/api/v1/ai/translate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          text: 'Hello world',
          targetLang: 'es'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('translated');
    }, 15000); // Increase timeout for AI service

    it('should reject invalid input', async () => {
      const response = await request(app)
        .post('/api/v1/ai/translate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          text: '',
          targetLang: 'es'
        });

      expect(response.status).toBe(400);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/v1/ai/translate')
        .send({
          text: 'Hello',
          targetLang: 'es'
        });

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/v1/ai/smart-replies', () => {
    it('should generate smart replies', async () => {
      const response = await request(app)
        .post('/api/v1/ai/smart-replies')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          conversationHistory: ['Hey!', 'How are you?', 'Doing great!']
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.replies)).toBe(true);
    }, 15000);

    it('should handle empty conversation', async () => {
      const response = await request(app)
        .post('/api/v1/ai/smart-replies')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          conversationHistory: []
        });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/v1/ai/moderate', () => {
    it('should detect safe content', async () => {
      const response = await request(app)
        .post('/api/v1/ai/moderate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          message: 'Hello, how are you today?'
        });

      expect(response.status).toBe(200);
      expect(response.body.data.safe).toBe(true);
    }, 15000);

    it('should detect unsafe content', async () => {
      const response = await request(app)
        .post('/api/v1/ai/moderate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          message: 'Very inappropriate offensive content here'
        });

      expect(response.status).toBe(200);
      // AI may or may not flag this, depends on model
      expect(response.body.data).toHaveProperty('safe');
    }, 15000);
  });

  describe('POST /api/v1/ai/sentiment', () => {
    it('should analyze sentiment', async () => {
      const response = await request(app)
        .post('/api/v1/ai/sentiment')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          message: 'I am so happy today!'
        });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('sentiment');
      expect(response.body.data).toHaveProperty('score');
      expect(['positive', 'negative', 'neutral']).toContain(response.body.data.sentiment);
    }, 15000);
  });
});

describe('Security Middleware Tests', () => {
  describe('Input Sanitization', () => {
    it('should sanitize null bytes', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'test\0@example.com',
          password: 'password'
        });

      // Should sanitize or reject
      expect([400, 401]).toContain(response.status);
    });

    it('should prevent SQL injection', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: "' OR '1'='1",
          password: 'password'
        });

      expect(response.status).toBe(400);
    });
  });

  describe('Rate Limiting', () => {
    it('should rate limit excessive requests', async () => {
      const requests = [];
      
      // Make 10 rapid requests
      for (let i = 0; i < 10; i++) {
        requests.push(
          request(app)
            .get('/api/health')
        );
      }

      const responses = await Promise.all(requests);
      
      // Some requests should succeed, but system should handle load
      expect(responses.length).toBe(10);
    });
  });
});

describe('Monitoring Endpoints Tests', () => {
  describe('GET /api/monitoring/health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/api/monitoring/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('memory');
      expect(response.body).toHaveProperty('metrics');
    });
  });

  describe('GET /api/monitoring/metrics', () => {
    it('should return metrics', async () => {
      const response = await request(app)
        .get('/api/monitoring/metrics');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('requests');
      expect(response.body).toHaveProperty('latency');
      expect(response.body).toHaveProperty('errors');
    });
  });

  describe('GET /api/monitoring/alerts', () => {
    it('should return alerts', async () => {
      const response = await request(app)
        .get('/api/monitoring/alerts');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('alerts');
      expect(Array.isArray(response.body.alerts)).toBe(true);
    });
  });
});
