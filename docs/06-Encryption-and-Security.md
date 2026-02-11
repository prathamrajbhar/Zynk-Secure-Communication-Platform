# Encryption and Security

Complete reference for Zynk's end-to-end encryption (E2EE) and security architecture.

## Table of Contents
- [Security Overview](#security-overview)
- [Encryption Architecture](#encryption-architecture)
- [Web Crypto API](#web-crypto-api)
- [Key Management](#key-management)
- [Message Encryption (1-to-1)](#message-encryption-1-to-1)
- [Group Encryption](#group-encryption)
- [Safety Numbers](#safety-numbers)
- [Security Best Practices](#security-best-practices)
- [Threat Model](#threat-model)
- [Security Audit Recommendations](#security-audit-recommendations)

---

## Security Overview

### Core Security Principles

Zynk implements **End-to-End Encryption (E2EE)** ensuring:
- ✅ **Privacy**: Only sender and recipient can read messages
- ✅ **Integrity**: Messages cannot be tampered with undetected
- ✅ **Authenticity**: Verify sender identity via safety numbers
- ✅ **Forward Secrecy**: Future key compromises don't reveal past messages (limited — see notes)
- ✅ **Zero-Knowledge Server**: Server cannot read message content

### Encryption Standards
| Component | Algorithm | Key Size | Purpose |
|-----------|-----------|----------|---------|
| Key Agreement | **ECDH P-256** | 256-bit | Generate shared secret |
| Key Derivation | **HKDF-SHA256** | 256-bit | Derive encryption keys |
| Symmetric Encryption | **AES-256-GCM** | 256-bit | Encrypt message content |
| Authentication | Built into AES-GCM | 128-bit tag | Message integrity |
| Safety Numbers | **SHA-256** (5 rounds) | 256-bit hash | Verify public keys |

All cryptographic operations use the **Web Crypto API** (native browser implementation).

---

## Encryption Architecture

### High-Level Flow

```
┌────────────────────────────────────────────────────────────────────┐
│                        Registration Phase                          │
└────────────────────────────────────────────────────────────────────┘
   Alice                         Server                         Bob
     │                             │                             │
     │ 1. Generate ECDH key pair   │                             │
     │    (P-256)                  │                             │
     │                             │                             │
     │ 2. Upload public key        │                             │
     │─────────────────────────────▶                             │
     │                             │ Store in database           │
     │                             │                             │
     │                             │                             │
     │                             │◀────────────────────────────│ 3. Generate ECDH key pair
     │                             │    Upload public key        │
     │                             │                             │

┌────────────────────────────────────────────────────────────────────┐
│                        Message Exchange Phase                      │
└────────────────────────────────────────────────────────────────────┘
   Alice                         Server                         Bob
     │                             │                             │
     │ 4. Fetch Bob's public key   │                             │
     │─────────────────────────────▶                             │
     │◀─────────────────────────────│                             │
     │   bobPublicKey               │                             │
     │                             │                             │
     │ 5. ECDH key agreement:      │                             │
     │    sharedSecret =           │                             │
     │    ECDH(alicePriv, bobPub)  │                             │
     │                             │                             │
     │ 6. HKDF key derivation:     │                             │
     │    aesKey =                 │                             │
     │    HKDF(sharedSecret)       │                             │
     │                             │                             │
     │ 7. AES-GCM encryption:      │                             │
     │    ciphertext =             │                             │
     │    AES(plaintext, aesKey)   │                             │
     │                             │                             │
     │ 8. Send encrypted message   │                             │
     │─────────────────────────────▶                             │
     │                             │─────────────────────────────▶│ 9. Receive encrypted message
     │                             │                             │
     │                             │                             │ 10. Derive same AES key:
     │                             │                             │     ECDH(bobPriv, alicePub)
     │                             │                             │     = sharedSecret
     │                             │                             │
     │                             │                             │ 11. Decrypt:
     │                             │                             │     plaintext =
     │                             │                             │     AES_DECRYPT(ciphertext)
```

---

## Web Crypto API

### Why Web Crypto API?

Zynk uses the **native Web Crypto API** instead of JavaScript libraries like libsignal-protocol-javascript or tweetnacl.

**Advantages**:
- ✅ **Native performance**: Hardware acceleration
- ✅ **Security**: Runs in browser's secure context
- ✅ **No dependencies**: No external crypto libraries
- ✅ **Audited**: Browser implementations are heavily vetted
- ✅ **Standard**: W3C specification

**Browser Support**:
- Chrome/Edge: ✅ Full support
- Firefox: ✅ Full support
- Safari: ✅ Full support
- Mobile browsers: ✅ Full support

---

### Key Generation
```typescript
const keyPair = await crypto.subtle.generateKey(
  { 
    name: 'ECDH', 
    namedCurve: 'P-256' 
  },
  true,           // extractable
  ['deriveBits']  // key usage
);
```

**Output**:
- **Public Key**: Shared with other users (65 bytes, uncompressed point)
- **Private Key**: Kept secret in browser (32 bytes)

---

### Key Agreement (ECDH)
```typescript
const sharedSecret = await crypto.subtle.deriveBits(
  { 
    name: 'ECDH', 
    public: theirPublicKey 
  },
  myPrivateKey,
  256  // bits
);
```

**Properties**:
- **Commutative**: ECDH(A_priv, B_pub) = ECDH(B_priv, A_pub)
- **Output**: 256-bit shared secret (32 bytes)

---

### Key Derivation (HKDF)
```typescript
const hkdfKey = await crypto.subtle.importKey(
  'raw', 
  sharedSecret, 
  'HKDF', 
  false, 
  ['deriveKey']
);

const aesKey = await crypto.subtle.deriveKey(
  {
    name: 'HKDF',
    hash: 'SHA-256',
    salt: new Uint8Array(32),                      // Fixed zero salt
    info: new TextEncoder().encode('zynk-e2ee-v3') // Context string
  },
  hkdfKey,
  { name: 'AES-GCM', length: 256 },
  false,
  ['encrypt', 'decrypt']
);
```

**Why HKDF?**
- Derives cryptographically strong keys from shared secret
- Adds context binding via `info` parameter
- Provides domain separation between different uses

---

### Encryption (AES-GCM)
```typescript
const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit nonce

const ciphertext = await crypto.subtle.encrypt(
  { name: 'AES-GCM', iv },
  aesKey,
  new TextEncoder().encode(plaintext)
);
```

**AES-GCM Properties**:
- **Authenticated Encryption**: Provides both confidentiality and integrity
- **Authentication Tag**: 128-bit tag prevents tampering
- **IV/Nonce**: 12 bytes, randomly generated per message
- **No separate HMAC needed**: GCM mode includes authentication

**Output**:
- **Ciphertext**: Encrypted data
- **Authentication Tag**: Appended to ciphertext (handled by browser)

---

### Decryption (AES-GCM)
```typescript
const plaintext = await crypto.subtle.decrypt(
  { name: 'AES-GCM', iv },
  aesKey,
  ciphertext
);

const text = new TextDecoder().decode(plaintext);
```

**Automatic Verification**:
- AES-GCM automatically verifies authentication tag
- Decryption fails if message was tampered with
- Throws exception on authentication failure

---

## Key Management

### User Key Lifecycle

#### 1. Registration (One-Time Setup)
**File**: [web/src/lib/crypto.ts](../web/src/lib/crypto.ts#L47-L54)

```typescript
// Generate ECDH P-256 key pair
const { publicKey, privateKey } = await generateKeyPair();

// Store in localStorage
localStorage.setItem('zynk-public-key', publicKey);
localStorage.setItem('zynk-private-key', privateKey);

// Upload public key to server
await uploadPublicKey(publicKey);
```

**Key Storage**:
- **Public Key**: Base64-encoded, 88 characters, uploaded to server
- **Private Key**: Base64-encoded, stored in `localStorage` (PKCS#8 format)

**Security Note**: Private keys never leave the device. Server only stores public keys.

---

#### 2. Key Upload to Server
**File**: [server/src/routes/keys.ts](../server/src/routes/keys.ts#L55-L105)

**Endpoint**: `POST /api/v1/keys/upload`

**Request Body**:
```json
{
  "identity_key": "base64_public_key",
  "registration_id": 12345,
  "signed_pre_key": {
    "key_id": 1,
    "public_key": "base64_signed_pre_key",
    "signature": "base64_signature"
  },
  "pre_keys": [
    { "key_id": 1, "public_key": "base64_prekey_1" },
    { "key_id": 2, "public_key": "base64_prekey_2" }
  ]
}
```

**Database Storage**:
- `IdentityKey` table: Main public key
- `SignedPreKey` table: Signed pre-key (for key rotation)
- `PreKey` table: One-time pre-keys

**Why Multiple Keys?**
- **Identity Key**: Long-term user identity
- **Signed Pre-Key**: Rotated periodically for forward secrecy
- **One-Time Pre-Keys**: Consumed per first message, replenished

---

#### 3. Fetching Recipient's Public Key
**File**: [server/src/routes/keys.ts](../server/src/routes/keys.ts#L120-L180)

**Endpoint**: `GET /api/v1/keys/:userId/bundle`

**Response**:
```json
{
  "user_id": 456,
  "device_id": 789,
  "identity_key": "base64_public_key",
  "registration_id": 12345,
  "signed_pre_key": {
    "key_id": 1,
    "public_key": "base64_signed_pre_key",
    "signature": "base64_signature"
  },
  "pre_key": {
    "key_id": 42,
    "public_key": "base64_prekey"
  }
}
```

**Pre-Key Consumption**: Server marks one-time pre-key as used after first fetch.

---

#### 4. Shared Secret Derivation
**File**: [web/src/lib/crypto.ts](../web/src/lib/crypto.ts#L90-L115)

```typescript
async function deriveAESKey(
  myPrivateKeyB64: string,
  theirPublicKeyB64: string
): Promise<CryptoKey> {
  // Import keys
  const myPrivate = await importPrivateKey(myPrivateKeyB64);
  const theirPublic = await importPublicKey(theirPublicKeyB64);

  // ECDH key agreement
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: theirPublic },
    myPrivate,
    256  // 256 bits = 32 bytes
  );

  // HKDF key derivation
  const hkdfKey = await crypto.subtle.importKey(
    'raw', 
    sharedSecret, 
    'HKDF', 
    false, 
    ['deriveKey']
  );

  const aesKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32),                      // Zero salt
      info: new TextEncoder().encode('zynk-e2ee-v3') // Context
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  return aesKey;
}
```

**Key Properties**:
- **Deterministic**: Same key pair always derives same AES key
- **Symmetric**: Both parties derive same key
- **Unique per pair**: Different for Alice↔Bob vs Alice↔Charlie

---

## Message Encryption (1-to-1)

### Encryption Flow
**File**: [web/src/lib/crypto.ts](../web/src/lib/crypto.ts#L120-L140)

```typescript
async function encryptText(
  aesKey: CryptoKey,
  plaintext: string,
  senderPublicKey: string
): Promise<string> {
  // Generate random IV (12 bytes)
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Encrypt with AES-256-GCM
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    new TextEncoder().encode(plaintext)
  );

  // Build envelope
  const envelope = {
    v: 3,  // Version 3 = 1-to-1 E2EE
    ct: arrayBufferToBase64(ciphertext),       // Ciphertext
    iv: arrayBufferToBase64(iv.buffer),        // Initialization vector
    sk: senderPublicKey                        // Sender's public key
  };

  return JSON.stringify(envelope);
}
```

---

### Message Envelope Structure

**Version 3 Envelope** (1-to-1 messages):
```json
{
  "v": 3,
  "ct": "base64_ciphertext_with_auth_tag",
  "iv": "base64_12_byte_nonce",
  "sk": "base64_sender_public_key"
}
```

**Fields**:
- `v`: Protocol version (3 = 1-to-1, 4 = group)
- `ct`: Base64-encoded ciphertext (includes GCM authentication tag)
- `iv`: Base64-encoded initialization vector (12 bytes)
- `sk`: Sender's public key (for key lookup and verification)

**Why Include Sender's Public Key?**
- Allows recipient to derive correct decryption key
- Supports multiple devices per user
- Enables safety number verification

---

### Decryption Flow
**File**: [web/src/lib/crypto.ts](../web/src/lib/crypto.ts#L142-L160)

```typescript
async function decryptText(
  aesKey: CryptoKey,
  envelopeJson: string
): Promise<string> {
  // Parse envelope
  const envelope = JSON.parse(envelopeJson);

  // Validate version
  if (envelope.v !== 3) {
    throw new Error('UNSUPPORTED_ENVELOPE: not a v3 message');
  }

  // Decrypt with AES-GCM
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToArrayBuffer(envelope.iv) },
    aesKey,
    base64ToArrayBuffer(envelope.ct)
  );

  return new TextDecoder().decode(plaintext);
}
```

**Error Handling**:
- **Wrong key**: Decryption throws exception
- **Tampered message**: Authentication tag verification fails
- **Unsupported version**: Gracefully reject old/new envelope formats

---

### Complete Example

**Alice sends "Hello Bob"**:
```typescript
// 1. Fetch Bob's public key from server
const bobPublicKey = await fetchPublicKey(bobUserId);

// 2. Derive shared AES key (ECDH + HKDF)
const aesKey = await deriveAESKey(myPrivateKey, bobPublicKey);

// 3. Encrypt plaintext
const encryptedEnvelope = await encryptText(
  aesKey, 
  "Hello Bob", 
  myPublicKey
);

// 4. Send encrypted envelope to server
await sendMessage(conversationId, encryptedEnvelope);
```

**Encrypted envelope sent**:
```json
{
  "v": 3,
  "ct": "xY9zK...",
  "iv": "rT4p...",
  "sk": "A7bN..."
}
```

**Bob receives message**:
```typescript
// 1. Receive encrypted envelope from server
const envelope = message.encrypted_content;

// 2. Parse sender's public key from envelope
const senderPublicKey = JSON.parse(envelope).sk;

// 3. Derive same AES key (ECDH + HKDF)
const aesKey = await deriveAESKey(bobPrivateKey, senderPublicKey);

// 4. Decrypt ciphertext
const plaintext = await decryptText(aesKey, envelope);
// → "Hello Bob"
```

---

## Group Encryption

### Sender Key Distribution

Group messages use a **sender key** model, different from 1-to-1 encryption.

**Why Different?**
- 1-to-1: Unique key per user pair
- Group: One sender key shared with all members (more efficient)

---

### Group Encryption Flow

```
┌────────────────────────────────────────────────────────────────────┐
│                    Group Key Distribution                          │
└────────────────────────────────────────────────────────────────────┘
   Alice (Sender)           Server           Bob (Member)   Carol (Member)
       │                      │                    │              │
       │ 1. Generate sender key                    │              │
       │    (AES-256)                              │              │
       │                      │                    │              │
       │ 2. Encrypt sender key individually        │              │
       │    for each member:                       │              │
       │    - encrypt_for_bob(senderKey)           │              │
       │    - encrypt_for_carol(senderKey)         │              │
       │                      │                    │              │
       │ 3. Upload encrypted sender keys           │              │
       │──────────────────────▶                    │              │
       │                      │ Store in DB        │              │
       │                      │                    │              │
       │                      │──────────────────────────────────▶│ 4. Fetch encrypted sender key
       │                      │◀──────────────────────────────────│    for Carol
       │                      │                    │              │
       │                      │────────────────────▶ 5. Fetch encrypted sender key
       │                      │◀────────────────────│    for Bob
       │                      │                    │              │

┌────────────────────────────────────────────────────────────────────┐
│                    Group Message Exchange                          │
└────────────────────────────────────────────────────────────────────┘
   Alice (Sender)           Server           Bob (Member)   Carol (Member)
       │                      │                    │              │
       │ 6. Encrypt message with sender key        │              │
       │    ciphertext = AES(msg, senderKey)       │              │
       │                      │                    │              │
       │ 7. Send to group     │                    │              │
       │──────────────────────▶                    │              │
       │                      │──────────────────────────────────▶│ 8. Receive encrypted message
       │                      │────────────────────▶│              │
       │                      │                    │              │
       │                      │                    │ 9. Decrypt with sender key
       │                      │                    │    plaintext = AES_DECRYPT(ct, senderKey)
       │                      │                    │              │
       │                      │                    │              │ 10. Decrypt with sender key
```

---

### Sender Key Generation
**File**: [web/src/lib/crypto.ts](../web/src/lib/crypto.ts#L255-L265)

```typescript
async function generateSenderKey(): Promise<{ 
  key: string; 
  cryptoKey: CryptoKey 
}> {
  // Generate random AES-256-GCM key
  const aesKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,  // extractable
    ['encrypt', 'decrypt']
  );

  // Export as base64
  const raw = await crypto.subtle.exportKey('raw', aesKey);
  const keyB64 = arrayBufferToBase64(raw);

  return { key: keyB64, cryptoKey: aesKey };
}
```

---

### Group Message Encryption
**File**: [web/src/lib/crypto.ts](../web/src/lib/crypto.ts#L285-L305)

**Version 4 Envelope** (group messages):
```json
{
  "v": 4,
  "ct": "base64_ciphertext",
  "iv": "base64_12_byte_nonce",
  "sk": "base64_sender_public_key",
  "kid": 42
}
```

**Additional Field**:
- `kid`: Sender key ID (for key rotation)

**Encryption**:
```typescript
async function encryptWithSenderKey(
  senderKey: CryptoKey,
  plaintext: string,
  keyId: number,
  senderPublicKey: string
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    senderKey,
    new TextEncoder().encode(plaintext)
  );

  return JSON.stringify({
    v: 4,                                          // Group envelope
    ct: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv.buffer),
    sk: senderPublicKey,
    kid: keyId                                     // Sender key ID
  });
}
```

---

### Sender Key Distribution

Each member receives the sender key encrypted with their 1-to-1 key:

**Database**: `GroupSenderKey` table
```prisma
model GroupSenderKey {
  id                String @id @default(cuid())
  group_id          String
  sender_id         String
  recipient_id      String
  key_id            Int
  encrypted_key     String  // Sender key encrypted for recipient
  created_at        DateTime @default(now())
}
```

**Distribution Process**:
```typescript
// 1. Alice generates sender key
const { key: senderKey, cryptoKey } = await generateSenderKey();

// 2. For each group member, encrypt sender key with their 1-to-1 key
for (const member of groupMembers) {
  // Derive 1-to-1 AES key with member
  const aesKey = await deriveAESKey(myPrivateKey, member.publicKey);
  
  // Encrypt sender key
  const encryptedSenderKey = await encryptText(aesKey, senderKey, myPublicKey);
  
  // Upload to server
  await uploadGroupSenderKey(groupId, member.id, encryptedSenderKey);
}
```

---

### Key Rotation

Sender keys are rotated when:
- New member joins group
- Member leaves group
- Periodically (e.g., every 7 days)

**Process**:
1. Generate new sender key
2. Increment `key_id`
3. Distribute to all current members
4. Old messages remain encrypted with old key (stored locally)

---

## Safety Numbers

### Purpose
Safety numbers (also called "fingerprints") allow users to verify they're communicating with the right person.

**Verifies**:
- ✅ Correct public key (no MITM attack)
- ✅ Key hasn't changed
- ✅ Server hasn't substituted keys

---

### Generation Algorithm
**File**: [web/src/lib/crypto.ts](../web/src/lib/crypto.ts#L182-L205)

```typescript
async function generateSafetyNumber(
  localPublicKey: string,
  remotePublicKey: string
): Promise<string> {
  // 1. Sort keys lexicographically
  const [a, b] = [localPublicKey, remotePublicKey].sort();

  // 2. Concatenate keys
  const aBuf = base64ToArrayBuffer(a);
  const bBuf = base64ToArrayBuffer(b);
  const combined = new Uint8Array([...aBuf, ...bBuf]);

  // 3. Hash 5 times with SHA-256 (slow hashing)
  let hash = combined.buffer;
  for (let i = 0; i < 5; i++) {
    hash = await crypto.subtle.digest('SHA-256', hash);
  }

  // 4. Convert to 60-digit number
  const bytes = new Uint8Array(hash);
  let num = '';
  for (let i = 0; i < 30; i++) {
    const chunk = (bytes[i % bytes.length] * 256 + bytes[(i + 1) % bytes.length]) % 100000;
    num += chunk.toString().padStart(5, '0');
  }

  return num.slice(0, 60);
}
```

**Output**: 60-digit number, displayed as:
```
12345 67890 12345 67890 12345
67890 12345 67890 12345 67890
12345 67890 12345
```

---

### Verification Methods

#### 1. Visual Comparison
Users read safety numbers to each other over a trusted channel (phone call, in person).

#### 2. QR Code Scanning (Future)
Generate QR code from safety number for quick scanning.

---

### When to Verify?
- ✅ First conversation with new contact
- ✅ After device change or key rotation
- ✅ When "safety number changed" notification appears
- ✅ Before sharing highly sensitive information

---

## Security Best Practices

### For Developers

#### 1. Never Log Sensitive Data
```typescript
// ❌ BAD
console.log('Private key:', privateKey);
console.log('Decrypted message:', plaintext);

// ✅ GOOD
console.log('Decryption successful');
```

---

#### 2. Use Constant-Time Comparisons
```typescript
// For comparing secrets/hashes
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}
```

---

#### 3. Sanitize User Input
All user input is sanitized before encryption to prevent injection attacks.

---

#### 4. Validate Envelopes
```typescript
function isValidEncryptedMessage(s: string): boolean {
  if (!s || typeof s !== 'string') return false;
  try {
    const obj = JSON.parse(s);
    return obj.v === 3 && obj.ct && obj.iv && obj.sk;
  } catch {
    return false;
  }
}
```

---

### For Users

#### 1. Verify Safety Numbers
Verify safety numbers for sensitive conversations.

#### 2. Enable Device Notifications
Get notified when new devices are added to your account.

#### 3. Limit Devices
Regularly review and remove old devices.

#### 4. Use Strong Passwords
Account password protects all E2EE keys.

---

## Threat Model

### What Zynk Protects Against

#### ✅ Server Compromise
- **Threat**: Server hacked or malicious admin
- **Protection**: Server cannot read message content (only encrypted envelopes)
- **Limitation**: Server can see metadata (who talks to whom, when, message count)

#### ✅ Network Eavesdropping
- **Threat**: ISP, government, hacker intercepts network traffic
- **Protection**: TLS + E2EE (double encryption layer)
- **Limitation**: Metadata visible to network observer (IP addresses, timing)

#### ✅ Message Tampering
- **Threat**: Attacker modifies encrypted message
- **Protection**: AES-GCM authentication tag
- **Result**: Decryption fails if message tampered with

#### ✅ Impersonation
- **Threat**: Attacker pretends to be Alice
- **Protection**: Only Alice has private key for her identity
- **Verification**: Safety numbers confirm public key authenticity

---

### What Zynk Does NOT Fully Protect Against

#### ⚠️ Compromised End Device
- **Threat**: Malware on user's device
- **Risk**: Can read plaintext messages and steal private keys
- **Mitigation**: Keep devices secure, use trusted OS

#### ⚠️ Man-in-the-Middle (Key Substitution)
- **Threat**: Server substitutes public keys during initial exchange
- **Risk**: Attacker can decrypt messages
- **Mitigation**: **Verify safety numbers** before trusting conversation

#### ⚠️ Metadata Analysis
- **Threat**: Analyze who talks to whom, when, how often
- **Server sees**: Sender, recipient, timestamp, message size
- **Mitigation**: Use Tor/VPN for additional anonymity (not built-in)

#### ⚠️ Forward Secrecy Limitations
- **Threat**: Private key compromised reveals all past messages
- **Current State**: Limited forward secrecy (static key pairs)
- **Improvement Needed**: Implement ratcheting (Signal Protocol's Double Ratchet)

---

## Security Audit Recommendations

### Recommended Improvements

#### 1. Implement Double Ratchet
**Current**: Static ECDH key pairs
**Upgrade**: Signal Protocol's Double Ratchet for forward/backward secrecy

**Benefits**:
- Perfect forward secrecy
- Post-compromise security
- Self-healing after key compromise

---

#### 2. Add Key Pinning
**Current**: Trust server for public keys
**Upgrade**: Pin first-seen public keys (TOFU - Trust On First Use)

**Implementation**:
```typescript
const knownKeys = JSON.parse(localStorage.getItem('known-keys') || '{}');

if (knownKeys[userId] && knownKeys[userId] !== publicKey) {
  throw new Error('PUBLIC_KEY_CHANGED: Verify safety number');
}

knownKeys[userId] = publicKey;
localStorage.setItem('known-keys', JSON.stringify(knownKeys));
```

---

#### 3. Add Key Expiration & Rotation
**Current**: Keys never expire
**Upgrade**: Rotate every 30-90 days

---

#### 4. Implement Deniability
**Current**: Messages are authenticated (can prove sender)
**Upgrade**: Add deniable authentication (Signal Protocol feature)

---

#### 5. Add Sealed Sender
**Current**: Server knows sender and recipient
**Upgrade**: Encrypt sender metadata

---

#### 6. Use Secure Enclave (Mobile)
**Current**: Keys in localStorage
**Upgrade**: Use iOS Keychain / Android Keystore

---

### Security Checklist for Production

- [x] TLS/HTTPS enforced for all connections
- [x] E2EE for message content
- [x] Safety number verification
- [ ] Regular key rotation (recommendation)
- [ ] Security headers (CSP, HSTS, X-Frame-Options)
- [x] Rate limiting on auth endpoints
- [x] JWT token expiration
- [x] Bcrypt password hashing (cost 12)
- [ ] Penetration testing
- [ ] Third-party security audit
- [ ] Bug bounty program

---

## Cryptographic Primitives Summary

| Primitive | Algorithm | Key Size | Usage |
|-----------|-----------|----------|-------|
| **Asymmetric Key Generation** | ECDH P-256 | 256-bit | Identity keys |
| **Key Agreement** | ECDH | 256-bit shared secret | Derive session keys |
| **Key Derivation** | HKDF-SHA256 | 256-bit output | Session key derivation |
| **Symmetric Encryption** | AES-256-GCM | 256-bit key | Message encryption |
| **Authentication** | GCM authentication | 128-bit tag | Message integrity |
| **Hashing** | SHA-256 | 256-bit hash | Safety numbers |
| **Random Generation** | crypto.getRandomValues | N/A | IVs, nonces |

---

## Additional Resources

### Standards & References
- [Web Crypto API Specification (W3C)](https://www.w3.org/TR/WebCryptoAPI/)
- [ECDH (RFC 6090)](https://www.rfc-editor.org/rfc/rfc6090)
- [HKDF (RFC 5869)](https://www.rfc-editor.org/rfc/rfc5869)
- [AES-GCM (NIST SP 800-38D)](https://csrc.nist.gov/publications/detail/sp/800-38d/final)
- [Signal Protocol Documentation](https://signal.org/docs/)

### Related Documentation
- [Backend API Reference](./02-Backend-API-Reference.md) - `/keys` endpoints
- [Database Schema](./03-Database-Schema.md) - E2EE key tables
- [Frontend Architecture](./05-Frontend-Architecture.md) - `cryptoStore` implementation
