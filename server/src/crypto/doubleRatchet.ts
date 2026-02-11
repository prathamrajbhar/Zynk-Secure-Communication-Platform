import { hkdf } from 'crypto';
import { webcrypto } from 'crypto';

// Use Node's WebCrypto types
type Crypto = typeof webcrypto;
type CryptoKey = webcrypto.CryptoKey;
type CryptoKeyPair = webcrypto.CryptoKeyPair;
type JsonWebKey = webcrypto.JsonWebKey;

const crypto = webcrypto;

interface RatchetState {
  DHs: CryptoKeyPair;        // DH sending key pair
  DHr: CryptoKey | null;     // DH receiving public key
  RK: Uint8Array;            // Root key (32 bytes)
  CKs: Uint8Array;           // Sending chain key
  CKr: Uint8Array;           // Receiving chain key
  Ns: number;                // Send counter
  Nr: number;                // Receive counter
  PN: number;                // Previous chain length
  MKSKIPPED: Map<string, Uint8Array>; // Skipped message keys
}

export class DoubleRatchet {
  private state: RatchetState;

  constructor(state: RatchetState) {
    this.state = state;
  }

  // Initialize Alice (sender)
  static async initAlice(
    SK: Uint8Array,
    bobPublicKey: CryptoKey
  ): Promise<DoubleRatchet> {
    const DHs = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveKey', 'deriveBits']
    ) as CryptoKeyPair;

    const dh1 = await this.DH(DHs.privateKey, bobPublicKey);
    const [RK, CKs] = await this.KDF_RK(SK, dh1);

    return new DoubleRatchet({
      DHs,
      DHr: null,
      RK,
      CKs,
      CKr: new Uint8Array(32),
      Ns: 0,
      Nr: 0,
      PN: 0,
      MKSKIPPED: new Map()
    });
  }

  // Initialize Bob (receiver)
  static async initBob(
    SK: Uint8Array,
    DHs: CryptoKeyPair
  ): Promise<DoubleRatchet> {
    return new DoubleRatchet({
      DHs,
      DHr: null,
      RK: SK,
      CKs: new Uint8Array(32),
      CKr: new Uint8Array(32),
      Ns: 0,
      Nr: 0,
      PN: 0,
      MKSKIPPED: new Map()
    });
  }

  // Encrypt message
  async encrypt(plaintext: Uint8Array): Promise<{
    header: { publicKey: JsonWebKey; pn: number; n: number };
    ciphertext: Uint8Array;
  }> {
    const [CKs, MK] = await DoubleRatchet.KDF_CK(this.state.CKs);
    this.state.CKs = CKs;

    const header = {
      publicKey: await crypto.subtle.exportKey('jwk', this.state.DHs.publicKey),
      pn: this.state.PN,
      n: this.state.Ns
    };

    this.state.Ns++;

    // Use AES-GCM for encryption
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await crypto.subtle.importKey(
      'raw',
      MK,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );

    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      plaintext
    );

    // Combine iv + ciphertext
    const ciphertext = new Uint8Array(iv.length + encrypted.byteLength);
    ciphertext.set(iv, 0);
    ciphertext.set(new Uint8Array(encrypted), iv.length);

    return { header, ciphertext };
  }

  // Decrypt message
  async decrypt(header: any, ciphertext: Uint8Array): Promise<Uint8Array> {
    const publicKey = await crypto.subtle.importKey(
      'jwk',
      header.publicKey,
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      []
    );

    // Check if we need to ratchet
    const currentPubKey = await crypto.subtle.exportKey('jwk', this.state.DHr || this.state.DHs.publicKey);
    const headerPubKey = header.publicKey;
    
    if (JSON.stringify(currentPubKey) !== JSON.stringify(headerPubKey)) {
      await this.skipMessageKeys(header.pn);
      await this.DHRatchet(header, publicKey);
    }

    await this.skipMessageKeys(header.n);

    const [CKr, MK] = await DoubleRatchet.KDF_CK(this.state.CKr);
    this.state.CKr = CKr;
    this.state.Nr++;

    // Extract iv and encrypted data
    const iv = ciphertext.slice(0, 12);
    const encrypted = ciphertext.slice(12);

    const key = await crypto.subtle.importKey(
      'raw',
      MK,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encrypted
    );

    return new Uint8Array(decrypted);
  }

  private async DHRatchet(header: any, DHr: CryptoKey) {
    this.state.PN = this.state.Ns;
    this.state.Ns = 0;
    this.state.Nr = 0;
    this.state.DHr = DHr;

    const dh = await DoubleRatchet.DH(this.state.DHs.privateKey, DHr);
    const [RK, CKr] = await DoubleRatchet.KDF_RK(this.state.RK, dh);
    this.state.RK = RK;
    this.state.CKr = CKr;

    this.state.DHs = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveKey', 'deriveBits']
    ) as CryptoKeyPair;

    const dh2 = await DoubleRatchet.DH(this.state.DHs.privateKey, DHr);
    const [RK2, CKs] = await DoubleRatchet.KDF_RK(RK, dh2);
    this.state.RK = RK2;
    this.state.CKs = CKs;
  }

  private async skipMessageKeys(until: number) {
    if (this.state.Nr + 100 < until) {
      throw new Error('Too many skipped messages');
    }

    if (this.state.CKr) {
      while (this.state.Nr < until) {
        const [CKr, MK] = await DoubleRatchet.KDF_CK(this.state.CKr);
        this.state.CKr = CKr;
        this.state.MKSKIPPED.set(`${this.state.DHr}:${this.state.Nr}`, MK);
        this.state.Nr++;
      }
    }
  }

  // Key derivation function for root key
  private static async KDF_RK(
    rk: Uint8Array,
    dh_out: Uint8Array
  ): Promise<[Uint8Array, Uint8Array]> {
    return new Promise((resolve, reject) => {
      hkdf('sha256', dh_out, rk, '', 64, (err, derivedKey) => {
        if (err) reject(err);
        else {
          const key = new Uint8Array(derivedKey);
          resolve([key.slice(0, 32), key.slice(32, 64)]);
        }
      });
    });
  }

  // Key derivation function for chain key
  private static async KDF_CK(
    ck: Uint8Array
  ): Promise<[Uint8Array, Uint8Array]> {
    return new Promise((resolve, reject) => {
      hkdf('sha256', ck, new Uint8Array(32), '', 64, (err, derivedKey) => {
        if (err) reject(err);
        else {
          const key = new Uint8Array(derivedKey);
          resolve([key.slice(0, 32), key.slice(32, 64)]);
        }
      });
    });
  }

  // Diffie-Hellman
  private static async DH(
    privateKey: CryptoKey,
    publicKey: CryptoKey
  ): Promise<Uint8Array> {
    const bits = await crypto.subtle.deriveBits(
      { name: 'ECDH', public: publicKey },
      privateKey,
      256
    );
    return new Uint8Array(bits);
  }

  // Serialize state for storage
  async serializeState(): Promise<string> {
    const state = {
      DHs: {
        publicKey: await crypto.subtle.exportKey('jwk', this.state.DHs.publicKey),
        privateKey: await crypto.subtle.exportKey('jwk', this.state.DHs.privateKey)
      },
      DHr: this.state.DHr ? await crypto.subtle.exportKey('jwk', this.state.DHr) : null,
      RK: Array.from(this.state.RK),
      CKs: Array.from(this.state.CKs),
      CKr: Array.from(this.state.CKr),
      Ns: this.state.Ns,
      Nr: this.state.Nr,
      PN: this.state.PN,
      MKSKIPPED: Array.from(this.state.MKSKIPPED.entries())
    };
    
    return JSON.stringify(state);
  }

  // Deserialize state from storage
  static async deserializeState(serialized: string): Promise<DoubleRatchet> {
    const state = JSON.parse(serialized);
    
    const DHs = {
      publicKey: await crypto.subtle.importKey(
        'jwk',
        state.DHs.publicKey,
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        []
      ),
      privateKey: await crypto.subtle.importKey(
        'jwk',
        state.DHs.privateKey,
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        ['deriveKey', 'deriveBits']
      )
    };

    const DHr = state.DHr ? await crypto.subtle.importKey(
      'jwk',
      state.DHr,
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      []
    ) : null;

    return new DoubleRatchet({
      DHs,
      DHr,
      RK: new Uint8Array(state.RK),
      CKs: new Uint8Array(state.CKs),
      CKr: new Uint8Array(state.CKr),
      Ns: state.Ns,
      Nr: state.Nr,
      PN: state.PN,
      MKSKIPPED: new Map(state.MKSKIPPED.map(([k, v]: [string, number[]]) => [k, new Uint8Array(v)]))
    });
  }
}
