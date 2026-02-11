/**
 * Double Ratchet Protocol (Signal Protocol) - Client Implementation
 * Provides perfect forward secrecy - compromising current keys doesn't reveal past messages
 * 
 * Based on Signal Protocol's Double Ratchet Algorithm:
 * https://signal.org/docs/specifications/doubleratchet/
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// Helper to ensure ArrayBuffer compatibility with TypeScript 5.x strict mode
function toBuffer(arr: Uint8Array): ArrayBuffer {
  return arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength);
}

interface RatchetHeader {
  publicKey: JsonWebKey;
  pn: number; // Previous chain length
  n: number;  // Message  number
}

interface RatchetState {
  DHs: CryptoKeyPair;        // DH sending key pair
  DHr: JsonWebKey | null;    // DH receiving public key
  RK: Uint8Array;            // Root key (32 bytes)
  CKs: Uint8Array;           // Sending chain key
  CKr: Uint8Array;           // Receiving chain key
  Ns: number;                // Send counter
  Nr: number;                // Receive counter
  PN: number;                // Previous chain length
  MKSKIPPED: Record<string, string>; // Skipped message keys (serialized)
}

interface EncryptedMessage {
  v: 5; // Version 5 = Double Ratchet
  header: RatchetHeader;
  ct: string; // Base64 ciphertext with IV prepended
  sk: string; // Sender's identity public key
}

const HKDF_INFO_RK = 'zynk-ratchet-rk';
const HKDF_INFO_CK = 'zynk-ratchet-ck';
const MAX_SKIP = 1000; // Maximum number of skipped messages

// ========== Helper Functions ==========

function arrayBufferToBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
}

// ========== HKDF Key Derivation ==========

async function hkdfDerive(
  inputKeyMaterial: Uint8Array,
  salt: Uint8Array,
  info: string,
  length: number
): Promise<Uint8Array> {
  const hkdfKey = await crypto.subtle.importKey(
    'raw',
    inputKeyMaterial,
    'HKDF',
    false,
    ['deriveKey']
  );

  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info: new TextEncoder().encode(info),
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );

  const exported = await crypto.subtle.exportKey('raw', derivedKey);
  return new Uint8Array(exported).slice(0, length);
}

// ========== DH and KDF Functions ==========

async function performDH(
  privateKey: CryptoKey,
  publicKey: CryptoKey
): Promise<Uint8Array> {
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: publicKey },
    privateKey,
    256
  );
  return new Uint8Array(sharedSecret);
}

async function kdfRK(rk: Uint8Array, dhOut: Uint8Array): Promise<[Uint8Array, Uint8Array]> {
  // Derive 64 bytes: 32 for new RK, 32 for CK
  const output = await hkdfDerive(dhOut, rk, HKDF_INFO_RK, 64);
  return [output.slice(0, 32), output.slice(32, 64)];
}

async function kdfCK(ck: Uint8Array): Promise<[Uint8Array, Uint8Array]> {
  // Derive 64 bytes: 32 for new CK, 32 for MK (message key)
  const output = await hkdfDerive(ck, new Uint8Array(32), HKDF_INFO_CK, 64);
  return [output.slice(0, 32), output.slice(32, 64)];
}

// ========== Double Ratchet Class ==========

export class DoubleRatchet {
  private state: RatchetState;

  constructor(state: RatchetState) {
    this.state = state;
  }

  /**
   * Initialize Alice (sender) - starts communication
   */
  static async initAlice(
    sharedSecret: Uint8Array,
    bobPublicKey: JsonWebKey
  ): Promise<DoubleRatchet> {
    const DHs = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveKey', 'deriveBits']
    ) as CryptoKeyPair;

    const bobPubKey = await crypto.subtle.importKey(
      'jwk',
      bobPublicKey,
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      []
    );

    const dhOut = await performDH(DHs.privateKey, bobPubKey);
    const [RK, CKs] = await kdfRK(sharedSecret, dhOut);

    return new DoubleRatchet({
      DHs,
      DHr: bobPublicKey,
      RK,
      CKs,
      CKr: new Uint8Array(32),
      Ns: 0,
      Nr: 0,
      PN: 0,
      MKSKIPPED: {},
    });
  }

  /**
   * Initialize Bob (receiver) - receives first message
   */
  static async initBob(
    sharedSecret: Uint8Array
  ): Promise<DoubleRatchet> {
    const DHs = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveKey', 'deriveBits']
    ) as CryptoKeyPair;

    return new DoubleRatchet({
      DHs,
      DHr: null,
      RK: sharedSecret,
      CKs: new Uint8Array(32),
      CKr: new Uint8Array(32),
      Ns: 0,
      Nr: 0,
      PN: 0,
      MKSKIPPED: {},
    });
  }

  /**
   * Encrypt plaintext message
   */
  async encrypt(plaintext: string): Promise<string> {
    const [newCKs, messageKey] = await kdfCK(this.state.CKs);
    this.state.CKs = newCKs;

    const publicKey = await crypto.subtle.exportKey('jwk', this.state.DHs.publicKey);
    const header: RatchetHeader = {
      publicKey,
      pn: this.state.PN,
      n: this.state.Ns,
    };

    this.state.Ns++;

    // Encrypt with AES-GCM
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await crypto.subtle.importKey(
      'raw',
      messageKey,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );

    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(plaintext)
    );

    // Combine IV + ciphertext
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);

    const envelope: EncryptedMessage = {
      v: 5,
      header,
      ct: arrayBufferToBase64(combined.buffer),
      sk: '', // Set by caller
    };

    return JSON.stringify(envelope);
  }

  /**
   * Decrypt received message
   */
  async decrypt(envelopeJson: string): Promise<string> {
    const envelope: EncryptedMessage = JSON.parse(envelopeJson);
    
    if (envelope.v !== 5) {
      throw new Error('Not a Double Ratchet message');
    }

    const { header } = envelope;

    // Check if we need to perform DH ratchet
    const currentPubKey = this.state.DHr 
      ? JSON.stringify(this.state.DHr)
      : null;
    const incomingPubKey = JSON.stringify(header.publicKey);

    if (currentPubKey !== incomingPubKey) {
      await this.skipMessageKeys(header.pn);
      await this.dhRatchet(header.publicKey);
    }

    await this.skipMessageKeys(header.n);

    const [newCKr, messageKey] = await kdfCK(this.state.CKr);
    this.state.CKr = newCKr;
    this.state.Nr++;

    // Decrypt
    const combined = base64ToArrayBuffer(envelope.ct);
    const iv = new Uint8Array(combined, 0, 12);
    const ciphertext = new Uint8Array(combined, 12);

    const key = await crypto.subtle.importKey(
      'raw',
      messageKey,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

    return new TextDecoder().decode(plaintext);
  }

  /**
   * Perform DH ratchet step (key rotation)
   */
  private async dhRatchet(remotePublicKey: JsonWebKey): Promise<void> {
    this.state.PN = this.state.Ns;
    this.state.Ns = 0;
    this.state.Nr = 0;
    this.state.DHr = remotePublicKey;

    const remotePub = await crypto.subtle.importKey(
      'jwk',
      remotePublicKey,
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      []
    );

    const dhOut1 = await performDH(this.state.DHs.privateKey, remotePub);
    const [newRK, newCKr] = await kdfRK(this.state.RK, dhOut1);
    this.state.RK = newRK;
    this.state.CKr = newCKr;

    // Generate new sending key pair
    const newDHs = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveKey', 'deriveBits']
    ) as CryptoKeyPair;

    const dhOut2 = await performDH(newDHs.privateKey, remotePub);
    const [finalRK, newCKs] = await kdfRK(this.state.RK, dhOut2);
    
    this.state.DHs = newDHs;
    this.state.RK = finalRK;
    this.state.CKs = newCKs;
  }

  /**
   * Skip message keys for out-of-order messages
   */
  private async skipMessageKeys(until: number): Promise<void> {
    if (this.state.Nr + MAX_SKIP < until) {
      throw new Error('Too many skipped messages');
    }

    if (this.state.CKr) {
      while (this.state.Nr < until) {
        const [newCKr, messageKey] = await kdfCK(this.state.CKr);
        this.state.MKSKIPPED[`${this.state.DHr}-${this.state.Nr}`] = 
          arrayBufferToBase64(messageKey.buffer);
        this.state.CKr = newCKr;
        this.state.Nr++;
      }
    }
  }

  /**
   * Serialize state for storage
   */
  async serializeState(): Promise<string> {
    const serialized = {
      DHs: {
        publicKey: await crypto.subtle.exportKey('jwk', this.state.DHs.publicKey),
        privateKey: await crypto.subtle.exportKey('jwk', this.state.DHs.privateKey),
      },
      DHr: this.state.DHr,
      RK: arrayBufferToBase64(this.state.RK.buffer),
      CKs: arrayBufferToBase64(this.state.CKs.buffer),
      CKr: arrayBufferToBase64(this.state.CKr.buffer),
      Ns: this.state.Ns,
      Nr: this.state.Nr,
      PN: this.state.PN,
      MKSKIPPED: this.state.MKSKIPPED,
    };

    return JSON.stringify(serialized);
  }

  /**
   * Deserialize state from storage
   */
  static async deserializeState(serialized: string): Promise<DoubleRatchet> {
    const data = JSON.parse(serialized);

    const DHs: CryptoKeyPair = {
      publicKey: await crypto.subtle.importKey(
        'jwk',
        data.DHs.publicKey,
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        []
      ),
      privateKey: await crypto.subtle.importKey(
        'jwk',
        data.DHs.privateKey,
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        ['deriveKey', 'deriveBits']
      ),
    };

    const state: RatchetState = {
      DHs,
      DHr: data.DHr,
      RK: new Uint8Array(base64ToArrayBuffer(data.RK)),
      CKs: new Uint8Array(base64ToArrayBuffer(data.CKs)),
      CKr: new Uint8Array(base64ToArrayBuffer(data.CKr)),
      Ns: data.Ns,
      Nr: data.Nr,
      PN: data.PN,
      MKSKIPPED: data.MKSKIPPED,
    };

    return new DoubleRatchet(state);
  }
}

/**
 * Check if a message uses Double Ratchet (v5)
 */
export function isDoubleRatchetMessage(messageJson: string): boolean {
  try {
    const parsed = JSON.parse(messageJson);
    return parsed.v === 5 && parsed.header && parsed.ct;
  } catch {
    return false;
  }
}
