/**
 * ============================================================================
 * ZYNK SERVER — COMPREHENSIVE API TEST SUITE
 * ============================================================================
 * 
 * Tests EVERY endpoint across all route modules:
 *   - Auth: register, login, force-login, refresh, logout, logout-all, me, devices, push-token
 *   - Users: profile update, privacy, search, get user, public-key, contacts CRUD, block/unblock
 *   - Messages: send, get, edit, delete, read receipt, read-all, search, conversations CRUD
 *   - Groups: create, get, update, delete, add/remove members, my list
 *   - Calls: ICE servers, initiate, answer, end, decline, status, history, missed count
 *   - Files: upload, download, metadata, delete, conversation files, serve, thumbnail
 *   - Keys: upload, replenish, bundle, count, identity
 * 
 * Run: cd server && npx tsx src/test/api.test.ts
 * ============================================================================
 */

import http from 'http';
import path from 'path';
import fs from 'fs';

// ======================== Configuration ========================

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:8000';
const API = `${BASE_URL}/api/v1`;

// ======================== Test State ========================

interface TestUser {
  user_id: string;
  username: string;
  password: string;
  session_token: string;
  refresh_token: string;
  device_id?: string;
}

const state: {
  userA: TestUser;
  userB: TestUser;
  userC: TestUser;
  conversationId: string;
  messageId: string;
  groupId: string;
  groupConversationId: string;
  callId: string;
  fileId: string;
} = {
  userA: { user_id: '', username: '', password: '', session_token: '', refresh_token: '' },
  userB: { user_id: '', username: '', password: '', session_token: '', refresh_token: '' },
  userC: { user_id: '', username: '', password: '', session_token: '', refresh_token: '' },
  conversationId: '',
  messageId: '',
  groupId: '',
  groupConversationId: '',
  callId: '',
  fileId: '',
};

// ======================== HTTP Helper ========================

interface RequestOptions {
  method: string;
  path: string;
  body?: any;
  token?: string;
  headers?: Record<string, string>;
  formData?: { fieldName: string; filePath: string; fileName: string; mimeType: string; extraFields?: Record<string, string> };
}

interface TestResponse {
  status: number;
  headers: Record<string, string>;
  body: any;
  raw: string;
}

function request(opts: RequestOptions): Promise<TestResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(opts.path, BASE_URL);
    const headers: Record<string, string> = { ...opts.headers };

    if (opts.token) {
      headers['Authorization'] = `Bearer ${opts.token}`;
    }

    let bodyData: Buffer | string | undefined;

    if (opts.formData) {
      // Multipart form data
      const boundary = '----TestBoundary' + Date.now();
      headers['Content-Type'] = `multipart/form-data; boundary=${boundary}`;

      const parts: Buffer[] = [];

      // Add extra fields
      if (opts.formData.extraFields) {
        for (const [key, value] of Object.entries(opts.formData.extraFields)) {
          parts.push(Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`
          ));
        }
      }

      // Add file
      const fileContent = fs.readFileSync(opts.formData.filePath);
      parts.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${opts.formData.fieldName}"; filename="${opts.formData.fileName}"\r\nContent-Type: ${opts.formData.mimeType}\r\n\r\n`
      ));
      parts.push(fileContent);
      parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

      bodyData = Buffer.concat(parts);
      headers['Content-Length'] = bodyData.length.toString();
    } else if (opts.body !== undefined) {
      bodyData = JSON.stringify(opts.body);
      headers['Content-Type'] = 'application/json';
    }

    const reqOpts: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: opts.method,
      headers,
      timeout: 30000,
    };

    const req = http.request(reqOpts, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8');
        let body: any;
        try {
          body = JSON.parse(raw);
        } catch {
          body = raw;
        }
        const responseHeaders: Record<string, string> = {};
        for (const [key, value] of Object.entries(res.headers)) {
          if (value) responseHeaders[key] = Array.isArray(value) ? value.join(', ') : value;
        }
        resolve({ status: res.statusCode || 0, headers: responseHeaders, body, raw });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });

    if (bodyData) {
      req.write(bodyData);
    }
    req.end();
  });
}

// ======================== Test Runner ========================

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures: { name: string; error: string; details?: string }[] = [];

async function test(name: string, fn: () => Promise<void>) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✅ ${name}`);
  } catch (err: any) {
    failedTests++;
    const error = err.message || String(err);
    const details = err.details || undefined;
    failures.push({ name, error, details });
    console.log(`  ❌ ${name}`);
    console.log(`     Error: ${error}`);
    if (details) console.log(`     Details: ${details}`);
  }
}

function assert(condition: boolean, message: string, details?: string): void {
  if (!condition) {
    const err: any = new Error(message);
    if (details) err.details = details;
    throw err;
  }
}

function assertStatus(res: TestResponse, expected: number | number[], context: string) {
  const expectedArr = Array.isArray(expected) ? expected : [expected];
  assert(
    expectedArr.includes(res.status),
    `${context}: Expected status ${expectedArr.join('|')}, got ${res.status}`,
    typeof res.body === 'object' ? JSON.stringify(res.body) : res.raw.substring(0, 500)
  );
}

// ======================== Test Suites ========================

async function healthCheck() {
  console.log('\n🏥 Health Check');

  await test('GET /api/health returns ok', async () => {
    const res = await request({ method: 'GET', path: '/api/health' });
    assertStatus(res, 200, 'Health');
    assert(res.body.status === 'ok', 'Status should be ok');
    assert(!!res.body.timestamp, 'Should have timestamp');
  });
}

// ======================== AUTH TESTS ========================

async function authTests() {
  console.log('\n🔐 Auth Routes');

  const suffix = Date.now().toString(36);

  // Register User A
  await test('POST /auth/register — User A', async () => {
    state.userA.username = `testuser_a_${suffix}`;
    state.userA.password = 'TestPass123!';
    const res = await request({
      method: 'POST',
      path: `${API}/auth/register`,
      body: {
        username: state.userA.username,
        password: state.userA.password,
        device_name: 'Test Device A',
        device_fingerprint: `fp_a_${suffix}`,
      },
    });
    assertStatus(res, 201, 'Register A');
    assert(!!res.body.user_id, 'Should return user_id');
    assert(!!res.body.session_token, 'Should return session_token');
    assert(!!res.body.refresh_token, 'Should return refresh_token');
    state.userA.user_id = res.body.user_id;
    state.userA.session_token = res.body.session_token;
    state.userA.refresh_token = res.body.refresh_token;
  });

  // Register User B
  await test('POST /auth/register — User B', async () => {
    state.userB.username = `testuser_b_${suffix}`;
    state.userB.password = 'TestPass456!';
    const res = await request({
      method: 'POST',
      path: `${API}/auth/register`,
      body: {
        username: state.userB.username,
        password: state.userB.password,
        device_name: 'Test Device B',
        device_fingerprint: `fp_b_${suffix}`,
      },
    });
    assertStatus(res, 201, 'Register B');
    state.userB.user_id = res.body.user_id;
    state.userB.session_token = res.body.session_token;
    state.userB.refresh_token = res.body.refresh_token;
  });

  // Register User C
  await test('POST /auth/register — User C', async () => {
    state.userC.username = `testuser_c_${suffix}`;
    state.userC.password = 'TestPass789!';
    const res = await request({
      method: 'POST',
      path: `${API}/auth/register`,
      body: {
        username: state.userC.username,
        password: state.userC.password,
        device_name: 'Test Device C',
        device_fingerprint: `fp_c_${suffix}`,
      },
    });
    assertStatus(res, 201, 'Register C');
    state.userC.user_id = res.body.user_id;
    state.userC.session_token = res.body.session_token;
    state.userC.refresh_token = res.body.refresh_token;
  });

  // Duplicate username
  await test('POST /auth/register — duplicate username returns 409', async () => {
    const res = await request({
      method: 'POST',
      path: `${API}/auth/register`,
      body: {
        username: state.userA.username,
        password: 'AnotherPass1!',
        device_fingerprint: `fp_dup_${suffix}`,
      },
    });
    assertStatus(res, 409, 'Duplicate register');
  });

  // Validation — short username
  await test('POST /auth/register — validation error for short username', async () => {
    const res = await request({
      method: 'POST',
      path: `${API}/auth/register`,
      body: { username: 'ab', password: 'test1234' },
    });
    assertStatus(res, 400, 'Short username');
  });

  // Login
  await test('POST /auth/login — success', async () => {
    const res = await request({
      method: 'POST',
      path: `${API}/auth/login`,
      body: {
        username: state.userA.username,
        password: state.userA.password,
        device_fingerprint: `fp_a_${suffix}`,
        device_name: 'Test Device A',
      },
    });
    assertStatus(res, 200, 'Login');
    assert(!!res.body.session_token, 'Should return session_token');
    assert(!!res.body.refresh_token, 'Should return refresh_token');
    assert(!!res.body.device_id, 'Should return device_id');
    state.userA.session_token = res.body.session_token;
    state.userA.refresh_token = res.body.refresh_token;
    state.userA.device_id = res.body.device_id;
  });

  // Login User B to get device_id
  await test('POST /auth/login — User B', async () => {
    const res = await request({
      method: 'POST',
      path: `${API}/auth/login`,
      body: {
        username: state.userB.username,
        password: state.userB.password,
        device_fingerprint: `fp_b_${suffix}`,
        device_name: 'Test Device B',
      },
    });
    assertStatus(res, 200, 'Login B');
    state.userB.session_token = res.body.session_token;
    state.userB.refresh_token = res.body.refresh_token;
    state.userB.device_id = res.body.device_id;
  });

  // Login User C
  await test('POST /auth/login — User C', async () => {
    const res = await request({
      method: 'POST',
      path: `${API}/auth/login`,
      body: {
        username: state.userC.username,
        password: state.userC.password,
        device_fingerprint: `fp_c_${suffix}`,
        device_name: 'Test Device C',
      },
    });
    assertStatus(res, 200, 'Login C');
    state.userC.session_token = res.body.session_token;
    state.userC.refresh_token = res.body.refresh_token;
    state.userC.device_id = res.body.device_id;
  });

  // Invalid credentials
  await test('POST /auth/login — invalid password returns 401', async () => {
    const res = await request({
      method: 'POST',
      path: `${API}/auth/login`,
      body: {
        username: state.userA.username,
        password: 'wrongpassword',
      },
    });
    assertStatus(res, 401, 'Bad credentials');
  });

  // Get current user
  await test('GET /auth/me — authenticated', async () => {
    const res = await request({
      method: 'GET',
      path: `${API}/auth/me`,
      token: state.userA.session_token,
    });
    assertStatus(res, 200, 'Auth me');
    assert(res.body.username === state.userA.username, `Username should match: ${res.body.username}`);
    assert(!!res.body.id, 'Should have id');
  });

  // Auth required
  await test('GET /auth/me — no token returns 401', async () => {
    const res = await request({ method: 'GET', path: `${API}/auth/me` });
    assertStatus(res, 401, 'No token');
  });

  // Refresh token
  await test('POST /auth/refresh — success', async () => {
    const res = await request({
      method: 'POST',
      path: `${API}/auth/refresh`,
      body: { refresh_token: state.userA.refresh_token },
    });
    assertStatus(res, 200, 'Refresh');
    assert(!!res.body.session_token, 'Should return new session_token');
    assert(!!res.body.refresh_token, 'Should return new refresh_token');
    // Update tokens
    state.userA.session_token = res.body.session_token;
    state.userA.refresh_token = res.body.refresh_token;
  });

  // Get devices
  await test('GET /auth/devices — list devices', async () => {
    const res = await request({
      method: 'GET',
      path: `${API}/auth/devices`,
      token: state.userA.session_token,
    });
    assertStatus(res, 200, 'Devices');
    assert(Array.isArray(res.body.devices), 'Should return devices array');
    assert(res.body.devices.length >= 1, 'Should have at least 1 device');
  });

  // Push token
  await test('POST /auth/devices/push-token — register token', async () => {
    const res = await request({
      method: 'POST',
      path: `${API}/auth/devices/push-token`,
      token: state.userA.session_token,
      body: { push_token: 'test-push-token-123' },
    });
    assertStatus(res, 200, 'Push token');
    assert(res.body.success === true, 'Should return success');
  });
}

// ======================== USER TESTS ========================

async function userTests() {
  console.log('\n👤 User Routes');

  // Update profile
  await test('PUT /users/me — update profile', async () => {
    const res = await request({
      method: 'PUT',
      path: `${API}/users/me`,
      token: state.userA.session_token,
      body: {
        display_name: 'Test User Alpha',
        bio: 'I am a test user',
      },
    });
    assertStatus(res, 200, 'Update profile');
  });

  // Update privacy
  await test('PUT /users/me/privacy — update privacy settings', async () => {
    const res = await request({
      method: 'PUT',
      path: `${API}/users/me/privacy`,
      token: state.userA.session_token,
      body: {
        show_online_status: true,
        show_last_seen: false,
        allow_read_receipts: true,
      },
    });
    assertStatus(res, 200, 'Update privacy');
    assert(!!res.body.privacy_settings, 'Should return privacy_settings');
  });

  // Search users
  await test('GET /users/search — find user B', async () => {
    const res = await request({
      method: 'GET',
      path: `${API}/users/search?query=${state.userB.username.substring(0, 10)}`,
      token: state.userA.session_token,
    });
    assertStatus(res, 200, 'Search users');
    assert(Array.isArray(res.body.users), 'Should return users array');
    assert(res.body.users.length >= 1, 'Should find at least 1 user');
  });

  // Search validation
  await test('GET /users/search — short query returns 400', async () => {
    const res = await request({
      method: 'GET',
      path: `${API}/users/search?query=a`,
      token: state.userA.session_token,
    });
    assertStatus(res, 400, 'Short query');
  });

  // Get user by ID
  await test('GET /users/:userId — get user B', async () => {
    const res = await request({
      method: 'GET',
      path: `${API}/users/${state.userB.user_id}`,
      token: state.userA.session_token,
    });
    assertStatus(res, 200, 'Get user');
    assert(res.body.user_id === state.userB.user_id, 'user_id should match');
    assert(!!res.body.username, 'Should have username');
  });

  // Get user not found
  await test('GET /users/:userId — non-existent returns 404', async () => {
    const res = await request({
      method: 'GET',
      path: `${API}/users/00000000-0000-0000-0000-000000000000`,
      token: state.userA.session_token,
    });
    assertStatus(res, 404, 'User not found');
  });

  // Get public key
  await test('GET /users/:userId/public-key — get public key', async () => {
    const res = await request({
      method: 'GET',
      path: `${API}/users/${state.userB.user_id}/public-key`,
      token: state.userA.session_token,
    });
    assertStatus(res, 200, 'Public key');
    assert(res.body.user_id === state.userB.user_id, 'user_id should match');
  });

  // Add contact
  await test('POST /users/contacts — add user B as contact', async () => {
    const res = await request({
      method: 'POST',
      path: `${API}/users/contacts`,
      token: state.userA.session_token,
      body: { contact_id: state.userB.user_id, nickname: 'Best Friend' },
    });
    assertStatus(res, 201, 'Add contact');
  });

  // Add self as contact (should fail)
  await test('POST /users/contacts — cannot add self', async () => {
    const res = await request({
      method: 'POST',
      path: `${API}/users/contacts`,
      token: state.userA.session_token,
      body: { contact_id: state.userA.user_id },
    });
    assertStatus(res, 400, 'Self contact');
  });

  // List contacts
  await test('GET /users/contacts/list — list contacts', async () => {
    const res = await request({
      method: 'GET',
      path: `${API}/users/contacts/list`,
      token: state.userA.session_token,
    });
    assertStatus(res, 200, 'List contacts');
    assert(Array.isArray(res.body.contacts), 'Should return contacts array');
    assert(res.body.contacts.length >= 1, 'Should have at least 1 contact');
  });

  // Block contact
  await test('PUT /users/contacts/:contactId/block — block user B', async () => {
    const res = await request({
      method: 'PUT',
      path: `${API}/users/contacts/${state.userB.user_id}/block`,
      token: state.userA.session_token,
    });
    assertStatus(res, 200, 'Block contact');
  });

  // Get blocked contacts
  await test('GET /users/contacts/blocked — list blocked', async () => {
    const res = await request({
      method: 'GET',
      path: `${API}/users/contacts/blocked`,
      token: state.userA.session_token,
    });
    assertStatus(res, 200, 'Blocked contacts');
    assert(Array.isArray(res.body.blocked), 'Should return blocked array');
    assert(res.body.blocked.length >= 1, 'Should have at least 1 blocked');
  });

  // Unblock contact
  await test('PUT /users/contacts/:contactId/unblock — unblock user B', async () => {
    const res = await request({
      method: 'PUT',
      path: `${API}/users/contacts/${state.userB.user_id}/unblock`,
      token: state.userA.session_token,
    });
    assertStatus(res, 200, 'Unblock contact');
  });

  // Delete contact
  await test('DELETE /users/contacts/:contactId — remove contact', async () => {
    const res = await request({
      method: 'DELETE',
      path: `${API}/users/contacts/${state.userB.user_id}`,
      token: state.userA.session_token,
    });
    assertStatus(res, 204, 'Delete contact');
  });

  // Re-add contact for later tests
  await test('POST /users/contacts — re-add user B', async () => {
    const res = await request({
      method: 'POST',
      path: `${API}/users/contacts`,
      token: state.userA.session_token,
      body: { contact_id: state.userB.user_id },
    });
    assertStatus(res, 201, 'Re-add contact');
  });
}

// ======================== MESSAGE TESTS ========================

async function messageTests() {
  console.log('\n💬 Message Routes');

  // Create conversation
  await test('POST /messages/conversations — create one-to-one conversation', async () => {
    const res = await request({
      method: 'POST',
      path: `${API}/messages/conversations`,
      token: state.userA.session_token,
      body: { recipient_id: state.userB.user_id },
    });
    assertStatus(res, [200, 201], 'Create conversation');
    assert(!!res.body.conversation_id, 'Should return conversation_id');
    state.conversationId = res.body.conversation_id;
  });

  // Get conversations list
  await test('GET /messages/conversations — list conversations', async () => {
    const res = await request({
      method: 'GET',
      path: `${API}/messages/conversations`,
      token: state.userA.session_token,
    });
    assertStatus(res, 200, 'Get conversations');
    assert(Array.isArray(res.body.conversations), 'Should return conversations array');
  });

  // Legacy conversations list
  await test('GET /messages/conversations/list — legacy list', async () => {
    const res = await request({
      method: 'GET',
      path: `${API}/messages/conversations/list`,
      token: state.userA.session_token,
    });
    assertStatus(res, 200, 'Legacy conversations list');
    assert(Array.isArray(res.body.conversations), 'Should return conversations array');
  });

  // Send message via REST (with conversation_id)
  await test('POST /messages — send message with conversation_id', async () => {
    const res = await request({
      method: 'POST',
      path: `${API}/messages`,
      token: state.userA.session_token,
      body: {
        conversation_id: state.conversationId,
        encrypted_content: 'encrypted_hello_world',
        message_type: 'text',
      },
    });
    assertStatus(res, 201, 'Send message');
    assert(!!res.body.message_id, 'Should return message_id');
    state.messageId = res.body.message_id;
  });

  // Send message via recipient_id (auto-creates or finds conversation)
  await test('POST /messages — send message with recipient_id', async () => {
    const res = await request({
      method: 'POST',
      path: `${API}/messages`,
      token: state.userA.session_token,
      body: {
        recipient_id: state.userB.user_id,
        encrypted_content: 'encrypted_message_2',
        message_type: 'text',
      },
    });
    assertStatus(res, 201, 'Send via recipient_id');
    assert(!!res.body.message_id, 'Should return message_id');
  });

  // Send message with reply metadata
  await test('POST /messages — send reply message', async () => {
    const res = await request({
      method: 'POST',
      path: `${API}/messages`,
      token: state.userB.session_token,
      body: {
        conversation_id: state.conversationId,
        encrypted_content: 'encrypted_reply',
        message_type: 'text',
        reply_to_id: state.messageId,
      },
    });
    assertStatus(res, 201, 'Reply message');
  });

  // Send message — validation (no content)
  await test('POST /messages — missing content returns 400', async () => {
    const res = await request({
      method: 'POST',
      path: `${API}/messages`,
      token: state.userA.session_token,
      body: {
        conversation_id: state.conversationId,
      },
    });
    assertStatus(res, 400, 'Missing content');
  });

  // Get messages
  await test('GET /messages/:conversationId — get messages', async () => {
    const res = await request({
      method: 'GET',
      path: `${API}/messages/${state.conversationId}`,
      token: state.userA.session_token,
    });
    assertStatus(res, 200, 'Get messages');
    assert(Array.isArray(res.body.messages), 'Should return messages array');
    assert(res.body.messages.length >= 2, `Should have 2+ messages, got ${res.body.messages.length}`);
  });

  // Get messages — not a participant
  await test('GET /messages/:conversationId — non-participant returns 403', async () => {
    const res = await request({
      method: 'GET',
      path: `${API}/messages/${state.conversationId}`,
      token: state.userC.session_token,
    });
    assertStatus(res, 403, 'Non-participant');
  });

  // Edit message
  await test('PUT /messages/:messageId — edit message', async () => {
    const res = await request({
      method: 'PUT',
      path: `${API}/messages/${state.messageId}`,
      token: state.userA.session_token,
      body: { encrypted_content: 'encrypted_edited_content' },
    });
    assertStatus(res, 200, 'Edit message');
    assert(!!res.body.message_id, 'Should return message_id');
  });

  // Mark message read
  await test('PUT /messages/:messageId/read — mark as read', async () => {
    const res = await request({
      method: 'PUT',
      path: `${API}/messages/${state.messageId}/read`,
      token: state.userB.session_token,
    });
    assertStatus(res, 204, 'Mark read');
  });

  // Read all in conversation
  await test('PUT /messages/conversations/:conversationId/read-all — mark all read', async () => {
    const res = await request({
      method: 'PUT',
      path: `${API}/messages/conversations/${state.conversationId}/read-all`,
      token: state.userB.session_token,
    });
    assertStatus(res, 204, 'Read all');
  });

  // Search messages
  await test('POST /messages/search — search messages', async () => {
    const res = await request({
      method: 'POST',
      path: `${API}/messages/search`,
      token: state.userA.session_token,
      body: {
        conversation_id: state.conversationId,
        message_type: 'text',
        limit: 10,
      },
    });
    assertStatus(res, 200, 'Search messages');
    assert(Array.isArray(res.body.results), 'Should return results array');
    assert(typeof res.body.total === 'number', 'Should return total count');
  });

  // Delete message (for me)
  await test('DELETE /messages/:messageId — delete for me', async () => {
    // Send a msg to delete
    const sendRes = await request({
      method: 'POST',
      path: `${API}/messages`,
      token: state.userA.session_token,
      body: {
        conversation_id: state.conversationId,
        encrypted_content: 'to_delete',
        message_type: 'text',
      },
    });
    const msgId = sendRes.body.message_id;

    const res = await request({
      method: 'DELETE',
      path: `${API}/messages/${msgId}`,
      token: state.userA.session_token,
    });
    assertStatus(res, 204, 'Delete message');
  });

  // Delete for everyone
  await test('DELETE /messages/:messageId?for_everyone=true — delete for everyone', async () => {
    const sendRes = await request({
      method: 'POST',
      path: `${API}/messages`,
      token: state.userA.session_token,
      body: {
        conversation_id: state.conversationId,
        encrypted_content: 'to_delete_all',
        message_type: 'text',
      },
    });
    const msgId = sendRes.body.message_id;

    const res = await request({
      method: 'DELETE',
      path: `${API}/messages/${msgId}?for_everyone=true`,
      token: state.userA.session_token,
    });
    assertStatus(res, 204, 'Delete for everyone');
  });
}

// ======================== GROUP TESTS ========================

async function groupTests() {
  console.log('\n👥 Group Routes');

  // Create group
  await test('POST /groups — create group', async () => {
    const res = await request({
      method: 'POST',
      path: `${API}/groups`,
      token: state.userA.session_token,
      body: {
        name: 'Test Group',
        description: 'A test group for API testing',
        member_ids: [state.userB.user_id],
      },
    });
    assertStatus(res, 201, 'Create group');
    assert(!!res.body.group_id, 'Should return group_id');
    assert(!!res.body.conversation_id, 'Should return conversation_id');
    state.groupId = res.body.group_id;
    state.groupConversationId = res.body.conversation_id;
  });

  // Get group
  await test('GET /groups/:groupId — get group details', async () => {
    const res = await request({
      method: 'GET',
      path: `${API}/groups/${state.groupId}`,
      token: state.userA.session_token,
    });
    assertStatus(res, 200, 'Get group');
    assert(res.body.name === 'Test Group', 'Name should match');
    assert(Array.isArray(res.body.members), 'Should have members array');
    assert(res.body.members.length === 2, `Should have 2 members, got ${res.body.members.length}`);
  });

  // Non-member cannot get group details
  await test('GET /groups/:groupId — non-member returns 403', async () => {
    const res = await request({
      method: 'GET',
      path: `${API}/groups/${state.groupId}`,
      token: state.userC.session_token,
    });
    assertStatus(res, 403, 'Non-member group');
  });

  // Update group
  await test('PUT /groups/:groupId — update group', async () => {
    const res = await request({
      method: 'PUT',
      path: `${API}/groups/${state.groupId}`,
      token: state.userA.session_token,
      body: { name: 'Updated Test Group', description: 'Updated description' },
    });
    assertStatus(res, 200, 'Update group');
  });

  // Non-admin cannot update group
  await test('PUT /groups/:groupId — non-admin returns 403', async () => {
    const res = await request({
      method: 'PUT',
      path: `${API}/groups/${state.groupId}`,
      token: state.userB.session_token,
      body: { name: 'Unauthorized Update' },
    });
    assertStatus(res, 403, 'Non-admin update');
  });

  // Add member
  await test('POST /groups/:groupId/members — add member', async () => {
    const res = await request({
      method: 'POST',
      path: `${API}/groups/${state.groupId}/members`,
      token: state.userA.session_token,
      body: { user_ids: [state.userC.user_id] },
    });
    assertStatus(res, 200, 'Add member');
    assert(Array.isArray(res.body.added), 'Should return added array');
    assert(res.body.added.includes(state.userC.user_id), 'Should include user C');
  });

  // Verify 3 members now
  await test('GET /groups/:groupId — verify 3 members', async () => {
    const res = await request({
      method: 'GET',
      path: `${API}/groups/${state.groupId}`,
      token: state.userA.session_token,
    });
    assertStatus(res, 200, 'Verify members');
    assert(res.body.members.length === 3, `Should have 3 members, got ${res.body.members.length}`);
  });

  // Send message in group
  await test('POST /messages — send message in group conversation', async () => {
    const res = await request({
      method: 'POST',
      path: `${API}/messages`,
      token: state.userA.session_token,
      body: {
        conversation_id: state.groupConversationId,
        encrypted_content: 'group_message_hello',
        message_type: 'text',
      },
    });
    assertStatus(res, 201, 'Group message');
  });

  // Remove member
  await test('DELETE /groups/:groupId/members/:userId — remove member', async () => {
    const res = await request({
      method: 'DELETE',
      path: `${API}/groups/${state.groupId}/members/${state.userC.user_id}`,
      token: state.userA.session_token,
    });
    assertStatus(res, 204, 'Remove member');
  });

  // Self leave
  await test('DELETE /groups/:groupId/members/:userId — self leave', async () => {
    const res = await request({
      method: 'DELETE',
      path: `${API}/groups/${state.groupId}/members/${state.userB.user_id}`,
      token: state.userB.session_token,
    });
    assertStatus(res, 204, 'Self leave');
  });

  // My groups
  await test('GET /groups/my/list — list my groups', async () => {
    const res = await request({
      method: 'GET',
      path: `${API}/groups/my/list`,
      token: state.userA.session_token,
    });
    assertStatus(res, 200, 'My groups');
    assert(Array.isArray(res.body.groups), 'Should return groups array');
    assert(res.body.groups.length >= 1, 'Should have at least 1 group');
  });

  // Create another group to test deletion
  let deleteGroupId = '';
  await test('POST /groups — create group for deletion test', async () => {
    const res = await request({
      method: 'POST',
      path: `${API}/groups`,
      token: state.userA.session_token,
      body: {
        name: 'Group To Delete',
        member_ids: [state.userB.user_id],
      },
    });
    assertStatus(res, 201, 'Create group for delete');
    deleteGroupId = res.body.group_id;
  });

  // Delete group
  await test('DELETE /groups/:groupId — delete group', async () => {
    const res = await request({
      method: 'DELETE',
      path: `${API}/groups/${deleteGroupId}`,
      token: state.userA.session_token,
    });
    assertStatus(res, 204, 'Delete group');
  });
}

// ======================== CALL TESTS ========================

async function callTests() {
  console.log('\n📞 Call Routes');

  // ICE servers
  await test('GET /calls/ice-servers — get ICE config', async () => {
    const res = await request({
      method: 'GET',
      path: `${API}/calls/ice-servers`,
      token: state.userA.session_token,
    });
    assertStatus(res, 200, 'ICE servers');
    assert(Array.isArray(res.body.ice_servers), 'Should return ice_servers array');
    assert(typeof res.body.ttl === 'number', 'Should have TTL');
  });

  // Initiate call
  await test('POST /calls/initiate — initiate audio call', async () => {
    const res = await request({
      method: 'POST',
      path: `${API}/calls/initiate`,
      token: state.userA.session_token,
      body: {
        recipient_id: state.userB.user_id,
        call_type: 'audio',
      },
    });
    assertStatus(res, 201, 'Initiate call');
    assert(!!res.body.call_id, 'Should return call_id');
    state.callId = res.body.call_id;
  });

  // Call status
  await test('GET /calls/:callId/status — get call status', async () => {
    const res = await request({
      method: 'GET',
      path: `${API}/calls/${state.callId}/status`,
      token: state.userA.session_token,
    });
    assertStatus(res, 200, 'Call status');
    assert(res.body.status === 'ringing', `Status should be ringing, got ${res.body.status}`);
    assert(Array.isArray(res.body.participants), 'Should have participants');
  });

  // Answer call
  await test('POST /calls/:callId/answer — answer call', async () => {
    const res = await request({
      method: 'POST',
      path: `${API}/calls/${state.callId}/answer`,
      token: state.userB.session_token,
    });
    assertStatus(res, 200, 'Answer call');
    assert(res.body.status === 'in_progress', 'Status should be in_progress');
  });

  // End call
  await test('POST /calls/:callId/end — end call', async () => {
    const res = await request({
      method: 'POST',
      path: `${API}/calls/${state.callId}/end`,
      token: state.userA.session_token,
    });
    assertStatus(res, 200, 'End call');
    assert(typeof res.body.duration_seconds === 'number', 'Should have duration');
  });

  // Initiate and decline
  await test('POST /calls/:callId/decline — decline call', async () => {
    // Initiate a new call
    const initRes = await request({
      method: 'POST',
      path: `${API}/calls/initiate`,
      token: state.userA.session_token,
      body: { recipient_id: state.userB.user_id, call_type: 'video' },
    });
    assertStatus(initRes, 201, 'Initiate for decline');

    const declineRes = await request({
      method: 'POST',
      path: `${API}/calls/${initRes.body.call_id}/decline`,
      token: state.userB.session_token,
    });
    assertStatus(declineRes, 200, 'Decline call');
    assert(declineRes.body.status === 'declined', 'Status should be declined');
  });

  // Non-participant cannot answer
  await test('POST /calls/:callId/answer — non-participant returns 403', async () => {
    // Initiate a new call between A and B
    const initRes = await request({
      method: 'POST',
      path: `${API}/calls/initiate`,
      token: state.userA.session_token,
      body: { recipient_id: state.userB.user_id, call_type: 'audio' },
    });
    assertStatus(initRes, 201, 'Init for non-participant test');

    const res = await request({
      method: 'POST',
      path: `${API}/calls/${initRes.body.call_id}/answer`,
      token: state.userC.session_token,
    });
    assertStatus(res, 403, 'Non-participant answer');

    // Clean up — end the call
    await request({
      method: 'POST',
      path: `${API}/calls/${initRes.body.call_id}/end`,
      token: state.userA.session_token,
    });
  });

  // Invalid call type
  await test('POST /calls/initiate — invalid call_type returns 400', async () => {
    const res = await request({
      method: 'POST',
      path: `${API}/calls/initiate`,
      token: state.userA.session_token,
      body: { recipient_id: state.userB.user_id, call_type: 'hologram' },
    });
    assertStatus(res, 400, 'Invalid call type');
  });

  // Call history
  await test('GET /calls/history/list — get call history', async () => {
    const res = await request({
      method: 'GET',
      path: `${API}/calls/history/list`,
      token: state.userA.session_token,
    });
    assertStatus(res, 200, 'Call history');
    assert(Array.isArray(res.body.calls), 'Should return calls array');
    assert(res.body.calls.length >= 1, 'Should have at least 1 call');
    assert(typeof res.body.total === 'number', 'Should have total count');
  });

  // Missed call count
  await test('GET /calls/missed/count — get missed call count', async () => {
    const res = await request({
      method: 'GET',
      path: `${API}/calls/missed/count`,
      token: state.userB.session_token,
    });
    assertStatus(res, 200, 'Missed count');
    assert(typeof res.body.missed_count === 'number', 'Should have missed_count');
  });
}

// ======================== FILE TESTS ========================

async function fileTests() {
  console.log('\n📁 File Routes');

  // Create a test file
  const testFilePath = path.join(__dirname, '..', '..', 'uploads', 'test_upload.txt');
  fs.writeFileSync(testFilePath, 'Hello this is a test file for Zynk API testing.');

  // Upload file
  await test('POST /files/upload — upload file', async () => {
    const res = await request({
      method: 'POST',
      path: `${API}/files/upload`,
      token: state.userA.session_token,
      formData: {
        fieldName: 'file',
        filePath: testFilePath,
        fileName: 'test_upload.txt',
        mimeType: 'text/plain',
        extraFields: { conversation_id: state.conversationId },
      },
    });
    assertStatus(res, 201, 'Upload file');
    assert(!!res.body.file_id, 'Should return file_id');
    assert(!!res.body.filename, 'Should return filename');
    assert(typeof res.body.file_size === 'number', 'Should return file_size');
    state.fileId = res.body.file_id;
  });

  // Get file metadata
  await test('GET /files/:fileId — get file metadata', async () => {
    const res = await request({
      method: 'GET',
      path: `${API}/files/${state.fileId}`,
      token: state.userA.session_token,
    });
    assertStatus(res, 200, 'File metadata');
    assert(!!res.body.id, 'Should have file id');
    assert(!!res.body.filename, 'Should have filename');
  });

  // Download file
  await test('GET /files/:fileId/download — download file', async () => {
    const res = await request({
      method: 'GET',
      path: `${API}/files/${state.fileId}/download`,
      token: state.userA.session_token,
    });
    assertStatus(res, 200, 'Download file');
  });

  // Get conversation files
  await test('GET /files/conversation/:conversationId — list files', async () => {
    const res = await request({
      method: 'GET',
      path: `${API}/files/conversation/${state.conversationId}`,
      token: state.userA.session_token,
    });
    assertStatus(res, 200, 'Conversation files');
    assert(Array.isArray(res.body.files), 'Should return files array');
  });

  // File not found
  await test('GET /files/:fileId — non-existent returns 404', async () => {
    const res = await request({
      method: 'GET',
      path: `${API}/files/00000000-0000-0000-0000-000000000000`,
      token: state.userA.session_token,
    });
    assertStatus(res, 404, 'File not found');
  });

  // Delete file
  await test('DELETE /files/:fileId — delete file', async () => {
    const res = await request({
      method: 'DELETE',
      path: `${API}/files/${state.fileId}`,
      token: state.userA.session_token,
    });
    assertStatus(res, 204, 'Delete file');
  });

  // Clean up test file
  try { fs.unlinkSync(testFilePath); } catch { }
}

// ======================== KEY TESTS ========================

async function keyTests() {
  console.log('\n🔑 Key Routes');

  // Upload keys
  await test('POST /keys/upload — upload key bundle', async () => {
    const res = await request({
      method: 'POST',
      path: `${API}/keys/upload`,
      token: state.userA.session_token,
      body: {
        identity_key: 'base64_identity_key_test_data_abc123',
        registration_id: 12345,
        signed_pre_key: {
          key_id: 1,
          public_key: 'base64_signed_pre_key_public',
          signature: 'base64_signature_data',
        },
        pre_keys: [
          { key_id: 1, public_key: 'base64_pre_key_1' },
          { key_id: 2, public_key: 'base64_pre_key_2' },
          { key_id: 3, public_key: 'base64_pre_key_3' },
          { key_id: 4, public_key: 'base64_pre_key_4' },
          { key_id: 5, public_key: 'base64_pre_key_5' },
        ],
      },
    });
    assertStatus(res, 201, 'Upload keys');
    assert(res.body.success === true, 'Should return success');
  });

  // Get pre-key count
  await test('GET /keys/count — get remaining pre-key count', async () => {
    const res = await request({
      method: 'GET',
      path: `${API}/keys/count`,
      token: state.userA.session_token,
    });
    assertStatus(res, 200, 'Pre-key count');
    assert(typeof res.body.remaining_pre_keys === 'number', 'Should have remaining_pre_keys');
    assert(res.body.remaining_pre_keys >= 5, `Should have 5+ pre-keys, got ${res.body.remaining_pre_keys}`);
  });

  // Replenish pre-keys
  await test('POST /keys/replenish — add more pre-keys', async () => {
    const res = await request({
      method: 'POST',
      path: `${API}/keys/replenish`,
      token: state.userA.session_token,
      body: {
        pre_keys: [
          { key_id: 6, public_key: 'base64_pre_key_6' },
          { key_id: 7, public_key: 'base64_pre_key_7' },
          { key_id: 8, public_key: 'base64_pre_key_8' },
        ],
      },
    });
    assertStatus(res, 200, 'Replenish pre-keys');
    assert(typeof res.body.added === 'number', 'Should return added count');
    assert(res.body.added === 3, `Should have added 3, got ${res.body.added}`);
  });

  // Get key bundle for user A (from user B's perspective)
  await test('GET /keys/:userId/bundle — fetch key bundle', async () => {
    const res = await request({
      method: 'GET',
      path: `${API}/keys/${state.userA.user_id}/bundle`,
      token: state.userB.session_token,
    });
    assertStatus(res, 200, 'Key bundle');
    assert(!!res.body.identity_key, 'Should have identity_key');
    assert(!!res.body.signed_pre_key, 'Should have signed_pre_key');
    assert(res.body.signed_pre_key.key_id === 1, 'Signed pre-key key_id should be 1');
    assert(typeof res.body.registration_id === 'number', 'Should have registration_id');
    assert(typeof res.body.remaining_pre_keys === 'number', 'Should have remaining_pre_keys');
  });

  // Bundle for non-existent user
  await test('GET /keys/:userId/bundle — no keys returns 404', async () => {
    const res = await request({
      method: 'GET',
      path: `${API}/keys/00000000-0000-0000-0000-000000000000/bundle`,
      token: state.userA.session_token,
    });
    assertStatus(res, 404, 'No bundle');
  });

  // Get identity key
  await test('GET /keys/:userId/identity — get identity key', async () => {
    const res = await request({
      method: 'GET',
      path: `${API}/keys/${state.userA.user_id}/identity`,
      token: state.userB.session_token,
    });
    assertStatus(res, 200, 'Identity key');
    assert(res.body.user_id === state.userA.user_id, 'user_id should match');
    assert(Array.isArray(res.body.identity_keys), 'Should have identity_keys array');
    assert(res.body.identity_keys.length >= 1, 'Should have at least 1 identity key');
  });

  // Identity not found
  await test('GET /keys/:userId/identity — no identity returns 404', async () => {
    const res = await request({
      method: 'GET',
      path: `${API}/keys/00000000-0000-0000-0000-000000000000/identity`,
      token: state.userA.session_token,
    });
    assertStatus(res, 404, 'No identity key');
  });

  // Upload keys validation
  await test('POST /keys/upload — validation error', async () => {
    const res = await request({
      method: 'POST',
      path: `${API}/keys/upload`,
      token: state.userA.session_token,
      body: {
        identity_key: '',
        registration_id: -1,
      },
    });
    assertStatus(res, 400, 'Key upload validation');
  });
}

// ======================== AUTH CLEANUP TESTS ========================

async function authCleanupTests() {
  console.log('\n🧹 Auth Cleanup & Edge Cases');

  // Force login test (create scenario with 5 devices then force)
  // We test the force-login flow by creating extra devices via login
  await test('POST /auth/force-login — force login with device removal', async () => {
    // Log in user A with different fingerprints to create devices
    const fps = ['fp_extra_1', 'fp_extra_2', 'fp_extra_3'];
    for (const fp of fps) {
      await request({
        method: 'POST',
        path: `${API}/auth/login`,
        body: {
          username: state.userA.username,
          password: state.userA.password,
          device_fingerprint: fp,
          device_name: `Extra ${fp}`,
        },
      });
    }

    // Get the devices list
    const devRes = await request({
      method: 'GET',
      path: `${API}/auth/devices`,
      token: state.userA.session_token,
    });

    if (devRes.status === 200 && devRes.body.devices?.length > 0) {
      const deviceToRemove = devRes.body.devices[devRes.body.devices.length - 1].id;

      const res = await request({
        method: 'POST',
        path: `${API}/auth/force-login`,
        body: {
          username: state.userA.username,
          password: state.userA.password,
          remove_device_id: deviceToRemove,
          device_fingerprint: 'fp_force_test',
          device_name: 'Force Login Device',
        },
      });
      assertStatus(res, 200, 'Force login');
      assert(!!res.body.session_token, 'Should return session_token');
      assert(!!res.body.removed_device_id, 'Should return removed device id');
      // Update tokens
      state.userA.session_token = res.body.session_token;
      state.userA.refresh_token = res.body.refresh_token;
      state.userA.device_id = res.body.device_id;
    }
  });

  // Delete device
  await test('DELETE /auth/devices/:deviceId — delete a device', async () => {
    const devRes = await request({
      method: 'GET',
      path: `${API}/auth/devices`,
      token: state.userA.session_token,
    });

    if (devRes.body.devices?.length > 1) {
      // Delete some extra device that isn't the current one
      const currentDeviceId = state.userA.device_id;
      const deviceToDelete = devRes.body.devices.find((d: any) => d.id !== currentDeviceId);
      if (deviceToDelete) {
        const res = await request({
          method: 'DELETE',
          path: `${API}/auth/devices/${deviceToDelete.id}`,
          token: state.userA.session_token,
        });
        assertStatus(res, 204, 'Delete device');
      }
    }
  });

  // Logout all
  await test('POST /auth/logout-all — logout from all devices (User C)', async () => {
    const res = await request({
      method: 'POST',
      path: `${API}/auth/logout-all`,
      token: state.userC.session_token,
    });
    assertStatus(res, 204, 'Logout all');
  });

  // Verify logout-all invalidated the token
  await test('GET /auth/me — after logout-all returns 401', async () => {
    // Wait a moment to let cache potentially expire
    await new Promise(r => setTimeout(r, 200));
    const res = await request({
      method: 'GET',
      path: `${API}/auth/me`,
      token: state.userC.session_token,
    });
    assertStatus(res, 401, 'After logout-all');
  });

  // Re-login user C for potential further use
  await test('POST /auth/login — re-login User C after logout-all', async () => {
    const res = await request({
      method: 'POST',
      path: `${API}/auth/login`,
      body: {
        username: state.userC.username,
        password: state.userC.password,
        device_fingerprint: `fp_c_relogin_${Date.now()}`,
      },
    });
    assertStatus(res, 200, 'Re-login C');
    state.userC.session_token = res.body.session_token;
    state.userC.refresh_token = res.body.refresh_token;
    state.userC.device_id = res.body.device_id;
  });

  // Logout (single device)
  await test('POST /auth/logout — single device logout', async () => {
    // Login to create a session we can logout
    const loginRes = await request({
      method: 'POST',
      path: `${API}/auth/login`,
      body: {
        username: state.userC.username,
        password: state.userC.password,
        device_fingerprint: `fp_logout_test_${Date.now()}`,
      },
    });
    assertStatus(loginRes, 200, 'Login for logout test');

    const res = await request({
      method: 'POST',
      path: `${API}/auth/logout`,
      token: loginRes.body.session_token,
    });
    assertStatus(res, 204, 'Logout');
  });
}

// ======================== 404 TEST ========================

async function notFoundTest() {
  console.log('\n🚫 Not Found');

  await test('GET /api/v1/nonexistent — returns 404', async () => {
    const res = await request({
      method: 'GET',
      path: `${API}/nonexistent`,
      token: state.userA.session_token,
    });
    assertStatus(res, 404, 'Not found');
  });
}

// ======================== MAIN ========================

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   ZYNK SERVER — COMPREHENSIVE API TEST SUITE    ║');
  console.log('║   Testing against: ' + BASE_URL.padEnd(30) + '║');
  console.log('╚══════════════════════════════════════════════════╝');

  // Verify server is reachable
  try {
    const res = await request({ method: 'GET', path: '/api/health' });
    if (res.status !== 200) {
      console.error('\n❌ Server not healthy. Status:', res.status);
      process.exit(1);
    }
  } catch (err: any) {
    console.error('\n❌ Cannot reach server at', BASE_URL);
    console.error('   Make sure the server is running: cd server && npm run dev');
    console.error('   Error:', err.message);
    process.exit(1);
  }

  const startTime = Date.now();

  try {
    await healthCheck();
    await authTests();
    await userTests();
    await messageTests();
    await groupTests();
    await callTests();
    await fileTests();
    await keyTests();
    await authCleanupTests();
    await notFoundTest();
  } catch (err: any) {
    console.error('\n💥 Fatal error in test suite:', err.message);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('\n══════════════════════════════════════════════════');
  console.log(`   Total:  ${totalTests} tests`);
  console.log(`   Passed: ${passedTests} ✅`);
  console.log(`   Failed: ${failedTests} ❌`);
  console.log(`   Time:   ${elapsed}s`);
  console.log('══════════════════════════════════════════════════');

  if (failures.length > 0) {
    console.log('\n📋 FAILED TESTS:');
    for (const f of failures) {
      console.log(`\n  ❌ ${f.name}`);
      console.log(`     ${f.error}`);
      if (f.details) console.log(`     ${f.details}`);
    }
  }

  console.log('');
  process.exit(failedTests > 0 ? 1 : 0);
}

main();
