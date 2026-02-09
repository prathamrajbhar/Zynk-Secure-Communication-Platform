/**
 * Crypto Store — Zustand store for E2EE key management
 * 
 * Manages:
 * - Key generation and upload on registration
 * - Key bundle fetch and session establishment for new conversations
 * - Message encryption before send, decryption on receive   
 * - Pre-key replenishment when running low
 * 
 * SECURITY INVARIANT: This store NEVER returns plaintext from encrypt().
 * If encryption fails, the message MUST NOT be sent. The server
 * should never see readable message content.
 */

import { create } from 'zustand';
import api from '@/lib/api';
import {
  generateKeyBundle,
  initiateSession,
  encryptMessage,
  decryptMessage,
  generateSafetyNumber,
  isValidEncryptedMessage,
  type SessionState,
  type PreKeyBundle,
  type EncryptedMessage,
} from '@/lib/crypto';
import {
  initializeEncryption,
  storeKeyBundle,
  getKeyBundle,
  storeSession,
  getSession,
  clearAllStorage,
  type StoredKeyBundle,
} from '@/lib/storage';

/**
 * Derive a local-only secret from user credentials.
 * This ensures the server can never derive the IndexedDB encryption key,
 * because it's based on the user's password (which the server only stores as a bcrypt hash).
 */
async function deriveLocalSecret(userId: string, password: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const salt = encoder.encode(`zynk-local-e2ee-${userId}`);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-512' },
    keyMaterial,
    256
  );
  // Convert to hex string for use as the storage encryption secret
  return Array.from(new Uint8Array(bits))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

interface CryptoState {
  isInitialized: boolean;
  localIdentityKey: string | null;
  sessions: Map<string, SessionState>;

  // Actions
  initialize: (userId: string, userSecret: string) => Promise<void>;
  generateAndUploadKeys: (userId: string) => Promise<void>;
  getOrCreateSession: (remoteUserId: string) => Promise<SessionState | null>;
  encrypt: (remoteUserId: string, plaintext: string) => Promise<string>;
  decrypt: (remoteUserId: string, encryptedContent: string) => Promise<string>;
  getSafetyNumber: (remoteUserId: string) => Promise<string | null>;
  replenishPreKeysIfNeeded: () => Promise<void>;
  cleanup: () => Promise<void>;
}

export const useCryptoStore = create<CryptoState>((set, get) => ({
  isInitialized: false,
  localIdentityKey: null,
  sessions: new Map(),

  /**
   * Initialize the crypto layer after login.
   * Uses a user-derived secret (NOT the session token) for local key encryption.
   */
  initialize: async (userId: string, userSecret: string) => {
    try {
      // Derive a local-only encryption key from user's password hash
      // This ensures the server cannot derive the key to read local storage
      const localSecret = await deriveLocalSecret(userId, userSecret);
      await initializeEncryption(localSecret);

      // Load existing key bundle
      const existingBundle = await getKeyBundle(userId);

      if (existingBundle) {
        set({
          isInitialized: true,
          localIdentityKey: existingBundle.identityPublicKey,
        });

        // Check if pre-keys need replenishment
        get().replenishPreKeysIfNeeded().catch(console.error);
      } else {
        // First time — generate keys
        await get().generateAndUploadKeys(userId);
      }
    } catch (error) {
      console.error('Crypto initialization failed:', error);
      // Do NOT fallback to unencrypted mode — E2EE is mandatory
      set({ isInitialized: false });
      throw new Error('E2EE initialization failed. Messages cannot be sent without encryption.');
    }
  },

  /**
   * Generate a full key bundle and upload public parts to server
   */
  generateAndUploadKeys: async (userId: string) => {
    try {
      const bundle = await generateKeyBundle(50);

      // Store full bundle locally (including private keys)
      const storedBundle: StoredKeyBundle = {
        registrationId: bundle.registrationId,
        identityPublicKey: bundle.identityKeyPair.publicKey,
        identityPrivateKey: bundle.identityKeyPair.privateKey,
        signedPreKey: bundle.signedPreKey,
        preKeys: bundle.preKeys,
      };

      await storeKeyBundle(userId, storedBundle);

      // Upload public parts to server
      await api.post('/keys/upload', {
        identity_key: bundle.identityKeyPair.publicKey,
        registration_id: bundle.registrationId,
        signed_pre_key: {
          key_id: bundle.signedPreKey.keyId,
          public_key: bundle.signedPreKey.publicKey,
          signature: bundle.signedPreKey.signature,
        },
        pre_keys: bundle.preKeys.map(pk => ({
          key_id: pk.keyId,
          public_key: pk.publicKey,
        })),
      });

      set({
        isInitialized: true,
        localIdentityKey: bundle.identityKeyPair.publicKey,
      });
    } catch (error) {
      console.error('Key generation/upload failed:', error);
      throw error;
    }
  },

  /**
   * Get or create an encrypted session with a remote user
   */
  getOrCreateSession: async (remoteUserId: string) => {
    const { sessions } = get();

    // Check in-memory cache
    if (sessions.has(remoteUserId)) {
      return sessions.get(remoteUserId)!;
    }

    // Check IndexedDB
    const storedSession = await getSession(remoteUserId);
    if (storedSession) {
      sessions.set(remoteUserId, storedSession);
      set({ sessions: new Map(sessions) });
      return storedSession;
    }

    // Need to establish new session — fetch remote pre-key bundle
    try {
      const response = await api.get(`/keys/${remoteUserId}/bundle`);
      const remoteBundle: PreKeyBundle = {
        registrationId: response.data.registration_id,
        identityKey: response.data.identity_key,
        signedPreKey: response.data.signed_pre_key,
        preKey: response.data.pre_key,
      };

      // Get local identity key
      const userId = localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')!).id : null;
      if (!userId) return null;

      const localBundle = await getKeyBundle(userId);
      if (!localBundle) return null;

      // Perform key agreement
      const { session } = await initiateSession(
        localBundle.identityPrivateKey,
        localBundle.identityPublicKey,
        remoteBundle
      );

      // Store session
      await storeSession(remoteUserId, session);
      sessions.set(remoteUserId, session);
      set({ sessions: new Map(sessions) });

      return session;
    } catch (error) {
      console.error('Session establishment failed:', error);
      return null;
    }
  },

  /**
   * Encrypt a message for a remote user.
   * SECURITY: NEVER returns plaintext. Throws on failure.
   */
  encrypt: async (remoteUserId: string, plaintext: string) => {
    const session = await get().getOrCreateSession(remoteUserId);
    if (!session) {
      throw new Error('E2EE_SESSION_FAILED: Cannot establish encrypted session. Message will not be sent.');
    }

    try {
      const { encrypted, updatedSession } = await encryptMessage(session, plaintext);

      // Update session state
      await storeSession(remoteUserId, updatedSession);
      const { sessions } = get();
      sessions.set(remoteUserId, updatedSession);
      set({ sessions: new Map(sessions) });

      return JSON.stringify(encrypted);
    } catch (error) {
      console.error('Encryption failed:', error);
      // SECURITY: NEVER fallback to plaintext
      throw new Error('E2EE_ENCRYPT_FAILED: Encryption failed. Message will not be sent in plaintext.');
    }
  },

  /**
   * Decrypt a message from a remote user.
   * Returns decrypted plaintext or a failure indicator (never raw ciphertext).
   */
  decrypt: async (remoteUserId: string, encryptedContent: string) => {
    // Validate that this is actually encrypted content
    if (!isValidEncryptedMessage(encryptedContent)) {
      // Content is NOT encrypted — this is a security violation
      // Return a warning instead of showing potentially injected content
      console.warn('Received unencrypted content from', remoteUserId);
      return '[Unencrypted message — potential security issue]';
    }

    try {
      const parsed = JSON.parse(encryptedContent) as EncryptedMessage;

      const session = await get().getOrCreateSession(remoteUserId);
      if (!session) {
        return '[Cannot decrypt — no session with sender]';
      }

      const { plaintext, updatedSession } = await decryptMessage(session, parsed);

      // Update session state
      await storeSession(remoteUserId, updatedSession);
      const { sessions } = get();
      sessions.set(remoteUserId, updatedSession);
      set({ sessions: new Map(sessions) });

      return plaintext;
    } catch (error) {
      console.error('Decryption failed:', error);
      return '[Decryption failed — message cannot be read]';
    }
  },

  /**
   * Get safety number for a conversation partner
   */
  getSafetyNumber: async (remoteUserId: string) => {
    const { localIdentityKey } = get();
    if (!localIdentityKey) return null;

    try {
      const response = await api.get(`/keys/${remoteUserId}/identity`);
      const remoteIdentityKey = response.data.identity_keys?.[0]?.identity_key;
      if (!remoteIdentityKey) return null;

      return generateSafetyNumber(localIdentityKey, remoteIdentityKey);
    } catch {
      return null;
    }
  },

  /**
   * Replenish pre-keys on the server when running low
   */
  replenishPreKeysIfNeeded: async () => {
    try {
      const response = await api.get('/keys/count');
      const remaining = response.data.remaining_pre_keys;

      if (remaining < 10) {
        const userId = localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')!).id : null;
        if (!userId) return;

        const localBundle = await getKeyBundle(userId);
        if (!localBundle) return;

        // Generate more pre-keys starting from next available ID
        const maxExistingId = Math.max(...localBundle.preKeys.map(pk => pk.keyId), 0);
        const { preKeys: newPreKeys } = await generateKeyBundle(50);

        // Offset the key IDs
        const offsetPreKeys = newPreKeys.map((pk, i) => ({
          ...pk,
          keyId: maxExistingId + i + 1,
        }));

        // Upload to server
        await api.post('/keys/replenish', {
          pre_keys: offsetPreKeys.map(pk => ({
            key_id: pk.keyId,
            public_key: pk.publicKey,
          })),
        });

        // Update local store
        localBundle.preKeys = [...localBundle.preKeys, ...offsetPreKeys];
        await storeKeyBundle(userId, localBundle);
      }
    } catch (error) {
      console.error('Pre-key replenishment failed:', error);
    }
  },

  /**
   * Clean up all crypto state (called on logout)
   */
  cleanup: async () => {
    await clearAllStorage();
    set({
      isInitialized: false,
      localIdentityKey: null,
      sessions: new Map(),
    });
  },
}));
