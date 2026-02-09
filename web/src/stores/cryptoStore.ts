/**
 * Crypto Store — simplified Zustand store for E2EE
 *
 * Responsibilities:
 *  - Generate ECDH key pair on first login / registration
 *  - Upload public key to server
 *  - Cache derived AES keys per remote user (in-memory)
 *  - encrypt(remoteUserId, plaintext) → encrypted JSON string
 *  - decrypt(remoteUserId, ciphertextJson) → plaintext string
 *
 * Keys are stored in localStorage (base64 strings):
 *   zynk_pub_{userId}   — own public key
 *   zynk_priv_{userId}  — own private key
 *
 * No IndexedDB. No sessions. No ratchets. Just ECDH + AES-GCM.
 */

import { create } from 'zustand';
import api from '@/lib/api';
import {
  generateKeyPair,
  buildKeyUploadPayload,
  deriveAESKey,
  encryptText,
  decryptText,
  isValidEncryptedMessage,
  generateSafetyNumber,
} from '@/lib/crypto';

// ========== localStorage helpers ==========

function storeKeys(userId: string, pub: string, priv: string) {
  localStorage.setItem(`zynk_pub_${userId}`, pub);
  localStorage.setItem(`zynk_priv_${userId}`, priv);
}

function loadKeys(userId: string): { publicKey: string; privateKey: string } | null {
  const pub = localStorage.getItem(`zynk_pub_${userId}`);
  const priv = localStorage.getItem(`zynk_priv_${userId}`);
  if (pub && priv) return { publicKey: pub, privateKey: priv };
  return null;
}

function clearKeys(userId: string) {
  localStorage.removeItem(`zynk_pub_${userId}`);
  localStorage.removeItem(`zynk_priv_${userId}`);
}

// ========== Store ==========

interface CryptoState {
  isInitialized: boolean;
  userId: string | null;
  publicKey: string | null;
  privateKey: string | null;

  /** In-memory cache: remoteUserId → CryptoKey (AES-GCM) */
  aesKeys: Map<string, CryptoKey>;

  // Actions
  initialize: (userId: string) => Promise<void>;
  encrypt: (remoteUserId: string, plaintext: string) => Promise<string>;
  decrypt: (remoteUserId: string, ciphertextJson: string) => Promise<string>;
  getSafetyNumber: (remoteUserId: string) => Promise<string | null>;
  cleanup: () => void;
}

export const useCryptoStore = create<CryptoState>((set, get) => ({
  isInitialized: false,
  userId: null,
  publicKey: null,
  privateKey: null,
  aesKeys: new Map(),

  /**
   * Initialize E2EE for the logged-in user.
   * Loads existing keys from localStorage or generates + uploads new ones.
   */
  initialize: async (userId: string) => {
    if (!userId) return;
    console.log('[E2EE] Initializing for user:', userId);

    // Already initialized for this user?
    const state = get();
    if (state.isInitialized && state.userId === userId && state.privateKey) {
      console.log('[E2EE] Already initialized');
      return;
    }

    // Try to load existing keys
    const existing = loadKeys(userId);
    if (existing) {
      console.log('[E2EE] Loaded existing key pair from localStorage');

      // Re-upload to server to ensure it has our current key
      // (handles cases where previous upload failed or server was reset)
      try {
        const payload = await buildKeyUploadPayload(existing.publicKey);
        await api.post('/keys/upload', payload);
        console.log('[E2EE] Re-synced key with server');
      } catch (e) {
        console.warn('[E2EE] Key re-sync failed (non-fatal):', e);
      }

      set({
        isInitialized: true,
        userId,
        publicKey: existing.publicKey,
        privateKey: existing.privateKey,
        aesKeys: new Map(), // fresh cache
      });
      return;
    }

    // First time — generate and upload
    console.log('[E2EE] Generating new key pair...');
    try {
      const kp = await generateKeyPair();

      // Upload FIRST, then persist locally — avoids desync if upload fails
      const payload = await buildKeyUploadPayload(kp.publicKey);
      await api.post('/keys/upload', payload);
      storeKeys(userId, kp.publicKey, kp.privateKey);
      console.log('[E2EE] Keys generated and uploaded');

      set({
        isInitialized: true,
        userId,
        publicKey: kp.publicKey,
        privateKey: kp.privateKey,
        aesKeys: new Map(),
      });
    } catch (err) {
      console.error('[E2EE] Key generation/upload failed:', err);
      throw err;
    }
  },

  /**
   * Encrypt plaintext for a remote user. Returns JSON string of EncryptedEnvelope.
   */
  encrypt: async (remoteUserId: string, plaintext: string): Promise<string> => {
    const { privateKey, publicKey, aesKeys } = get();
    if (!privateKey || !publicKey) throw new Error('E2EE not initialized');

    // Get or derive AES key for this remote user
    let aesKey = aesKeys.get(remoteUserId);
    if (!aesKey) {
      const remotePub = await fetchRemotePublicKey(remoteUserId);
      if (!remotePub) throw new Error('Cannot fetch remote public key');
      aesKey = await deriveAESKey(privateKey, remotePub);
      aesKeys.set(remoteUserId, aesKey);
      set({ aesKeys: new Map(aesKeys) });
    }

    return encryptText(aesKey, plaintext, publicKey);
  },

  /**
   * Decrypt ciphertext from a remote user. Returns plaintext.
   */
  decrypt: async (remoteUserId: string, ciphertextJson: string): Promise<string> => {
    const { privateKey, aesKeys } = get();
    if (!privateKey) throw new Error('E2EE not initialized');

    if (!isValidEncryptedMessage(ciphertextJson)) {
      return '[Unencrypted message]';
    }

    // Get or derive AES key
    let aesKey = aesKeys.get(remoteUserId);
    if (!aesKey) {
      const remotePub = await fetchRemotePublicKey(remoteUserId);
      if (!remotePub) return '[Cannot decrypt — missing key]';
      aesKey = await deriveAESKey(privateKey, remotePub);
      aesKeys.set(remoteUserId, aesKey);
      set({ aesKeys: new Map(aesKeys) });
    }

    try {
      return await decryptText(aesKey, ciphertextJson);
    } catch (firstErr) {
      // Retry once with fresh key fetch (handles remote key rotation)
      console.warn('[E2EE] Decrypt failed, retrying with fresh key...', firstErr);
      try {
        aesKeys.delete(remoteUserId);
        const remotePub = await fetchRemotePublicKey(remoteUserId);
        if (!remotePub) return '[Decryption failed — missing key]';
        aesKey = await deriveAESKey(privateKey, remotePub);
        aesKeys.set(remoteUserId, aesKey);
        set({ aesKeys: new Map(aesKeys) });
        return await decryptText(aesKey, ciphertextJson);
      } catch (retryErr) {
        console.error('[E2EE] Decrypt retry failed:', retryErr);
        return '[Decryption failed]';
      }
    }
  },

  /**
   * Get the safety number for verifying identity with a remote user.
   */
  getSafetyNumber: async (remoteUserId: string): Promise<string | null> => {
    const { publicKey } = get();
    if (!publicKey) return null;
    const remotePub = await fetchRemotePublicKey(remoteUserId);
    if (!remotePub) return null;
    return generateSafetyNumber(publicKey, remotePub);
  },

  /**
   * Clear all crypto state (logout).
   */
  cleanup: () => {
    const { userId } = get();
    if (userId) clearKeys(userId);
    set({
      isInitialized: false,
      userId: null,
      publicKey: null,
      privateKey: null,
      aesKeys: new Map(),
    });
  },
}));

// ========== Helper: fetch remote user's public key from server ==========

async function fetchRemotePublicKey(remoteUserId: string): Promise<string | null> {
  try {
    const res = await api.get(`/keys/${remoteUserId}/identity`);
    const key = res.data.identity_keys?.[0]?.identity_key;
    if (key) return key;
  } catch { /* fall through */ }

  try {
    const res = await api.get(`/keys/${remoteUserId}/bundle`);
    return res.data.identity_key || null;
  } catch {
    console.error('[E2EE] Failed to fetch public key for', remoteUserId);
    return null;
  }
}
