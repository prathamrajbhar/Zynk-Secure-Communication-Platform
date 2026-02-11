/**
 * Double Ratchet Store — Session Management for Signal Protocol
 * 
 * Manages Double Ratchet sessions for end-to-end encrypted messaging.
 * Handles session initialization, encryption/decryption, and persistence.
 */

import { create } from 'zustand';
import {
  RatchetState,
  RatchetMessage,
  PreKeyBundle,
  generateDHKeyPair,
  exportKeyPair,
  importKeyPair,
  importPublicKey,
  x3dhInitiator,
  x3dhResponder,
  initializeRatchetSender,
  initializeRatchetReceiver,
  ratchetEncrypt,
  ratchetDecrypt,
  isSignalProtocolMessage
} from '@/lib/signalProtocol';
import { arrayBufferToBase64, base64ToArrayBuffer } from '@/lib/crypto';
import logger from '@/lib/logger';
import api from '@/lib/api';

// ========== Types ==========

interface SerializedRatchetState {
  rootKey: string;
  sendingChainKey: string | null;
  receivingChainKey: string | null;
  sendingChainN: number;
  receivingChainN: number;
  previousChainN: number;
  dhPublicKey: string;
  dhPrivateKey: string;
  peerDhPublicKey: string | null;
  skippedMessageKeys: Record<string, string>;
}

interface RatchetSession {
  state: RatchetState;
  peerId: string;
  conversationId: string;
  lastUsed: number;
}

interface DoubleRatchetStoreState {
  sessions: Map<string, RatchetSession>;
  enabled: boolean;

  // Actions
  initSession: (peerId: string, conversationId: string, bundle?: PreKeyBundle) => Promise<void>;
  encryptWithRatchet: (peerId: string, plaintext: string, senderPublicKey: string) => Promise<string>;
  decryptWithRatchet: (peerId: string, ciphertext: string) => Promise<string>;
  getSession: (peerId: string) => RatchetSession | undefined;
  saveSession: (peerId: string) => Promise<void>;
  loadSession: (peerId: string) => Promise<boolean>;
  syncSessionsFromServer: () => Promise<void>;
  deleteSession: (peerId: string) => void;
  toggleRatchet: (enabled: boolean) => void;
  cleanupOldSessions: () => void;
}

// ========== Constants ==========

const SESSION_STORAGE_PREFIX = 'zynk_signal_session_';
const SESSION_TIMEOUT = 30 * 24 * 60 * 60 * 1000; // 30 days

// ========== Serialization Helpers ==========

async function serializeRatchetState(state: RatchetState): Promise<SerializedRatchetState> {
  const rootKeyRaw = await crypto.subtle.exportKey('raw', state.rootKey);
  const dhPublicKeyRaw = await crypto.subtle.exportKey('raw', state.dhKeyPair.publicKey);
  const dhPrivateKeyRaw = await crypto.subtle.exportKey('pkcs8', state.dhKeyPair.privateKey);

  let sendingChainKeyB64: string | null = null;
  if (state.sendingChainKey) {
    const sendingChainKeyRaw = await crypto.subtle.exportKey('raw', state.sendingChainKey);
    sendingChainKeyB64 = arrayBufferToBase64(sendingChainKeyRaw);
  }

  let receivingChainKeyB64: string | null = null;
  if (state.receivingChainKey) {
    const receivingChainKeyRaw = await crypto.subtle.exportKey('raw', state.receivingChainKey);
    receivingChainKeyB64 = arrayBufferToBase64(receivingChainKeyRaw);
  }

  let peerDhPublicKeyB64: string | null = null;
  if (state.peerDhPublicKey) {
    const peerDhPublicKeyRaw = await crypto.subtle.exportKey('raw', state.peerDhPublicKey);
    peerDhPublicKeyB64 = arrayBufferToBase64(peerDhPublicKeyRaw);
  }

  // Serialize skipped message keys
  const skippedMessageKeys: Record<string, string> = {};
  for (const [key, messageKey] of state.skippedMessageKeys) {
    const messageKeyRaw = await crypto.subtle.exportKey('raw', messageKey);
    skippedMessageKeys[key] = arrayBufferToBase64(messageKeyRaw);
  }

  return {
    rootKey: arrayBufferToBase64(rootKeyRaw),
    sendingChainKey: sendingChainKeyB64,
    receivingChainKey: receivingChainKeyB64,
    sendingChainN: state.sendingChainN,
    receivingChainN: state.receivingChainN,
    previousChainN: state.previousChainN,
    dhPublicKey: arrayBufferToBase64(dhPublicKeyRaw),
    dhPrivateKey: arrayBufferToBase64(dhPrivateKeyRaw),
    peerDhPublicKey: peerDhPublicKeyB64,
    skippedMessageKeys
  };
}

async function deserializeRatchetState(serialized: SerializedRatchetState): Promise<RatchetState> {
  const rootKey = await crypto.subtle.importKey(
    'raw',
    base64ToArrayBuffer(serialized.rootKey),
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );

  let sendingChainKey: CryptoKey | null = null;
  if (serialized.sendingChainKey) {
    sendingChainKey = await crypto.subtle.importKey(
      'raw',
      base64ToArrayBuffer(serialized.sendingChainKey),
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
  }

  let receivingChainKey: CryptoKey | null = null;
  if (serialized.receivingChainKey) {
    receivingChainKey = await crypto.subtle.importKey(
      'raw',
      base64ToArrayBuffer(serialized.receivingChainKey),
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
  }

  const dhPublicKey = await crypto.subtle.importKey(
    'raw',
    base64ToArrayBuffer(serialized.dhPublicKey),
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    []
  );

  const dhPrivateKey = await crypto.subtle.importKey(
    'pkcs8',
    base64ToArrayBuffer(serialized.dhPrivateKey),
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );

  let peerDhPublicKey: CryptoKey | null = null;
  if (serialized.peerDhPublicKey) {
    peerDhPublicKey = await crypto.subtle.importKey(
      'raw',
      base64ToArrayBuffer(serialized.peerDhPublicKey),
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      []
    );
  }

  // Deserialize skipped message keys
  const skippedMessageKeys = new Map<string, CryptoKey>();
  for (const [key, messageKeyB64] of Object.entries(serialized.skippedMessageKeys)) {
    const messageKey = await crypto.subtle.importKey(
      'raw',
      base64ToArrayBuffer(messageKeyB64),
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    skippedMessageKeys.set(key, messageKey);
  }

  return {
    rootKey,
    sendingChainKey,
    receivingChainKey,
    sendingChainN: serialized.sendingChainN,
    receivingChainN: serialized.receivingChainN,
    previousChainN: serialized.previousChainN,
    dhKeyPair: { publicKey: dhPublicKey, privateKey: dhPrivateKey },
    peerDhPublicKey,
    skippedMessageKeys
  };
}

// ========== Store ==========

export const useDoubleRatchetStore = create<DoubleRatchetStoreState>((set, get) => ({
  sessions: new Map(),
  enabled: typeof window !== 'undefined'
    ? localStorage.getItem('zynk_signal_enabled') === 'true'
    : true, // Enabled by default

  /**
   * Initialize a new Signal Protocol session
   * If bundle is provided, we're the initiator (sender)
   * Otherwise, we're the responder (receiver)
   */
  initSession: async (peerId: string, conversationId: string, bundle?: PreKeyBundle) => {
    try {
      // Check if session already exists
      const existing = get().sessions.get(peerId);
      if (existing) {
        logger.debug(`[Signal] Session already exists for ${peerId}`);
        return;
      }

      // Get our identity key
      const userStr = localStorage.getItem('user');
      const userId = userStr ? JSON.parse(userStr).id : null;
      if (!userId) throw new Error('User not logged in');

      const ourIdentityKeyB64 = localStorage.getItem(`zynk_pub_${userId}`);
      const ourIdentityPrivKeyB64 = localStorage.getItem(`zynk_priv_${userId}`);
      if (!ourIdentityKeyB64 || !ourIdentityPrivKeyB64) {
        throw new Error('Identity key not found');
      }

      const ourIdentityKeyPair = await importKeyPair({
        publicKey: ourIdentityKeyB64,
        privateKey: ourIdentityPrivKeyB64
      });

      let ratchetState: RatchetState;

      if (bundle) {
        // We're the initiator - perform X3DH
        logger.debug(`[Signal] Initiating session with ${peerId}`);

        // Generate ephemeral key
        const ephemeralKeyPair = await generateDHKeyPair();

        // Perform X3DH key agreement
        const { sharedSecret } = await x3dhInitiator(
          ourIdentityKeyPair,
          ephemeralKeyPair,
          bundle
        );

        // Initialize ratchet as sender
        const peerSignedPreKey = await importPublicKey(bundle.signedPreKey);
        ratchetState = await initializeRatchetSender(sharedSecret, peerSignedPreKey);

      } else {
        // We're the responder - initialize ratchet, will complete on first message
        logger.debug(`[Signal] Preparing to receive session from ${peerId}`);

        // Generate our DH key pair
        const dhKeyPair = await generateDHKeyPair();

        // Initialize ratchet as receiver (will complete on first message)
        const zeroSecret = new Uint8Array(32); // Temporary, will be replaced
        ratchetState = await initializeRatchetReceiver(zeroSecret.buffer, dhKeyPair);
      }

      const session: RatchetSession = {
        state: ratchetState,
        peerId,
        conversationId,
        lastUsed: Date.now()
      };

      set(state => {
        const newSessions = new Map(state.sessions);
        newSessions.set(peerId, session);
        return { sessions: newSessions };
      });

      await get().saveSession(peerId);
      logger.info(`[Signal] Session initialized for ${peerId}`);

    } catch (error) {
      logger.error(`[Signal] Session init failed for ${peerId}:`, error);
      throw error;
    }
  },

  /**
   * Encrypt a message using Signal Protocol Double Ratchet
   */
  encryptWithRatchet: async (peerId: string, plaintext: string, senderPublicKey: string) => {
    let session = get().sessions.get(peerId);

    if (!session) {
      // Try to load from storage
      const loaded = await get().loadSession(peerId);
      if (!loaded) {
        throw new Error(`No Signal session for ${peerId}`);
      }
      session = get().sessions.get(peerId);
      if (!session) {
        throw new Error(`Failed to load Signal session for ${peerId}`);
      }
    }

    try {
      const { message, newState } = await ratchetEncrypt(session.state, plaintext);

      // Update session state
      session.state = newState;
      session.lastUsed = Date.now();

      set(state => {
        const newSessions = new Map(state.sessions);
        newSessions.set(peerId, session!);
        return { sessions: newSessions };
      });

      // Save state periodically
      if (Math.random() < 0.2) { // 20% chance to save
        await get().saveSession(peerId);
      }

      // Add sender public key to envelope
      const envelope = { ...message, sk: senderPublicKey };
      return JSON.stringify(envelope);

    } catch (error) {
      logger.error(`[Signal] Encryption failed for ${peerId}:`, error);
      throw error;
    }
  },

  /**
   * Decrypt a message using Signal Protocol Double Ratchet
   */
  decryptWithRatchet: async (peerId: string, ciphertext: string) => {
    let session = get().sessions.get(peerId);

    if (!session) {
      const loaded = await get().loadSession(peerId);
      if (!loaded) {
        throw new Error(`No Signal session for ${peerId}`);
      }
      session = get().sessions.get(peerId);
      if (!session) {
        throw new Error(`Failed to load Signal session for ${peerId}`);
      }
    }

    try {
      const message: RatchetMessage = JSON.parse(ciphertext);
      const { plaintext, newState } = await ratchetDecrypt(session.state, message);

      // Update session state
      session.state = newState;
      session.lastUsed = Date.now();

      set(state => {
        const newSessions = new Map(state.sessions);
        newSessions.set(peerId, session!);
        return { sessions: newSessions };
      });

      // Always save after decrypt (important for forward secrecy)
      await get().saveSession(peerId);

      return plaintext;

    } catch (error) {
      logger.error(`[Signal] Decryption failed for ${peerId}:`, error);
      throw error;
    }
  },

  getSession: (peerId: string) => {
    return get().sessions.get(peerId);
  },

  /**
   * Save session to localStorage
   */
  saveSession: async (peerId: string) => {
    const session = get().sessions.get(peerId);
    if (!session) return;

    try {
      const serialized = await serializeRatchetState(session.state);
      const data = {
        state: serialized,
        peerId: session.peerId,
        conversationId: session.conversationId,
        lastUsed: session.lastUsed
      };

      localStorage.setItem(`${SESSION_STORAGE_PREFIX}${peerId}`, JSON.stringify(data));
      logger.debug(`[Signal] Saved session for ${peerId}`);

    } catch (error) {
      logger.error(`[Signal] Failed to save session for ${peerId}:`, error);
    }

    // Also push to server for sync/backup
    try {
      const state = get().sessions.get(peerId)?.state;
      const conversationId = get().sessions.get(peerId)?.conversationId;
      if (state && conversationId) {
        const serialized = await serializeRatchetState(state);
        await api.post('/sessions', {
          peer_id: peerId,
          conversation_id: conversationId,
          ...serialized
        });
        logger.debug(`[Signal] Pushed session for ${peerId} to server`);
      }
    } catch (err) {
      logger.warn(`[Signal] Failed to push session to server:`, err);
    }
  },

  /**
   * Load session from localStorage
   */
  loadSession: async (peerId: string): Promise<boolean> => {
    try {
      const stored = localStorage.getItem(`${SESSION_STORAGE_PREFIX}${peerId}`);
      if (!stored) return false;

      const data = JSON.parse(stored);
      const state = await deserializeRatchetState(data.state);

      const session: RatchetSession = {
        state,
        peerId: data.peerId,
        conversationId: data.conversationId,
        lastUsed: data.lastUsed
      };

      set(stateObj => {
        const newSessions = new Map(stateObj.sessions);
        newSessions.set(peerId, session);
        return { sessions: newSessions };
      });

      logger.debug(`[Signal] Loaded session for ${peerId}`);
      return true;

    } catch (error) {
      logger.error(`[Signal] Failed to load session for ${peerId}:`, error);
      return false;
    }
  },

  /**
   * Sync all sessions from server (e.g. after login or on a new device)
   */
  syncSessionsFromServer: async () => {
    try {
      logger.info('[Signal] Syncing sessions from server...');
      const res = await api.get('/sessions');
      const serverSessions = res.data.sessions || [];

      for (const sessionInfo of serverSessions) {
        const peerId = sessionInfo.peer_id;
        // Don't overwrite existing memory session if it's newer
        if (get().sessions.has(peerId)) continue;

        try {
          const detailRes = await api.get(`/sessions/${peerId}?conversation_id=${sessionInfo.conversation_id}`);
          const data = detailRes.data;

          // Map backend names to SerializedRatchetState names if needed
          // Actually routes/sessions.ts returns them as serialized in serializeRatchetState
          const state = await deserializeRatchetState({
            rootKey: data.root_key,
            sendingChainKey: data.sending_chain_key,
            receivingChainKey: data.receiving_chain_key,
            sendingChainN: data.sending_chain_n,
            receivingChainN: data.receiving_chain_n,
            previousChainN: data.previous_chain_n,
            dhPublicKey: data.dh_public_key,
            dhPrivateKey: data.dh_private_key,
            peerDhPublicKey: data.peer_dh_public_key,
            skippedMessageKeys: data.skipped_message_keys
          });

          const session: RatchetSession = {
            state,
            peerId: data.peer_id,
            conversationId: data.conversation_id,
            lastUsed: new Date(data.updated_at).getTime()
          };

          set(stateObj => {
            const newSessions = new Map(stateObj.sessions);
            newSessions.set(peerId, session);
            return { sessions: newSessions };
          });

          // Also persist locally
          localStorage.setItem(`${SESSION_STORAGE_PREFIX}${peerId}`, JSON.stringify({
            state: await serializeRatchetState(state),
            peerId: data.peer_id,
            conversationId: data.conversation_id,
            lastUsed: session.lastUsed
          }));

        } catch (err) {
          logger.warn(`[Signal] Failed to sync session detail for ${peerId}:`, err);
        }
      }
      logger.info(`[Signal] Synced ${serverSessions.length} sessions from server`);
    } catch (error) {
      logger.error('[Signal] Failed to sync sessions from server:', error);
    }
  },

  /**
   * Delete a session
   */
  deleteSession: (peerId: string) => {
    set(state => {
      const newSessions = new Map(state.sessions);
      newSessions.delete(peerId);
      return { sessions: newSessions };
    });

    localStorage.removeItem(`${SESSION_STORAGE_PREFIX}${peerId}`);
    logger.info(`[Signal] Deleted session for ${peerId}`);
  },

  /**
   * Toggle Signal Protocol on/off
   */
  toggleRatchet: (enabled: boolean) => {
    set({ enabled });
    localStorage.setItem('zynk_signal_enabled', enabled.toString());
    logger.info(`[Signal] ${enabled ? 'Enabled' : 'Disabled'} Signal Protocol`);
  },

  /**
   * Cleanup old sessions
   */
  cleanupOldSessions: () => {
    const now = Date.now();
    const sessions = get().sessions;
    let cleaned = 0;

    sessions.forEach((session, peerId) => {
      if (now - session.lastUsed > SESSION_TIMEOUT) {
        sessions.delete(peerId);
        localStorage.removeItem(`${SESSION_STORAGE_PREFIX}${peerId}`);
        cleaned++;
      }
    });

    if (cleaned > 0) {
      set({ sessions: new Map(sessions) });
      logger.info(`[Signal] Cleaned up ${cleaned} old session(s)`);
    }
  }
}));

// Cleanup old sessions on startup
if (typeof window !== 'undefined') {
  useDoubleRatchetStore.getState().cleanupOldSessions();

  // Periodic cleanup every 24 hours
  setInterval(() => {
    useDoubleRatchetStore.getState().cleanupOldSessions();
  }, 24 * 3600000);
}

// Export helper for checking if message is Signal Protocol
export { isSignalProtocolMessage };
