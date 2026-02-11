// ============================================================================
// Zynk — API Integration Tests
//
// Tests all API endpoints with real database and Redis.
// Run with: npm test -- tests/integration/
// ============================================================================

import request from 'supertest';
import { app } from '../../src/index';

let authToken: string;
let userId: string;
const testUser = {
  username: `testuser_${Date.now()}`,
  password: 'TestPass123!',
  device_name: 'Test Device',
  device_fingerprint: `test-fp-${Date.now()}`,
};

describe('Auth API', () => {
  describe('POST /api/v1/auth/register', () => {
    it('should register a new user', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send(testUser)
        .expect(201);

      expect(res.body).toHaveProperty('user');
      expect(res.body).toHaveProperty('sessionToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body.user.username).toBe(testUser.username);
      
      authToken = res.body.sessionToken;
      userId = res.body.user.id;
    });

    it('should reject duplicate username', async () => {
      await request(app)
        .post('/api/v1/auth/register')
        .send(testUser)
        .expect(409);
    });

    it('should reject invalid username', async () => {
      await request(app)
        .post('/api/v1/auth/register')
        .send({ ...testUser, username: 'ab' }) // Too short
        .expect(400);
    });

    it('should reject missing password', async () => {
      await request(app)
        .post('/api/v1/auth/register')
        .send({ username: 'newuser' })
        .expect(400);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should login with valid credentials', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: testUser.username,
          password: testUser.password,
          device_fingerprint: testUser.device_fingerprint,
        })
        .expect(200);

      expect(res.body).toHaveProperty('sessionToken');
      expect(res.body).toHaveProperty('refreshToken');
      authToken = res.body.sessionToken;
    });

    it('should reject invalid password', async () => {
      await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: testUser.username,
          password: 'wrong_password',
        })
        .expect(401);
    });

    it('should reject non-existent user', async () => {
      await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: 'nonexistent_user_12345',
          password: 'anything',
        })
        .expect(401);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('should return user profile with valid token', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.username).toBe(testUser.username);
    });

    it('should reject request without token', async () => {
      await request(app)
        .get('/api/v1/auth/me')
        .expect(401);
    });

    it('should reject invalid token', async () => {
      await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });
});

describe('Health API', () => {
  it('GET /api/health should return ok', async () => {
    const res = await request(app)
      .get('/api/health')
      .expect(200);

    expect(res.body.status).toBe('ok');
    expect(res.body).toHaveProperty('timestamp');
  });

  it('GET /api/health/live should return ok', async () => {
    const res = await request(app)
      .get('/api/health/live')
      .expect(200);

    expect(res.body.status).toBe('ok');
  });

  it('GET /api/health/ready should check dependencies', async () => {
    const res = await request(app)
      .get('/api/health/ready')
      .expect(200);

    expect(res.body.status).toBe('ready');
    expect(res.body.checks).toHaveProperty('database');
    expect(res.body.checks).toHaveProperty('redis');
  });
});

describe('Users API', () => {
  describe('GET /api/v1/users/search', () => {
    it('should search users by username', async () => {
      const res = await request(app)
        .get('/api/v1/users/search')
        .query({ q: testUser.username.substring(0, 5) })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it('should require authentication', async () => {
      await request(app)
        .get('/api/v1/users/search')
        .query({ q: 'test' })
        .expect(401);
    });
  });
});

describe('Messages API', () => {
  describe('GET /api/v1/messages/conversations', () => {
    it('should return conversation list', async () => {
      const res = await request(app)
        .get('/api/v1/messages/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});

describe('Error Handling', () => {
  it('should return 404 for unknown routes', async () => {
    await request(app)
      .get('/api/v1/nonexistent')
      .expect(404);
  });

  it('should return proper error format', async () => {
    const res = await request(app)
      .get('/api/v1/nonexistent')
      .expect(404);

    expect(res.body).toHaveProperty('error');
  });
});
