/**
 * E2EE Crypto Layer for Zynk — Simplified v3
 *
 * Uses Web Crypto API:
 *  - ECDH P-256 for key agreement
 *  - HKDF-SHA256 for key derivation
 *  - AES-256-GCM for authenticated encryption (no separate HMAC needed)
 *
 * Flow:
 *  1. Each user generates an ECDH key pair on registration
 *  2. Public key is uploaded to the server
 *  3. To message user B, user A fetches B's public key
 *  4. Shared secret = ECDH(A_priv, B_pub) = ECDH(B_priv, A_pub)  (commutative)
 *  5. AES key = HKDF(sharedSecret, "zynk-e2ee-v3")
 *  6. Encrypt with AES-256-GCM + random 12-byte IV per message
 *
 * Keys are stored in localStorage as base64 strings.
 * No IndexedDB, no sessions, no ratchets — just works.
 */

// ========== Helpers ==========

export function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64.trim());
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

// ========== Encrypted message envelope ==========

export interface EncryptedEnvelope {
  v: 3;
  ct: string;   // base64 ciphertext
  iv: string;   // base64 IV (12 bytes)
  sk: string;   // sender's public key (base64, raw format)
}

// ========== Key pair generation ==========

export async function generateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
  const kp = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  );
  const pub = arrayBufferToBase64(await crypto.subtle.exportKey('raw', kp.publicKey));
  const priv = arrayBufferToBase64(await crypto.subtle.exportKey('pkcs8', kp.privateKey));
  return { publicKey: pub, privateKey: priv };
}

// ========== Key import helpers ==========

async function importPrivateKey(b64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'pkcs8',
    base64ToArrayBuffer(b64),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits'],
  );
}

async function importPublicKey(b64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    base64ToArrayBuffer(b64),
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    [],
  );
}

// ========== Shared AES key derivation ==========

/**
 * Derive a deterministic AES-256-GCM key from two identity keys.
 * ECDH is commutative so both parties get the same bits.
 */
export async function deriveAESKey(
  myPrivateKeyB64: string,
  theirPublicKeyB64: string,
): Promise<CryptoKey> {
  const priv = await importPrivateKey(myPrivateKeyB64);
  const pub = await importPublicKey(theirPublicKeyB64);

  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: pub },
    priv,
    256,
  );

  // HKDF to stretch the shared secret into an AES key
  const hkdfKey = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32),                         // fixed zero salt
      info: new TextEncoder().encode('zynk-e2ee-v3'),   // context string
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

// ========== Encrypt / Decrypt ==========

export async function encryptText(
  aesKey: CryptoKey,
  plaintext: string,
  senderPublicKey: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    new TextEncoder().encode(plaintext),
  );

  const envelope: EncryptedEnvelope = {
    v: 3,
    ct: arrayBufferToBase64(ct),
    iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
    sk: senderPublicKey,
  };
  return JSON.stringify(envelope);
}

export async function decryptText(
  aesKey: CryptoKey,
  envelopeJson: string,
): Promise<string> {
  const env = JSON.parse(envelopeJson);

  // Only v3 envelopes can be decrypted with this function
  if (env.v !== 3 || !env.ct || !env.iv) {
    throw new Error('UNSUPPORTED_ENVELOPE: not a v3 message');
  }

  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToArrayBuffer(env.iv) },
    aesKey,
    base64ToArrayBuffer(env.ct),
  );
  return new TextDecoder().decode(pt);
}

// ========== Envelope validation ==========

/**
 * Returns true if the string looks like a JSON-encoded encrypted envelope.
 * Used to guard against displaying raw ciphertext in the UI.
 */
export function isValidEncryptedMessage(s: string): boolean {
  if (!s || typeof s !== 'string') return false;
  const t = s.trim();
  if (!t.startsWith('{')) return false;
  try {
    const obj = JSON.parse(t);
    // v3 envelope only
    if (obj.v === 3 && obj.ct && obj.iv) return true;
    return false;
  } catch {
    return false;
  }
}

// ========== Safety number ==========

export async function generateSafetyNumber(
  localPubKey: string,
  remotePubKey: string,
): Promise<string> {
  const [a, b] = [localPubKey, remotePubKey].sort();
  const aBuf = new Uint8Array(base64ToArrayBuffer(a));
  const bBuf = new Uint8Array(base64ToArrayBuffer(b));
  const combined = new Uint8Array(aBuf.length + bBuf.length);
  combined.set(aBuf, 0);
  combined.set(bBuf, aBuf.length);
  let hash: ArrayBuffer = combined.buffer as ArrayBuffer;
  for (let i = 0; i < 5; i++) hash = await crypto.subtle.digest('SHA-256', hash);
  const bytes = new Uint8Array(hash);
  let num = '';
  for (let i = 0; i < 30; i++) {
    num += ((bytes[i % bytes.length] * 256 + bytes[(i + 1) % bytes.length]) % 100000)
      .toString()
      .padStart(5, '0');
  }
  return num.slice(0, 60);
}

// ========== Registration helpers (server key upload compat) ==========

function generateRegistrationId(): number {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return (arr[0] % 16380) + 1;
}

/**
 * Build the payload expected by POST /keys/upload.
 * We only truly need the identity key, but the server schema also requires
 * a signed pre-key and at least one pre-key, so we generate dummies.
 */
export async function buildKeyUploadPayload(publicKeyB64: string) {
  // Generate a dummy signed pre-key (server requires it)
  const spk = await generateKeyPair();
  // Generate a small batch of dummy one-time pre-keys
  const preKeys: { key_id: number; public_key: string }[] = [];
  for (let i = 1; i <= 10; i++) {
    const pk = await generateKeyPair();
    preKeys.push({ key_id: i, public_key: pk.publicKey });
  }

  return {
    identity_key: publicKeyB64,
    registration_id: generateRegistrationId(),
    signed_pre_key: {
      key_id: 1,
      public_key: spk.publicKey,
      signature: arrayBufferToBase64((crypto.getRandomValues(new Uint8Array(64))).buffer as ArrayBuffer),
    },
    pre_keys: preKeys,
  };
}

// ========== Group E2EE — Sender Keys (Simplified) ==========
//
// Group encryption strategy:
//  1. Each group member generates a "sender key" (AES-256 symmetric key)
//  2. The sender key is encrypted to each member individually (using 1:1 ECDH)
//  3. Group messages are encrypted with the sender's sender key
//  4. All members decrypt using the sender's distributed key
//
// Key rotation: sender key regenerated when members change or periodically.

export interface GroupSenderKey {
  key: string;        // base64 AES key (raw exported)
  keyId: number;      // incremented on rotation
  createdAt: number;  // timestamp
}

/**
 * Generate a random AES-256-GCM sender key for group encryption.
 */
export async function generateSenderKey(): Promise<{ key: string; cryptoKey: CryptoKey }> {
  const aesKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
  const raw = await crypto.subtle.exportKey('raw', aesKey);
  return { key: arrayBufferToBase64(raw), cryptoKey: aesKey };
}

/**
 * Import a base64-encoded AES key.
 */
export async function importSenderKey(keyB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    base64ToArrayBuffer(keyB64),
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypt plaintext using a sender key (AES-256-GCM).
 * Returns an envelope JSON string with version flag for group messages.
 */
export async function encryptWithSenderKey(
  senderKey: CryptoKey,
  plaintext: string,
  keyId: number,
  senderPublicKey: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    senderKey,
    new TextEncoder().encode(plaintext),
  );
  return JSON.stringify({
    v: 4,             // v4 = group sender key envelope
    ct: arrayBufferToBase64(ct),
    iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
    sk: senderPublicKey,
    kid: keyId,       // sender key ID for key lookup
  });
}

/**
 * Decrypt a v4 group message using the sender's sender key.
 */
export async function decryptWithSenderKey(
  senderKey: CryptoKey,
  envelopeJson: string,
): Promise<string> {
  const env = JSON.parse(envelopeJson);
  if (env.v !== 4 || !env.ct || !env.iv) throw new Error('Not a v4 group envelope');
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToArrayBuffer(env.iv) },
    senderKey,
    base64ToArrayBuffer(env.ct),
  );
  return new TextDecoder().decode(pt);
}

/**
 * Check if a message is a v4 group-encrypted envelope.
 */
export function isGroupEncryptedMessage(s: string): boolean {
  if (!s || typeof s !== 'string') return false;
  try {
    const obj = JSON.parse(s.trim());
    return obj.v === 4 && !!obj.ct && !!obj.iv && typeof obj.kid === 'number';
  } catch { return false; }
}

/**
 * Check if a string is any kind of encrypted envelope (v3 or v4).
 */
export function isEncryptedMessage(s: string): boolean {
  return isValidEncryptedMessage(s) || isGroupEncryptedMessage(s);
}

// ========== Sender Key Distribution Helpers ==========

/**
 * Encrypt a raw sender key (base64) for distribution to a specific recipient.
 * Uses an existing ECDH-derived AES key shared between sender and recipient.
 * Returns a compact JSON blob: { ct, iv }
 */
export async function encryptSenderKeyForDistribution(
  senderKeyB64: string,
  sharedAesKey: CryptoKey,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    sharedAesKey,
    base64ToArrayBuffer(senderKeyB64),
  );
  return JSON.stringify({
    ct: arrayBufferToBase64(ct),
    iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
  });
}

/**
 * Decrypt a received encrypted sender key distribution blob.
 * Returns the raw sender key as base64.
 */
export async function decryptSenderKeyDistribution(
  encryptedBlob: string,
  sharedAesKey: CryptoKey,
): Promise<string> {
  const { ct, iv } = JSON.parse(encryptedBlob);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToArrayBuffer(iv) },
    sharedAesKey,
    base64ToArrayBuffer(ct),
  );
  return arrayBufferToBase64(plain);
}

