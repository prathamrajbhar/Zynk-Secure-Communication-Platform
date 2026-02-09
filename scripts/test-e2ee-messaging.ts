#!/usr/bin/env npx tsx
/**
 * Zynk E2EE Messaging Integration Test — v3 (simplified)
 *
 * Tests the full end-to-end encrypted messaging flow using the new
 * ECDH + HKDF + AES-256-GCM pipeline (no sessions, no ratchets).
 *
 * Flow tested:
 *  1. Register two users (A & B)
 *  2. Generate ECDH P-256 key pairs, upload public keys
 *  3. Derive shared AES key: ECDH(A_priv, B_pub) === ECDH(B_priv, A_pub)
 *  4. WebSocket connections
 *  5. Encrypt + send A → B, receive + decrypt on B
 *  6. Encrypt + send B → A, receive + decrypt on A
 *  7. Verify own-message decryption
 *  8. Verify REST persistence (server never stores plaintext)
 *  9. Sequential messages
 *
 * Run:  npx tsx scripts/test-e2ee-messaging.ts
 *   or: bash scripts/test-e2ee.sh
 */

import nodeCrypto from 'crypto';
import { io as ioClient, Socket } from 'socket.io-client';

// ─── Config ───────────────────────────────────────────────────────────────────
const API_BASE = process.env.API_BASE || 'http://localhost:8000/api/v1';
const WS_URL = process.env.WS_URL || 'http://localhost:8000';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(tag: string, msg: string) {
  const color: Record<string, string> = {
    INFO: '\x1b[36m', PASS: '\x1b[32m', FAIL: '\x1b[31m',
    WARN: '\x1b[33m', CRYPTO: '\x1b[35m',
  };
  console.log(`${color[tag] || ''}[${tag}]\x1b[0m ${msg}`);
}

async function api(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const text = await res.text();
  let body: any;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body, ok: res.ok };
}

function authedApi(token: string) {
  return (path: string, opts: RequestInit = {}) =>
    api(path, { ...opts, headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) } });
}

// ─── Crypto helpers (mirrors web/src/lib/crypto.ts v3) ────────────────────────

/** Generate ECDH P-256 key pair — returns raw-format public key (65 bytes) */
function generateKeyPair() {
  const ecdh = nodeCrypto.createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    publicKeyBase64: ecdh.getPublicKey('base64'), // raw uncompressed (65 bytes)
    privateKeyRaw: ecdh.getPrivateKey(),           // Buffer for ECDH compute
    publicKeyRaw: ecdh.getPublicKey(),             // Buffer
  };
}

/** Derive AES-256-GCM key from ECDH shared bits + HKDF — same as browser */
function deriveAESKey(myPrivateRaw: Buffer, theirPublicRaw: Buffer): Buffer {
  const ecdh = nodeCrypto.createECDH('prime256v1');
  ecdh.setPrivateKey(myPrivateRaw);
  const sharedBits = ecdh.computeSecret(theirPublicRaw);

  // HKDF(sha256, sharedBits, zero-salt-32, "zynk-e2ee-v3", 32)
  return Buffer.from(nodeCrypto.hkdfSync(
    'sha256', sharedBits, Buffer.alloc(32), 'zynk-e2ee-v3', 32,
  ));
}

interface EncryptedEnvelope {
  v: 3;
  ct: string;
  iv: string;
  sk: string;
}

/** Encrypt — mirrors encryptText in crypto.ts */
function encrypt(aesKey: Buffer, plaintext: string, senderPubBase64: string): string {
  const iv = nodeCrypto.randomBytes(12);
  const cipher = nodeCrypto.createCipheriv('aes-256-gcm', aesKey, iv, { authTagLength: 16 });
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const ct = Buffer.concat([enc, tag]).toString('base64');

  const envelope: EncryptedEnvelope = {
    v: 3,
    ct,
    iv: iv.toString('base64'),
    sk: senderPubBase64,
  };
  return JSON.stringify(envelope);
}

/** Decrypt — mirrors decryptText in crypto.ts */
function decrypt(aesKey: Buffer, envelopeJson: string): string {
  const env: EncryptedEnvelope = JSON.parse(envelopeJson);
  const ctBuf = Buffer.from(env.ct, 'base64');
  const ivBuf = Buffer.from(env.iv, 'base64');

  const data = ctBuf.subarray(0, ctBuf.length - 16);
  const tag = ctBuf.subarray(ctBuf.length - 16);

  const decipher = nodeCrypto.createDecipheriv('aes-256-gcm', aesKey, ivBuf, { authTagLength: 16 });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

// ─── WebSocket ────────────────────────────────────────────────────────────────

function connectWS(token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(WS_URL, {
      auth: { token }, transports: ['websocket'], reconnection: false,
    });
    const t = setTimeout(() => { socket.disconnect(); reject(new Error('WS timeout')); }, 10000);
    socket.on('connect', () => { clearTimeout(t); resolve(socket); });
    socket.on('connect_error', (e) => { clearTimeout(t); reject(e); });
  });
}

function waitForEvent<T = any>(socket: Socket, event: string, ms = 10000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { socket.off(event); reject(new Error(`Timeout: ${event}`)); }, ms);
    socket.once(event, (d: T) => { clearTimeout(t); resolve(d); });
  });
}

// ─── Build dummy key upload payload for server compat ─────────────────────────

function buildUploadPayload(identityPubBase64: string) {
  const spk = generateKeyPair();
  const preKeys = Array.from({ length: 5 }, (_, i) => ({
    key_id: i + 1,
    public_key: generateKeyPair().publicKeyBase64,
  }));
  return {
    identity_key: identityPubBase64,
    registration_id: Math.floor(Math.random() * 16380) + 1,
    signed_pre_key: {
      key_id: 1,
      public_key: spk.publicKeyBase64,
      signature: nodeCrypto.randomBytes(64).toString('base64'),
    },
    pre_keys: preKeys,
  };
}

// ─── Test Runner ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) { log('PASS', `✓ ${msg}`); passed++; }
  else { log('FAIL', `✗ ${msg}`); failed++; }
}

async function main() {
  log('INFO', '═══════════════════════════════════════════════════════');
  log('INFO', '  Zynk E2EE v3 Integration Test');
  log('INFO', '═══════════════════════════════════════════════════════');

  // Health check
  try {
    const h = await api('/../../api/health');
    if (!h.ok) throw new Error('not ok');
    log('PASS', 'Server is running'); passed++;
  } catch (e: any) {
    log('FAIL', `Server not running: ${e.message}`);
    process.exit(1);
  }

  const ts = Date.now();
  const pw = 'TestPass1234';

  // ── Step 1: Register ──────────────────────────────────────────────────────
  log('INFO', '\n── Step 1: Register two users ──');

  const regA = await api('/auth/register', { method: 'POST', body: JSON.stringify({ username: `alice_${ts}`, password: pw }) });
  assert(regA.ok, `Register Alice — ${regA.status}`);
  const A = { id: regA.body.user_id, token: regA.body.session_token };

  const regB = await api('/auth/register', { method: 'POST', body: JSON.stringify({ username: `bob_${ts}`, password: pw }) });
  assert(regB.ok, `Register Bob — ${regB.status}`);
  const B = { id: regB.body.user_id, token: regB.body.session_token };

  // ── Step 2: Generate & upload keys ────────────────────────────────────────
  log('INFO', '\n── Step 2: Generate & upload ECDH key pairs ──');

  const kpA = generateKeyPair();
  const kpB = generateKeyPair();

  const upA = await authedApi(A.token)('/keys/upload', { method: 'POST', body: JSON.stringify(buildUploadPayload(kpA.publicKeyBase64)) });
  assert(upA.ok, `Upload keys for Alice — ${upA.status}`);

  const upB = await authedApi(B.token)('/keys/upload', { method: 'POST', body: JSON.stringify(buildUploadPayload(kpB.publicKeyBase64)) });
  assert(upB.ok, `Upload keys for Bob — ${upB.status}`);

  // ── Step 3: Fetch remote keys ─────────────────────────────────────────────
  log('INFO', '\n── Step 3: Verify key retrieval ──');

  const fkB = await authedApi(A.token)(`/keys/${B.id}/identity`);
  assert(fkB.ok, `Alice fetched Bob's key — ${fkB.status}`);
  const remotePubB = fkB.body.identity_keys?.[0]?.identity_key;
  assert(remotePubB === kpB.publicKeyBase64, 'Fetched key matches uploaded');

  const fkA = await authedApi(B.token)(`/keys/${A.id}/identity`);
  assert(fkA.ok, `Bob fetched Alice's key — ${fkA.status}`);
  const remotePubA = fkA.body.identity_keys?.[0]?.identity_key;
  assert(remotePubA === kpA.publicKeyBase64, 'Fetched key matches uploaded');

  // ── Step 4: Derive shared AES keys ────────────────────────────────────────
  log('INFO', '\n── Step 4: Derive shared AES keys (ECDH) ──');

  const aesKeyA = deriveAESKey(kpA.privateKeyRaw, Buffer.from(remotePubB, 'base64'));
  const aesKeyB = deriveAESKey(kpB.privateKeyRaw, Buffer.from(remotePubA, 'base64'));
  assert(aesKeyA.equals(aesKeyB), 'Both sides derived the SAME AES key (ECDH symmetry)');
  log('CRYPTO', `Shared AES key: ${aesKeyA.toString('hex').slice(0, 24)}...`);

  // ── Step 5: WebSocket connections ─────────────────────────────────────────
  log('INFO', '\n── Step 5: WebSocket connections ──');

  let wsA = await connectWS(A.token);
  assert(true, `Alice connected (${wsA.id})`);
  let wsB = await connectWS(B.token);
  assert(true, `Bob connected (${wsB.id})`);

  // ── Step 6: Create conversation ───────────────────────────────────────────
  log('INFO', '\n── Step 6: Create conversation ──');

  const cv = await authedApi(A.token)('/messages/conversations', { method: 'POST', body: JSON.stringify({ participant_id: B.id }) });
  assert(cv.ok, `Conversation created — ${cv.status}`);
  const convId = cv.body.conversation_id;

  // Both sides create to join rooms
  await authedApi(B.token)('/messages/conversations', { method: 'POST', body: JSON.stringify({ participant_id: A.id }) });

  // Reconnect to join conversation rooms
  wsA.disconnect(); wsB.disconnect();
  wsA = await connectWS(A.token);
  wsB = await connectWS(B.token);
  await new Promise(r => setTimeout(r, 500));

  // ── Step 7: Encrypt & send A → B ──────────────────────────────────────────
  log('INFO', '\n── Step 7: Encrypt & send (Alice → Bob) ──');

  const ptAB = 'Hello Bob, this is TOP SECRET! 🔐';
  const ctAB = encrypt(aesKeyA, ptAB, kpA.publicKeyBase64);

  log('CRYPTO', `Plaintext:  "${ptAB}"`);
  log('CRYPTO', `Envelope:   ${ctAB.slice(0, 60)}...`);

  const envAB = JSON.parse(ctAB);
  assert(envAB.v === 3, 'Envelope version is 3');
  assert(envAB.ct !== ptAB, 'Ciphertext differs from plaintext');
  assert(envAB.sk === kpA.publicKeyBase64, 'Sender key is Alice\'s public key');

  const recvB = waitForEvent(wsB, 'message:received');
  wsA.emit('message:send', { conversation_id: convId, encrypted_content: ctAB, message_type: 'text', temp_id: `t_${Date.now()}_a` });
  const sentA = await waitForEvent(wsA, 'message:sent');
  assert(!!sentA.message_id, `Server confirmed send (${sentA.message_id})`);

  // ── Step 8: Receive & decrypt on Bob ──────────────────────────────────────
  log('INFO', '\n── Step 8: Receive & decrypt on Bob ──');

  const msgB = await recvB;
  assert(msgB.sender_id === A.id, 'Correct sender_id');
  assert(msgB.conversation_id === convId, 'Correct conversation_id');

  let decB: string;
  try {
    decB = decrypt(aesKeyB, msgB.encrypted_content);
    assert(true, 'Decryption succeeded');
  } catch (e: any) {
    assert(false, `Decryption failed: ${e.message}`);
    process.exit(1);
  }
  assert(decB! === ptAB, `Plaintext matches: "${decB!}"`);

  // ── Step 9: Reply B → A ───────────────────────────────────────────────────
  log('INFO', '\n── Step 9: Encrypt & send reply (Bob → Alice) ──');

  const ptBA = 'Got it! E2EE works both ways! 🎉';
  const ctBA = encrypt(aesKeyB, ptBA, kpB.publicKeyBase64);

  const recvA = waitForEvent(wsA, 'message:received');
  wsB.emit('message:send', { conversation_id: convId, encrypted_content: ctBA, message_type: 'text', temp_id: `t_${Date.now()}_b` });
  const sentB = await waitForEvent(wsB, 'message:sent');
  assert(!!sentB.message_id, `Server confirmed reply (${sentB.message_id})`);

  // ── Step 10: Decrypt reply on Alice ───────────────────────────────────────
  log('INFO', '\n── Step 10: Receive & decrypt reply on Alice ──');

  const msgA = await recvA;
  assert(msgA.sender_id === B.id, 'Correct sender_id');

  let decA: string;
  try {
    decA = decrypt(aesKeyA, msgA.encrypted_content);
    assert(true, 'Reply decryption succeeded');
  } catch (e: any) {
    assert(false, `Reply decryption failed: ${e.message}`);
    process.exit(1);
  }
  assert(decA! === ptBA, `Reply plaintext matches: "${decA!}"`);

  // ── Step 11: Own message decryption ───────────────────────────────────────
  log('INFO', '\n── Step 11: Verify own messages are decryptable ──');

  assert(decrypt(aesKeyA, ctAB) === ptAB, 'Alice can decrypt own sent message');
  assert(decrypt(aesKeyB, ctBA) === ptBA, 'Bob can decrypt own sent reply');

  // ── Step 12: REST persistence ─────────────────────────────────────────────
  log('INFO', '\n── Step 12: Verify messages via REST API ──');

  const rest = await authedApi(A.token)(`/messages/${convId}`);
  assert(rest.ok, `Fetch messages — ${rest.status}`);
  const msgs = rest.body.messages;
  assert(Array.isArray(msgs) && msgs.length >= 2, `${msgs?.length} messages in conversation`);

  for (const m of msgs) {
    try {
      const env = JSON.parse(m.encrypted_content);
      assert(env.v === 3 && !!env.ct && !!env.iv, `Message ${m.id.slice(0, 8)}... is v3 E2EE envelope`);
      const pt = decrypt(aesKeyA, m.encrypted_content);
      assert(pt.length > 0, `REST msg from ${m.sender_id === A.id ? 'Alice' : 'Bob'}: "${pt}"`);
    } catch (e: any) {
      assert(false, `REST message parse/decrypt failed: ${e.message}`);
    }
  }

  // ── Step 13: Server has no plaintext ──────────────────────────────────────
  log('INFO', '\n── Step 13: Server has NO plaintext ──');

  for (const m of msgs) {
    assert(!m.encrypted_content.includes(ptAB), 'No plaintext A→B');
    assert(!m.encrypted_content.includes(ptBA), 'No plaintext B→A');
  }

  // ── Step 14: Sequential messages ──────────────────────────────────────────
  log('INFO', '\n── Step 14: Sequential messages ──');

  for (let i = 0; i < 3; i++) {
    const txt = `Seq msg #${i + 1} from Alice`;
    const ct = encrypt(aesKeyA, txt, kpA.publicKeyBase64);
    const p = waitForEvent(wsB, 'message:received');
    wsA.emit('message:send', { conversation_id: convId, encrypted_content: ct, message_type: 'text', temp_id: `seq_${i}` });
    const r = await p;
    assert(decrypt(aesKeyB, r.encrypted_content) === txt, `Sequential #${i + 1}: "${txt}"`);
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  wsA.disconnect();
  wsB.disconnect();

  // ── Summary ───────────────────────────────────────────────────────────────
  log('INFO', '\n═══════════════════════════════════════════════════════');
  if (failed === 0) {
    log('PASS', `ALL ${passed} TESTS PASSED ✓`);
  } else {
    log('FAIL', `${failed} FAILED, ${passed} passed`);
  }
  log('INFO', '═══════════════════════════════════════════════════════');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  log('FAIL', `Unhandled: ${err.message}`);
  console.error(err);
  process.exit(1);
});
