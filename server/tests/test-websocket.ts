/**
 * Zynk — WebSocket Real-Time Functionality Test Script
 * Tests Socket.IO events: messaging, typing, presence, call signaling
 *
 * Usage:  npx tsx tests/test-websocket.ts
 */
import { io as ioClient, Socket } from 'socket.io-client';
import http from 'http';

const BASE = 'http://localhost:8000';
const API  = `${BASE}/api/v1`;

// ── Helpers ──────────────────────────────────────────────────

const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN   = '\x1b[36m';
const NC     = '\x1b[0m';

let PASS = 0, FAIL = 0, TOTAL = 0;

function check(name: string, ok: boolean, detail?: string) {
  TOTAL++;
  if (ok) { PASS++; console.log(`  ${GREEN}✓ PASS${NC}  ${name}`); }
  else    { FAIL++; console.log(`  ${RED}✗ FAIL${NC}  ${name}${detail ? ' — ' + detail : ''}`); }
}

function httpPost(path: string, body: object, token?: string): Promise<{ code: number; data: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API + '/');
    const postData = JSON.stringify(body);
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    }, (res) => {
      let raw = '';
      res.on('data', (c) => raw += c);
      res.on('end', () => {
        try { resolve({ code: res.statusCode!, data: JSON.parse(raw || '{}') }); }
        catch { resolve({ code: res.statusCode!, data: raw }); }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function wait(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function waitForEvent<T = any>(socket: Socket, event: string, timeout = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for "${event}"`)), timeout);
    socket.once(event, (data: T) => { clearTimeout(timer); resolve(data); });
  });
}

function waitForFilteredEvent<T = any>(socket: Socket, event: string, filter: (data: T) => boolean, timeout = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(event, handler); reject(new Error(`Timeout waiting for filtered "${event}"`)); }, timeout);
    const handler = (data: T) => {
      if (filter(data)) { clearTimeout(timer); socket.off(event, handler); resolve(data); }
    };
    socket.on(event, handler);
  });
}

function connectSocket(token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(BASE, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
      timeout: 5000,
    });
    const timer = setTimeout(() => { socket.disconnect(); reject(new Error('Connection timeout')); }, 5000);
    socket.on('connect', () => { clearTimeout(timer); resolve(socket); });
    socket.on('connect_error', (err) => { clearTimeout(timer); reject(err); });
  });
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log(`${CYAN}╔═══════════════════════════════════════════════════════════╗${NC}`);
  console.log(`${CYAN}║      ZYNK — WebSocket Real-Time Test Suite               ║${NC}`);
  console.log(`${CYAN}╚═══════════════════════════════════════════════════════════╝${NC}`);
  console.log('');

  // ── 1. Login users ──────────────────────────────────────────
  console.log(`${YELLOW}▸ 1. Login users for WebSocket testing${NC}`);

  const aliceLogin = await httpPost(`${API}/auth/login`, { username: 'alice', password: 'password123' });
  check('Login alice', aliceLogin.code === 200);
  const aliceToken = aliceLogin.data.session_token;
  const aliceId    = aliceLogin.data.user_id;

  const bobLogin = await httpPost(`${API}/auth/login`, { username: 'bob', password: 'password123' });
  check('Login bob', bobLogin.code === 200);
  const bobToken = bobLogin.data.session_token;
  const bobId    = bobLogin.data.user_id;

  const charlieLogin = await httpPost(`${API}/auth/login`, { username: 'charlie', password: 'password123' });
  check('Login charlie', charlieLogin.code === 200);
  const charlieToken = charlieLogin.data.session_token;
  const charlieId    = charlieLogin.data.user_id;

  console.log('');

  // ── 2. Socket Authentication ────────────────────────────────
  console.log(`${YELLOW}▸ 2. Socket.IO Authentication${NC}`);

  let aliceSocket!: Socket;
  let bobSocket!:   Socket;
  let charlieSocket!: Socket;

  try {
    aliceSocket = await connectSocket(aliceToken);
    check('Alice connects with valid JWT', true);
  } catch (e: any) {
    check('Alice connects with valid JWT', false, e.message);
    process.exit(1);
  }

  try {
    bobSocket = await connectSocket(bobToken);
    check('Bob connects with valid JWT', true);
  } catch (e: any) {
    check('Bob connects with valid JWT', false, e.message);
    process.exit(1);
  }

  try {
    charlieSocket = await connectSocket(charlieToken);
    check('Charlie connects with valid JWT', true);
  } catch (e: any) {
    check('Charlie connects with valid JWT', false, e.message);
    process.exit(1);
  }

  // Invalid token should fail
  try {
    const badSocket = await connectSocket('invalid.token.value');
    badSocket.disconnect();
    check('Invalid token rejected', false, 'Connection succeeded but should have failed');
  } catch {
    check('Invalid token rejected', true);
  }

  console.log('');

  // ── 3. Presence ─────────────────────────────────────────────
  console.log(`${YELLOW}▸ 3. Online Presence${NC}`);

  // Eve connects — bob should get the broadcast
  const eveLogin = await httpPost(`${API}/auth/login`, { username: 'eve', password: 'password123' });
  const eveToken = eveLogin.data.session_token;
  const eveId    = eveLogin.data.user_id;

  const onlinePromise = waitForEvent(bobSocket, 'user:online', 5000);
  let eveSocket: Socket;
  try {
    eveSocket = await connectSocket(eveToken);
    const onlineData: any = await onlinePromise;
    check('user:online broadcast received (eve connects)', onlineData.user_id === eveId);
  } catch (e: any) {
    check('user:online broadcast received', false, e.message);
    eveSocket = await connectSocket(eveToken);
  }

  // Disconnect eve and expect user:offline
  const offlinePromise = waitForEvent(bobSocket, 'user:offline', 5000);
  eveSocket!.disconnect();
  try {
    const offlineData: any = await offlinePromise;
    check('user:offline broadcast received (eve disconnects)', offlineData.user_id === eveId);
  } catch (e: any) {
    check('user:offline broadcast received', false, e.message);
  }

  console.log('');

  // ── 4. Real-time Messaging ──────────────────────────────────
  console.log(`${YELLOW}▸ 4. Real-time Messaging${NC}`);

  // Alice sends a DM to Bob via WebSocket
  const bobReceivePromise = waitForEvent(bobSocket, 'message:received', 5000);
  const aliceSentPromise  = waitForEvent(aliceSocket, 'message:sent', 5000);

  aliceSocket.emit('message:send', {
    recipient_id: bobId,
    encrypted_content: 'Hello Bob from WebSocket!',
    message_type: 'text',
  });

  // Check that alice gets send confirmation
  try {
    const sentData: any = await aliceSentPromise;
    check('message:sent confirmation received by alice', !!sentData.message_id && sentData.status === 'sent');
    var wsConvId = sentData.conversation_id;
    var wsMsgId  = sentData.message_id;
  } catch (e: any) {
    check('message:sent confirmation received by alice', false, e.message);
  }

  // Check that bob receives the message
  try {
    const recvData: any = await bobReceivePromise;
    check('message:received by bob', recvData.encrypted_content === 'Hello Bob from WebSocket!');
    check('Message has sender info', !!recvData.sender_username);
  } catch (e: any) {
    check('message:received by bob', false, e.message);
    check('Message has sender info', false, 'No data');
  }

  // Status update (delivered) — alice should get notified
  try {
    const statusData: any = await waitForEvent(aliceSocket, 'message:status', 3000);
    check('message:status (delivered) received by alice', statusData.status === 'delivered');
  } catch (e: any) {
    check('message:status (delivered) received by alice', false, e.message);
  }

  // Bob sends back a message on the same conversation
  const aliceReceivePromise = waitForEvent(aliceSocket, 'message:received', 5000);
  bobSocket.emit('message:send', {
    conversation_id: wsConvId!,
    encrypted_content: 'Hey Alice, WebSocket reply!',
    message_type: 'text',
  });

  try {
    const recvData: any = await aliceReceivePromise;
    check('Alice receives Bob\'s reply in real-time', recvData.encrypted_content === 'Hey Alice, WebSocket reply!');
  } catch (e: any) {
    check('Alice receives Bob\'s reply in real-time', false, e.message);
  }

  // Small drain to let any pending message:received from Bob's own message settle
  await wait(500);

  // Alice sends a reply-to message
  const bobReplyPromise = waitForFilteredEvent(bobSocket, 'message:received',
    (d: any) => d.encrypted_content === 'This is a reply!', 5000);
  aliceSocket.emit('message:send', {
    conversation_id: wsConvId,
    encrypted_content: 'This is a reply!',
    message_type: 'text',
    reply_to_id: wsMsgId,
  });

  try {
    const recvData: any = await bobReplyPromise;
    const meta = typeof recvData.metadata === 'string' ? JSON.parse(recvData.metadata) : recvData.metadata;
    check('Reply message carries reply_to_id metadata', meta?.reply_to_id === wsMsgId);
  } catch (e: any) {
    check('Reply message carries reply_to_id metadata', false, e.message);
  }

  console.log('');

  // ── 5. Read Receipts ────────────────────────────────────────
  console.log(`${YELLOW}▸ 5. Read Receipts${NC}`);

  // Drain any pending message:status events (e.g. delivered from reply-to)
  await wait(500);

  // Bob marks the first message as read
  const aliceReadPromise = waitForFilteredEvent(aliceSocket, 'message:status',
    (d: any) => d.status === 'read', 5000);
  bobSocket.emit('message:read', {
    message_id: wsMsgId,
    conversation_id: wsConvId,
  });

  try {
    const readData: any = await aliceReadPromise;
    check('message:status (read) received by alice', readData.status === 'read');
    check('read_by is bob', readData.read_by === bobId);
  } catch (e: any) {
    check('message:status (read) received by alice', false, e.message);
    check('read_by is bob', false, 'No data');
  }

  console.log('');

  // ── 6. Typing Indicators ───────────────────────────────────
  console.log(`${YELLOW}▸ 6. Typing Indicators${NC}`);

  // Join both sockets to conversation room explicitly
  aliceSocket.emit('conversation:join', { conversation_id: wsConvId });
  bobSocket.emit('conversation:join', { conversation_id: wsConvId });
  await wait(200);

  // Alice starts typing → bob should get it
  const bobTypingStartPromise = waitForEvent(bobSocket, 'typing:start', 3000);
  aliceSocket.emit('typing:start', { conversation_id: wsConvId });

  try {
    const typingData: any = await bobTypingStartPromise;
    check('typing:start received by bob', typingData.conversation_id === wsConvId && typingData.user_id === aliceId);
  } catch (e: any) {
    check('typing:start received by bob', false, e.message);
  }

  // Alice stops typing
  const bobTypingStopPromise = waitForEvent(bobSocket, 'typing:stop', 3000);
  aliceSocket.emit('typing:stop', { conversation_id: wsConvId });

  try {
    const typingData: any = await bobTypingStopPromise;
    check('typing:stop received by bob', typingData.conversation_id === wsConvId && typingData.user_id === aliceId);
  } catch (e: any) {
    check('typing:stop received by bob', false, e.message);
  }

  console.log('');

  // ── 7. WebRTC Call Signaling ────────────────────────────────
  console.log(`${YELLOW}▸ 7. WebRTC Call Signaling${NC}`);

  // Alice calls bob via WebSocket
  const bobIncomingPromise = waitForEvent(bobSocket, 'call:incoming', 5000);
  const aliceInitiatedPromise = waitForEvent(aliceSocket, 'call:initiated', 5000);

  aliceSocket.emit('call:initiate', {
    recipient_id: bobId,
    call_type: 'video',
    sdp_offer: 'fake-sdp-offer-data-for-testing',
  });

  let wsCallId!: string;

  try {
    const initiated: any = await aliceInitiatedPromise;
    check('call:initiated confirmation sent to alice', initiated.status === 'ringing');
    wsCallId = initiated.call_id;
  } catch (e: any) {
    check('call:initiated confirmation sent to alice', false, e.message);
  }

  try {
    const incoming: any = await bobIncomingPromise;
    check('call:incoming received by bob', incoming.caller_id === aliceId);
    check('SDP offer forwarded', incoming.sdp_offer === 'fake-sdp-offer-data-for-testing');
    check('Call type correct (video)', incoming.call_type === 'video');
    if (!wsCallId!) wsCallId = incoming.call_id;
  } catch (e: any) {
    check('call:incoming received by bob', false, e.message);
    check('SDP offer forwarded', false, 'No data');
    check('Call type correct (video)', false, 'No data');
  }

  // Bob answers
  const aliceAnsweredPromise = waitForEvent(aliceSocket, 'call:answered', 5000);
  bobSocket.emit('call:answer', {
    call_id: wsCallId!,
    sdp_answer: 'fake-sdp-answer-data',
  });

  try {
    const answered: any = await aliceAnsweredPromise;
    check('call:answered received by alice', answered.answerer_id === bobId);
    check('SDP answer forwarded', answered.sdp_answer === 'fake-sdp-answer-data');
  } catch (e: any) {
    check('call:answered received by alice', false, e.message);
    check('SDP answer forwarded', false, 'No data');
  }

  // ICE candidate exchange
  const bobIcePromise = waitForEvent(bobSocket, 'call:ice-candidate', 3000);
  aliceSocket.emit('call:ice-candidate', {
    call_id: wsCallId!,
    candidate: 'fake-ice-candidate',
    target_id: bobId,
  });

  try {
    const iceData: any = await bobIcePromise;
    check('call:ice-candidate relayed to bob', iceData.candidate === 'fake-ice-candidate' && iceData.from_id === aliceId);
  } catch (e: any) {
    check('call:ice-candidate relayed to bob', false, e.message);
  }

  // End call
  await wait(1000); // Let the call have some duration
  const aliceEndedPromise = waitForEvent(aliceSocket, 'call:ended', 5000);
  const bobEndedPromise   = waitForEvent(bobSocket, 'call:ended', 5000);
  bobSocket.emit('call:end', { call_id: wsCallId! });

  try {
    const endedA: any = await aliceEndedPromise;
    check('call:ended received by alice', endedA.call_id === wsCallId);
  } catch (e: any) {
    check('call:ended received by alice', false, e.message);
  }

  try {
    const endedB: any = await bobEndedPromise;
    check('call:ended received by bob', endedB.call_id === wsCallId);
    check('Duration tracked', typeof endedB.duration_seconds === 'number');
  } catch (e: any) {
    check('call:ended received by bob', false, e.message);
    check('Duration tracked', false, 'No data');
  }

  // Call decline flow
  console.log('');
  console.log(`${YELLOW}▸ 8. Call Decline Flow${NC}`);

  const charlieIncoming = waitForEvent(charlieSocket, 'call:incoming', 5000);
  aliceSocket.emit('call:initiate', {
    recipient_id: charlieId,
    call_type: 'audio',
    sdp_offer: 'offer-charlie',
  });

  let declineCallId: string;
  try {
    const inc: any = await charlieIncoming;
    check('call:incoming received by charlie', inc.caller_id === aliceId);
    declineCallId = inc.call_id;
  } catch (e: any) {
    check('call:incoming received by charlie', false, e.message);
  }

  if (declineCallId!) {
    const aliceDeclinedPromise = waitForEvent(aliceSocket, 'call:declined', 5000);
    charlieSocket.emit('call:decline', { call_id: declineCallId });

    try {
      const decl: any = await aliceDeclinedPromise;
      check('call:declined received by alice', decl.declined_by === charlieId);
    } catch (e: any) {
      check('call:declined received by alice', false, e.message);
    }
  }

  console.log('');

  // ── 9. Error Handling ───────────────────────────────────────
  console.log(`${YELLOW}▸ 9. Error Handling${NC}`);

  // Send message with no conversation or recipient
  const errorPromise = waitForEvent(aliceSocket, 'error', 3000);
  aliceSocket.emit('message:send', {
    encrypted_content: 'No target!',
    message_type: 'text',
  });

  try {
    const errData: any = await errorPromise;
    check('Error emitted for missing conversation/recipient', !!errData.message);
  } catch (e: any) {
    check('Error emitted for missing conversation/recipient', false, e.message);
  }

  console.log('');

  // ── 10. Multi-user Broadcast ────────────────────────────────
  console.log(`${YELLOW}▸ 10. Multi-user Group Messaging via WebSocket${NC}`);

  // Create a group with bob and charlie via REST
  const groupResp = await httpPost(`${API}/groups`, {
    name: 'WS Test Group',
    description: 'Testing WebSocket group messaging',
    member_ids: [bobId, charlieId],
  }, aliceToken);
  check('Create test group for WS messaging', groupResp.code === 201);
  const groupConvId = groupResp.data.conversation_id;

  // All three join the room
  aliceSocket.emit('conversation:join', { conversation_id: groupConvId });
  bobSocket.emit('conversation:join', { conversation_id: groupConvId });
  charlieSocket.emit('conversation:join', { conversation_id: groupConvId });
  await wait(300);

  // Alice sends group message
  const bobGroupRecv   = waitForEvent(bobSocket, 'message:received', 5000);
  const charlieGroupRecv = waitForEvent(charlieSocket, 'message:received', 5000);

  aliceSocket.emit('message:send', {
    conversation_id: groupConvId,
    encrypted_content: 'Hello group from WebSocket!',
    message_type: 'text',
  });

  try {
    const bobMsg: any = await bobGroupRecv;
    check('Bob receives group message', bobMsg.encrypted_content === 'Hello group from WebSocket!');
  } catch (e: any) {
    check('Bob receives group message', false, e.message);
  }

  try {
    const charlieMsg: any = await charlieGroupRecv;
    check('Charlie receives group message', charlieMsg.encrypted_content === 'Hello group from WebSocket!');
  } catch (e: any) {
    check('Charlie receives group message', false, e.message);
  }

  console.log('');

  // ── Cleanup & Summary ──────────────────────────────────────
  aliceSocket.disconnect();
  bobSocket.disconnect();
  charlieSocket.disconnect();

  console.log(`${CYAN}═══════════════════════════════════════════════════════════${NC}`);
  console.log(`${CYAN}                    TEST RESULTS SUMMARY${NC}`);
  console.log(`${CYAN}═══════════════════════════════════════════════════════════${NC}`);
  console.log('');
  console.log(`  Total Tests:   ${TOTAL}`);
  console.log(`  ${GREEN}Passed:        ${PASS}${NC}`);
  console.log(`  ${RED}Failed:        ${FAIL}${NC}`);
  console.log('');
  if (FAIL === 0) {
    console.log(`  ${GREEN}🎉 ALL TESTS PASSED! Zynk WebSocket system is fully functional.${NC}`);
  } else {
    console.log(`  ${RED}⚠  Some tests failed. Review output above for details.${NC}`);
  }
  console.log('');

  process.exit(FAIL > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
