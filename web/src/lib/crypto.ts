/**
 * Signal Protocol Crypto Layer for Zynk
 * 
 * Implements end-to-end encryption using the Web Crypto API following
 * Signal Protocol patterns:
 * - X25519 key agreement (via ECDH P-256 as WebCrypto fallback)
 * - AES-256-GCM message encryption
 * - HKDF key derivation
 * - Double Ratchet session management (simplified)
 * 
 * This uses native Web Crypto API for all cryptographic operations,
 * ensuring no external crypto dependencies.
 */

// ========== Types ==========

export interface KeyPair {
  publicKey: string;      // Base64
  privateKey: string;     // Base64 (stored only locally)
}

export interface PreKeyBundle {
  registrationId: number;
  identityKey: string;    // Base64 public key
  signedPreKey: {
    keyId: number;
    publicKey: string;
    signature: string;
  };
  preKey: {
    keyId: number;
    publicKey: string;
  } | null;
}

export interface EncryptedMessage {
  ciphertext: string;     // Base64
  iv: string;             // Base64
  senderKey: string;      // Base64 ephemeral public key
  sessionId: string;      // To identify the sending session
}

export interface SessionState {
  sessionId: string;
  remoteIdentityKey: string;
  rootKey: string;
  sendChainKey: string;
  receiveChainKey: string;
  sendRatchetKey: string;
  sendRatchetPrivateKey: string;
  receiveRatchetKey: string;
  messageNumber: number;
  established: boolean;
}

// ========== Utility Functions ==========

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function generateRandomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

function generateRegistrationId(): number {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return (arr[0] % 16380) + 1; // 1 to 16380
}

// ========== Key Generation ==========

/**
 * Generate an ECDH key pair for key agreement (identity, signed pre-key, or one-time pre-key)
 */
async function generateECDHKeyPair(): Promise<{ publicKey: CryptoKey; privateKey: CryptoKey; publicKeyBase64: string }> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  );

  const publicKeyRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey);
  const publicKeyBase64 = arrayBufferToBase64(publicKeyRaw);

  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
    publicKeyBase64,
  };
}

/**
 * Export a private key to Base64 for storage
 */
async function exportPrivateKey(key: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey('pkcs8', key);
  return arrayBufferToBase64(exported);
}

/**
 * Import a private key from Base64
 */
async function importPrivateKey(base64: string): Promise<CryptoKey> {
  const buffer = base64ToArrayBuffer(base64);
  return crypto.subtle.importKey(
    'pkcs8',
    buffer,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  );
}

/**
 * Import a public key from Base64
 */
async function importPublicKey(base64: string): Promise<CryptoKey> {
  const buffer = base64ToArrayBuffer(base64);
  return crypto.subtle.importKey(
    'raw',
    buffer,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    []
  );
}

// ========== HKDF Key Derivation ==========

/**
 * HKDF-SHA256: Derive key material from shared secret
 */
async function hkdf(
  inputKeyMaterial: ArrayBuffer,
  salt: ArrayBuffer,
  info: string,
  length: number = 32
): Promise<ArrayBuffer> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    inputKeyMaterial,
    'HKDF',
    false,
    ['deriveBits']
  );

  return crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info: new TextEncoder().encode(info),
    },
    keyMaterial,
    length * 8
  );
}

// ========== Signing ==========

/**
 * Generate an ECDSA key pair for signing pre-keys
 */
async function generateSigningKeyPair(): Promise<{ publicKey: CryptoKey; privateKey: CryptoKey; publicKeyBase64: string }> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );

  const publicKeyRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey);
  const publicKeyBase64 = arrayBufferToBase64(publicKeyRaw);

  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
    publicKeyBase64,
  };
}

/**
 * Sign data with ECDSA private key
 */
async function signData(privateKey: CryptoKey, data: ArrayBuffer): Promise<string> {
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    data
  );
  return arrayBufferToBase64(signature);
}

/**
 * Verify ECDSA signature
 */
async function verifySignature(publicKeyBase64: string, signature: string, data: ArrayBuffer): Promise<boolean> {
  try {
    const publicKeyBuffer = base64ToArrayBuffer(publicKeyBase64);
    const publicKey = await crypto.subtle.importKey(
      'raw',
      publicKeyBuffer,
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['verify']
    );

    return crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      base64ToArrayBuffer(signature),
      data
    );
  } catch {
    return false;
  }
}

// ========== AES-256-GCM Encryption ==========

/**
 * Encrypt plaintext with AES-256-GCM
 */
async function aesEncrypt(plaintext: string, keyBuffer: ArrayBuffer): Promise<{ ciphertext: string; iv: string }> {
  const iv = generateRandomBytes(12); // 96-bit IV for GCM
  const key = await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    encoded
  );

  return {
    ciphertext: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
  };
}

/**
 * Decrypt ciphertext with AES-256-GCM
 */
async function aesDecrypt(ciphertext: string, iv: string, keyBuffer: ArrayBuffer): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToArrayBuffer(iv) },
    key,
    base64ToArrayBuffer(ciphertext)
  );

  return new TextDecoder().decode(decrypted);
}

// ========== File Encryption ==========

/**
 * Encrypt a file blob with AES-256-GCM
 * Returns encrypted blob + key + iv for the recipient
 */
export async function encryptFile(file: File): Promise<{ encryptedBlob: Blob; key: string; iv: string; hash: string }> {
  const fileKey = generateRandomBytes(32); // Random 256-bit key
  const iv = generateRandomBytes(12);

  const key = await crypto.subtle.importKey(
    'raw',
    fileKey as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const fileBuffer = await file.arrayBuffer();

  // Calculate SHA-256 hash of original file
  const hashBuffer = await crypto.subtle.digest('SHA-256', fileBuffer);
  const hash = arrayBufferToBase64(hashBuffer);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    fileBuffer
  );

  return {
    encryptedBlob: new Blob([ciphertext], { type: 'application/octet-stream' }),
    key: arrayBufferToBase64(fileKey.buffer as ArrayBuffer),
    iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
    hash,
  };
}

/**
 * Decrypt a file blob with AES-256-GCM
 */
export async function decryptFile(encryptedBlob: Blob, keyBase64: string, ivBase64: string, mimeType: string): Promise<Blob> {
  const key = await crypto.subtle.importKey(
    'raw',
    base64ToArrayBuffer(keyBase64),
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  const ciphertext = await encryptedBlob.arrayBuffer();

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToArrayBuffer(ivBase64) },
    key,
    ciphertext
  );

  return new Blob([decrypted], { type: mimeType });
}

// ========== Signal-like Session Management ==========

/**
 * Generate a full identity key bundle for initial registration
 */
export async function generateKeyBundle(preKeyCount: number = 50): Promise<{
  registrationId: number;
  identityKeyPair: { publicKey: string; privateKey: string };
  signedPreKey: { keyId: number; publicKey: string; privateKey: string; signature: string };
  preKeys: { keyId: number; publicKey: string; privateKey: string }[];
}> {
  const registrationId = generateRegistrationId();

  // Generate identity key pair (ECDH for key agreement)
  const identityKP = await generateECDHKeyPair();
  const identityPrivateBase64 = await exportPrivateKey(identityKP.privateKey);

  // Generate signing key pair (ECDSA for signing pre-keys) derived from identity
  const signingKP = await generateSigningKeyPair();

  // Generate signed pre-key
  const signedPreKP = await generateECDHKeyPair();
  const signedPrePrivateBase64 = await exportPrivateKey(signedPreKP.privateKey);
  const signedPreKeySignature = await signData(
    signingKP.privateKey,
    base64ToArrayBuffer(signedPreKP.publicKeyBase64)
  );

  // Generate one-time pre-keys
  const preKeys: { keyId: number; publicKey: string; privateKey: string }[] = [];
  for (let i = 0; i < preKeyCount; i++) {
    const preKP = await generateECDHKeyPair();
    const prePrivateBase64 = await exportPrivateKey(preKP.privateKey);
    preKeys.push({
      keyId: i + 1,
      publicKey: preKP.publicKeyBase64,
      privateKey: prePrivateBase64,
    });
  }

  return {
    registrationId,
    identityKeyPair: {
      publicKey: identityKP.publicKeyBase64,
      privateKey: identityPrivateBase64,
    },
    signedPreKey: {
      keyId: 1,
      publicKey: signedPreKP.publicKeyBase64,
      privateKey: signedPrePrivateBase64,
      signature: signedPreKeySignature,
    },
    preKeys,
  };
}

/**
 * Perform ECDH key agreement to derive a shared secret
 */
async function deriveSharedSecret(privateKey: CryptoKey, publicKeyBase64: string): Promise<ArrayBuffer> {
  const publicKey = await importPublicKey(publicKeyBase64);

  return crypto.subtle.deriveBits(
    { name: 'ECDH', public: publicKey },
    privateKey,
    256
  );
}

/**
 * Initiate a new encrypted session with a remote user using their pre-key bundle.
 * Returns the session state and the first encrypted message.
 */
export async function initiateSession(
  localIdentityPrivateKey: string,
  localIdentityPublicKey: string,
  remoteBundle: PreKeyBundle
): Promise<{
  session: SessionState;
  ephemeralPublicKey: string;
}> {
  // Generate ephemeral key pair
  const ephemeralKP = await generateECDHKeyPair();
  const ephemeralPrivateBase64 = await exportPrivateKey(ephemeralKP.privateKey);

  // X3DH-like key agreement:
  // DH1 = ECDH(localIdentity, remoteSignedPreKey)
  // DH2 = ECDH(ephemeral, remoteIdentityKey)
  // DH3 = ECDH(ephemeral, remoteSignedPreKey)
  // DH4 = ECDH(ephemeral, remotePreKey) if available

  const localIdPrivate = await importPrivateKey(localIdentityPrivateKey);

  const dh1 = await deriveSharedSecret(localIdPrivate, remoteBundle.signedPreKey.publicKey);
  const dh2 = await deriveSharedSecret(ephemeralKP.privateKey, remoteBundle.identityKey);
  const dh3 = await deriveSharedSecret(ephemeralKP.privateKey, remoteBundle.signedPreKey.publicKey);

  // Combine DH outputs
  let combinedLength = dh1.byteLength + dh2.byteLength + dh3.byteLength;
  let dh4: ArrayBuffer | null = null;

  if (remoteBundle.preKey) {
    dh4 = await deriveSharedSecret(ephemeralKP.privateKey, remoteBundle.preKey.publicKey);
    combinedLength += dh4.byteLength;
  }

  const combined = new Uint8Array(combinedLength);
  let offset = 0;
  combined.set(new Uint8Array(dh1), offset); offset += dh1.byteLength;
  combined.set(new Uint8Array(dh2), offset); offset += dh2.byteLength;
  combined.set(new Uint8Array(dh3), offset); offset += dh3.byteLength;
  if (dh4) {
    combined.set(new Uint8Array(dh4), offset);
  }

  // Derive root key and chain keys via HKDF
  const salt = new Uint8Array(32); // Zero salt for initial derivation
  const rootKeyMaterial = await hkdf(combined.buffer, salt.buffer, 'ZynkRootKey', 64);
  const rootKey = arrayBufferToBase64(rootKeyMaterial.slice(0, 32));
  const chainKey = arrayBufferToBase64(rootKeyMaterial.slice(32, 64));

  const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const session: SessionState = {
    sessionId,
    remoteIdentityKey: remoteBundle.identityKey,
    rootKey,
    sendChainKey: chainKey,
    receiveChainKey: chainKey,
    sendRatchetKey: ephemeralKP.publicKeyBase64,
    sendRatchetPrivateKey: ephemeralPrivateBase64,
    receiveRatchetKey: remoteBundle.signedPreKey.publicKey,
    messageNumber: 0,
    established: true,
  };

  return { session, ephemeralPublicKey: ephemeralKP.publicKeyBase64 };
}

/**
 * Derive message key from chain key (ratchet step)
 */
async function deriveMessageKey(chainKey: string): Promise<{ messageKey: ArrayBuffer; nextChainKey: string }> {
  const chainKeyBuffer = base64ToArrayBuffer(chainKey);

  // Derive message key
  const messageKeyBuffer = await hkdf(chainKeyBuffer, new Uint8Array(32).buffer, 'ZynkMessageKey', 32);

  // Derive next chain key
  const nextChainKeyBuffer = await hkdf(chainKeyBuffer, new Uint8Array(32).buffer, 'ZynkChainKey', 32);
  const nextChainKey = arrayBufferToBase64(nextChainKeyBuffer);

  return { messageKey: messageKeyBuffer, nextChainKey };
}

/**
 * Encrypt a message using the session
 */
export async function encryptMessage(
  session: SessionState,
  plaintext: string
): Promise<{ encrypted: EncryptedMessage; updatedSession: SessionState }> {
  // Derive message key from send chain
  const { messageKey, nextChainKey } = await deriveMessageKey(session.sendChainKey);

  // Encrypt the message
  const { ciphertext, iv } = await aesEncrypt(plaintext, messageKey);

  const encrypted: EncryptedMessage = {
    ciphertext,
    iv,
    senderKey: session.sendRatchetKey,
    sessionId: session.sessionId,
  };

  const updatedSession: SessionState = {
    ...session,
    sendChainKey: nextChainKey,
    messageNumber: session.messageNumber + 1,
  };

  return { encrypted, updatedSession };
}

/**
 * Decrypt a message using the session
 */
export async function decryptMessage(
  session: SessionState,
  encrypted: EncryptedMessage
): Promise<{ plaintext: string; updatedSession: SessionState }> {
  // Derive message key from receive chain
  const { messageKey, nextChainKey } = await deriveMessageKey(session.receiveChainKey);

  // Decrypt the message
  const plaintext = await aesDecrypt(encrypted.ciphertext, encrypted.iv, messageKey);

  const updatedSession: SessionState = {
    ...session,
    receiveChainKey: nextChainKey,
  };

  return { plaintext, updatedSession };
}

// ========== Safety Number Generation ==========

/**
 * Generate a safety number (fingerprint) for verifying identity between two users.
 * Combines both users' identity keys to produce a displayable number.
 */
export async function generateSafetyNumber(
  localIdentityKey: string,
  remoteIdentityKey: string
): Promise<string> {
  // Sort keys to ensure both parties generate the same number
  const [first, second] = [localIdentityKey, remoteIdentityKey].sort();

  const firstBuf = new Uint8Array(base64ToArrayBuffer(first));
  const secondBuf = new Uint8Array(base64ToArrayBuffer(second));
  const combined = new Uint8Array(firstBuf.length + secondBuf.length);
  combined.set(firstBuf, 0);
  combined.set(secondBuf, firstBuf.length);

  // Hash 5 times for safety number derivation (Signal Protocol pattern)
  let hash = combined.buffer;
  for (let i = 0; i < 5; i++) {
    hash = await crypto.subtle.digest('SHA-256', hash);
  }

  // Convert to displayable number blocks (12 groups of 5 digits = 60 digits)
  const hashBytes = new Uint8Array(hash);
  const numbers: string[] = [];

  for (let i = 0; i < 12; i++) {
    const offset = i * 2;
    const num = ((hashBytes[offset % hashBytes.length] << 8) | hashBytes[(offset + 1) % hashBytes.length]) % 100000;
    numbers.push(num.toString().padStart(5, '0'));
  }

  return numbers.join(' ');
}

// ========== Export utilities for external use ==========

export {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  generateRegistrationId,
  aesEncrypt,
  aesDecrypt,
  verifySignature,
};
