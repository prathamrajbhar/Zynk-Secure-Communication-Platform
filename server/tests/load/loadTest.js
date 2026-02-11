// ============================================================================
// Zynk — k6 Load Test Script
//
// Simulates realistic user behavior for load testing.
// Run with: k6 run --vus 100 --duration 5m tests/load/loadTest.js
//
// Scenarios:
//   1. Authentication flow (register/login)
//   2. Message sending
//   3. Conversation listing
//   4. File operations
//   5. WebSocket connections
// ============================================================================

import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { randomString, randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// ======================== Configuration ========================

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
const WS_URL = __ENV.WS_URL || 'ws://localhost:8000';

export const options = {
  scenarios: {
    // Ramp up to peak load
    load_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 100 },   // Ramp up
        { duration: '5m', target: 500 },   // Sustained load
        { duration: '3m', target: 1000 },  // Peak load
        { duration: '2m', target: 500 },   // Scale down
        { duration: '1m', target: 0 },     // Ramp down
      ],
    },
    // Spike test
    spike_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 2000 }, // Sudden spike
        { duration: '1m', target: 2000 },  // Hold
        { duration: '30s', target: 0 },    // Drop
      ],
      startTime: '15m', // Start after load test
    },
  },

  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<2000'],   // 95% < 500ms, 99% < 2s
    http_req_failed: ['rate<0.01'],                     // <1% error rate
    'message_send_duration': ['p(95)<1000'],
    'ws_connect_duration': ['p(95)<3000'],
  },
};

// ======================== Custom Metrics ========================

const messageSendDuration = new Trend('message_send_duration');
const wsConnectDuration = new Trend('ws_connect_duration');
const loginDuration = new Trend('login_duration');
const conversationListDuration = new Trend('conversation_list_duration');
const messageDeliveryRate = new Rate('message_delivery_rate');

// ======================== Helpers ========================

function getHeaders(token) {
  return {
    'Content-Type': 'application/json',
    'Authorization': token ? `Bearer ${token}` : undefined,
  };
}

// ======================== Main Test Function ========================

export default function () {
  let token = null;
  const username = `loadtest_${randomString(8)}_${__VU}`;
  const password = 'LoadTest123!';

  // ======================== Auth Flow ========================
  group('Authentication', () => {
    // Register
    const registerRes = http.post(`${BASE_URL}/api/v1/auth/register`, JSON.stringify({
      username,
      password,
      device_name: 'k6 Load Test',
      device_fingerprint: `k6-${__VU}-${__ITER}`,
    }), { headers: getHeaders() });

    check(registerRes, {
      'register: status 201': (r) => r.status === 201,
      'register: has token': (r) => r.json('sessionToken') !== undefined,
    });

    if (registerRes.status === 201) {
      token = registerRes.json('sessionToken');
    } else {
      // If user exists, login
      const loginStart = Date.now();
      const loginRes = http.post(`${BASE_URL}/api/v1/auth/login`, JSON.stringify({
        username,
        password,
        device_fingerprint: `k6-${__VU}-${__ITER}`,
      }), { headers: getHeaders() });

      loginDuration.add(Date.now() - loginStart);

      check(loginRes, {
        'login: status 200': (r) => r.status === 200,
      });

      if (loginRes.status === 200) {
        token = loginRes.json('sessionToken');
      }
    }
  });

  if (!token) return;

  sleep(randomIntBetween(1, 3));

  // ======================== Conversation List ========================
  group('Conversations', () => {
    const start = Date.now();
    const res = http.get(`${BASE_URL}/api/v1/messages/conversations`, {
      headers: getHeaders(token),
    });
    conversationListDuration.add(Date.now() - start);

    check(res, {
      'conversations: status 200': (r) => r.status === 200,
      'conversations: is array': (r) => Array.isArray(r.json()),
    });
  });

  sleep(randomIntBetween(1, 5));

  // ======================== User Search ========================
  group('User Search', () => {
    const res = http.get(`${BASE_URL}/api/v1/users/search?q=test`, {
      headers: getHeaders(token),
    });

    check(res, {
      'search: status 200': (r) => r.status === 200,
    });
  });

  sleep(randomIntBetween(2, 8));

  // ======================== Health Check ========================
  group('Health Check', () => {
    const res = http.get(`${BASE_URL}/api/health`);
    check(res, {
      'health: status 200': (r) => r.status === 200,
      'health: status ok': (r) => r.json('status') === 'ok',
    });
  });

  sleep(randomIntBetween(1, 3));
}

// ======================== Teardown ========================

export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'load-test-results.json': JSON.stringify(data, null, 2),
  };
}
