/**
 * Crypto Store — Zustand store for E2EE (1:1 + Group Sender Keys)
 *
 * Responsibilities:
 *  - Generate ECDH key pair on first login / registration
 *  - Upload public key to server
 *  - Cache derived AES keys per remote user (in-memory)
 *  - 1:1 encrypt/decrypt via ECDH + AES-GCM (v3 envelope)
 *  - Group encrypt/decrypt via Sender Keys (v4 envelope)
 *  - Distribute, fetch, rotate, and persist group sender keys
 *
 * Keys stored in localStorage (base64 strings):
 *   zynk_pub_{userId}     — own public key
 *   zynk_priv_{userId}    — own private key
 *   zynk_group_own_{userId}      — own sender keys per group
 *   zynk_group_received_{userId} — received sender keys per group
 */

import { create } from 'zustand';
import api from '@/lib/api';
import logger from '@/lib/logger';
import { getSocket, SOCKET_EVENTS } from '@/lib/socket';
import {
  generateKeyPair,
  buildKeyUploadPayload,
  deriveAESKey,
  encryptText,
  decryptText,
  isValidEncryptedMessage,
  isGroupEncryptedMessage,
  generateSafetyNumber,
  generateSenderKey,
  importSenderKey,
  encryptWithSenderKey,
  decryptWithSenderKey,
  encryptSenderKeyForDistribution,
  decryptSenderKeyDistribution,
  GroupSenderKey,
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

export function clearKeys(userId: string) {
  localStorage.removeItem(`zynk_pub_${userId}`);
  localStorage.removeItem(`zynk_priv_${userId}`);
  localStorage.removeItem(`zynk_group_own_${userId}`);
  localStorage.removeItem(`zynk_group_received_${userId}`);
}

// ========== Group sender key persistence ==========

interface PersistedKeyInfo { keyB64: string; keyId: number }

function saveGroupOwnKeys(userId: string, keys: Map<string, { keyB64: string; cryptoKey: CryptoKey; keyId: number }>) {
  const obj: Record<string, PersistedKeyInfo> = {};
  keys.forEach((v, k) => { obj[k] = { keyB64: v.keyB64, keyId: v.keyId }; });
  localStorage.setItem(`zynk_group_own_${userId}`, JSON.stringify(obj));
}

function loadGroupOwnKeysRaw(userId: string): Map<string, PersistedKeyInfo> {
  try {
    const raw = localStorage.getItem(`zynk_group_own_${userId}`);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Record<string, PersistedKeyInfo>;
    return new Map(Object.entries(parsed));
  } catch { return new Map(); }
}

function saveGroupReceivedKeys(userId: string, keys: Map<string, Map<string, { keyB64: string; cryptoKey: CryptoKey; keyId: number }>>) {
  const obj: Record<string, Record<string, PersistedKeyInfo>> = {};
  keys.forEach((senderMap, convId) => {
    obj[convId] = {};
    senderMap.forEach((v, senderId) => { obj[convId][senderId] = { keyB64: v.keyB64, keyId: v.keyId }; });
  });
  localStorage.setItem(`zynk_group_received_${userId}`, JSON.stringify(obj));
}

function loadGroupReceivedKeysRaw(userId: string): Map<string, Map<string, PersistedKeyInfo>> {
  try {
    const raw = localStorage.getItem(`zynk_group_received_${userId}`);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Record<string, Record<string, PersistedKeyInfo>>;
    const result = new Map<string, Map<string, PersistedKeyInfo>>();
    for (const [convId, senders] of Object.entries(parsed)) {
      result.set(convId, new Map(Object.entries(senders)));
    }
    return result;
  } catch { return new Map(); }
}

// ========== Store ==========

interface GroupKeyEntry { keyB64: string; cryptoKey: CryptoKey; keyId: number }

interface CryptoState {
  isInitialized: boolean;
  userId: string | null;
  publicKey: string | null;
  privateKey: string | null;

  /** In-memory cache: remoteUserId → CryptoKey (AES-GCM) */
  aesKeys: Map<string, CryptoKey>;

  /** Group sender keys: conversationId → { senderId → GroupKeyEntry } */
  groupSenderKeys: Map<string, Map<string, GroupKeyEntry>>;

  /** Own sender keys per group: conversationId → GroupKeyEntry */
  ownGroupKeys: Map<string, GroupKeyEntry>;

  // Actions
  initialize: (userId: string) => Promise<void>;
  encrypt: (remoteUserId: string, plaintext: string) => Promise<string>;
  decrypt: (remoteUserId: string, ciphertextJson: string) => Promise<string>;
  encryptGroup: (conversationId: string, plaintext: string) => Promise<string>;
  decryptGroup: (senderId: string, conversationId: string, ciphertextJson: string) => Promise<string>;
  getOrCreateGroupSenderKey: (conversationId: string) => Promise<GroupSenderKey>;
  storeGroupSenderKey: (conversationId: string, senderId: string, keyB64: string, keyId: number) => Promise<void>;
  distributeGroupSenderKey: (conversationId: string) => Promise<void>;
  fetchGroupSenderKeys: (conversationId: string) => Promise<void>;
  fetchSenderKeyForUser: (conversationId: string, senderId: string) => Promise<void>;
  rotateGroupKey: (conversationId: string) => Promise<GroupSenderKey>;
  handleMemberChange: (conversationId: string, reason: 'member_added' | 'member_removed') => Promise<void>;
  getSafetyNumber: (remoteUserId: string) => Promise<string | null>;
  cleanup: () => void;
}

export const useCryptoStore = create<CryptoState>((set, get) => ({
  isInitialized: false,
  userId: null,
  publicKey: null,
  privateKey: null,
  aesKeys: new Map(),
  groupSenderKeys: new Map(),
  ownGroupKeys: new Map(),

  /**
   * Initialize E2EE for the logged-in user.
   * Loads existing keys from localStorage or generates + uploads new ones.
   * Also restores persisted group sender keys.
   */
  initialize: async (userId: string) => {
    if (!userId) return;
    logger.debug('[E2EE] Initializing for user:', userId);

    const state = get();
    if (state.isInitialized && state.userId === userId && state.privateKey) {
      logger.debug('[E2EE] Already initialized');
      return;
    }

    // Try to load existing keys
    const existing = loadKeys(userId);
    if (existing) {
      logger.debug('[E2EE] Loaded existing key pair from localStorage');

      try {
        const payload = await buildKeyUploadPayload(existing.publicKey);
        await api.post('/keys/upload', payload);
        logger.debug('[E2EE] Re-synced key with server');
      } catch (e) {
        logger.warn('[E2EE] Key re-sync failed (non-fatal):', e);
      }

      // Restore persisted group sender keys
      const ownGroupKeys = await hydrateOwnGroupKeys(userId);
      const groupSenderKeys = await hydrateReceivedGroupKeys(userId);

      set({
        isInitialized: true,
        userId,
        publicKey: existing.publicKey,
        privateKey: existing.privateKey,
        aesKeys: new Map(),
        ownGroupKeys,
        groupSenderKeys,
      });
      return;
    }

    // First time — generate and upload
    logger.debug('[E2EE] Generating new key pair...');
    try {
      const kp = await generateKeyPair();
      const payload = await buildKeyUploadPayload(kp.publicKey);
      await api.post('/keys/upload', payload);
      storeKeys(userId, kp.publicKey, kp.privateKey);
      logger.debug('[E2EE] Keys generated and uploaded');

      set({
        isInitialized: true,
        userId,
        publicKey: kp.publicKey,
        privateKey: kp.privateKey,
        aesKeys: new Map(),
        ownGroupKeys: new Map(),
        groupSenderKeys: new Map(),
      });
    } catch (err) {
      logger.error('[E2EE] Key generation/upload failed:', err);
      throw err;
    }
  },

  /**
   * Encrypt plaintext for a remote user (1:1). Returns JSON string of v3 EncryptedEnvelope.
   */
  encrypt: async (remoteUserId: string, plaintext: string): Promise<string> => {
    const { privateKey, publicKey, aesKeys } = get();
    if (!privateKey || !publicKey) throw new Error('E2EE not initialized');

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
   * Decrypt ciphertext from a remote user (1:1). Returns plaintext.
   */
  decrypt: async (remoteUserId: string, ciphertextJson: string): Promise<string> => {
    const { privateKey, aesKeys } = get();
    if (!privateKey) throw new Error('E2EE not initialized');

    if (!isValidEncryptedMessage(ciphertextJson)) {
      return ciphertextJson;
    }

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
    } catch {
      logger.warn('[E2EE] Decrypt failed, retrying with fresh key...');
      try {
        aesKeys.delete(remoteUserId);
        const remotePub = await fetchRemotePublicKey(remoteUserId);
        if (!remotePub) return '[Decryption failed — missing key]';
        aesKey = await deriveAESKey(privateKey, remotePub);
        aesKeys.set(remoteUserId, aesKey);
        set({ aesKeys: new Map(aesKeys) });
        return await decryptText(aesKey, ciphertextJson);
      } catch (retryErr) {
        logger.error('[E2EE] Decrypt retry failed:', retryErr);
        return '[Decryption failed]';
      }
    }
  },

  /**
   * Get or create a sender key for a group conversation.
   */
  getOrCreateGroupSenderKey: async (conversationId: string): Promise<GroupSenderKey> => {
    const { ownGroupKeys, userId } = get();
    const existing = ownGroupKeys.get(conversationId);
    if (existing) {
      return { key: existing.keyB64, keyId: existing.keyId, createdAt: Date.now() };
    }

    const { key, cryptoKey } = await generateSenderKey();
    const keyId = 1;
    ownGroupKeys.set(conversationId, { keyB64: key, cryptoKey, keyId });
    set({ ownGroupKeys: new Map(ownGroupKeys) });
    if (userId) saveGroupOwnKeys(userId, ownGroupKeys);

    return { key, keyId, createdAt: Date.now() };
  },

  /**
   * Store a received sender key from another group member.
   */
  storeGroupSenderKey: async (conversationId: string, senderId: string, keyB64: string, keyId: number) => {
    const { groupSenderKeys, userId } = get();
    let convMap = groupSenderKeys.get(conversationId);
    if (!convMap) {
      convMap = new Map();
      groupSenderKeys.set(conversationId, convMap);
    }
    const cryptoKey = await importSenderKey(keyB64);
    convMap.set(senderId, { keyB64, cryptoKey, keyId });
    set({ groupSenderKeys: new Map(groupSenderKeys) });
    if (userId) saveGroupReceivedKeys(userId, groupSenderKeys);
  },

  /**
   * Distribute own sender key to all members of a group conversation.
   * Encrypts the sender key for each member via their pairwise ECDH channel.
   */
  distributeGroupSenderKey: async (conversationId: string) => {
    const { userId, privateKey, publicKey, ownGroupKeys, aesKeys } = get();
    if (!userId || !privateKey || !publicKey) throw new Error('E2EE not initialized');

    // Ensure we have a sender key
    let keyInfo = ownGroupKeys.get(conversationId);
    if (!keyInfo) {
      await get().getOrCreateGroupSenderKey(conversationId);
      keyInfo = get().ownGroupKeys.get(conversationId);
    }
    if (!keyInfo) throw new Error('Failed to create group sender key');

    // Fetch member public keys from server
    const res = await api.get(`/keys/group/${conversationId}/member-keys`);
    const members: { user_id: string; public_key: string | null }[] = res.data.members || [];

    // Encrypt sender key for each member (except self)
    const distributions: { recipient_id: string; encrypted_key: string }[] = [];
    for (const member of members) {
      if (member.user_id === userId || !member.public_key) continue;

      // Derive or use cached ECDH key with this member
      let sharedKey = aesKeys.get(member.user_id);
      if (!sharedKey) {
        sharedKey = await deriveAESKey(privateKey, member.public_key);
        aesKeys.set(member.user_id, sharedKey);
      }

      const encrypted = await encryptSenderKeyForDistribution(keyInfo.keyB64, sharedKey);
      distributions.push({ recipient_id: member.user_id, encrypted_key: encrypted });
    }

    if (distributions.length === 0) {
      logger.debug('[E2EE] No members to distribute sender key to');
      return;
    }

    // Upload to server
    await api.post(`/keys/group/${conversationId}/distribute`, {
      key_id: keyInfo.keyId,
      distributions,
    });

    // Notify via WebSocket
    const socket = getSocket();
    socket?.emit(SOCKET_EVENTS.GROUP_SENDER_KEY_DISTRIBUTED, {
      conversation_id: conversationId,
      key_id: keyInfo.keyId,
    });

    set({ aesKeys: new Map(aesKeys) });
    logger.debug(`[E2EE] Distributed sender key (kid=${keyInfo.keyId}) to ${distributions.length} members`);
  },

  /**
   * Fetch all sender keys for a group conversation (encrypted for me).
   * Called when joining a group or when notified of new keys.
   */
  fetchGroupSenderKeys: async (conversationId: string) => {
    const { userId, privateKey, groupSenderKeys, aesKeys } = get();
    if (!userId || !privateKey) return;

    try {
      const res = await api.get(`/keys/group/${conversationId}/sender-keys`);
      const keys: { sender_id: string; key_id: number; encrypted_key: string; sender_public_key: string | null }[] = res.data.keys || [];

      let convMap = groupSenderKeys.get(conversationId);
      if (!convMap) {
        convMap = new Map();
        groupSenderKeys.set(conversationId, convMap);
      }

      for (const entry of keys) {
        // Skip if we already have the same or newer version
        const existing = convMap.get(entry.sender_id);
        if (existing && existing.keyId >= entry.key_id) continue;
        if (!entry.sender_public_key) continue;

        // Derive ECDH key with sender
        let sharedKey = aesKeys.get(entry.sender_id);
        if (!sharedKey) {
          sharedKey = await deriveAESKey(privateKey, entry.sender_public_key);
          aesKeys.set(entry.sender_id, sharedKey);
        }

        // Decrypt the sender key
        const senderKeyB64 = await decryptSenderKeyDistribution(entry.encrypted_key, sharedKey);
        const cryptoKey = await importSenderKey(senderKeyB64);
        convMap.set(entry.sender_id, { keyB64: senderKeyB64, cryptoKey, keyId: entry.key_id });
      }

      set({ groupSenderKeys: new Map(groupSenderKeys), aesKeys: new Map(aesKeys) });
      saveGroupReceivedKeys(userId, groupSenderKeys);
      logger.debug(`[E2EE] Fetched ${keys.length} sender keys for conversation ${conversationId}`);
    } catch (err) {
      logger.warn('[E2EE] Failed to fetch group sender keys:', err);
    }
  },

  /**
   * Fetch a specific sender's latest key for a conversation.
   * Called on-demand when decryption fails due to missing key.
   */
  fetchSenderKeyForUser: async (conversationId: string, senderId: string) => {
    const { userId, privateKey, groupSenderKeys, aesKeys } = get();
    if (!userId || !privateKey) return;

    try {
      const res = await api.get(`/keys/group/${conversationId}/sender-key/${senderId}`);
      const entry = res.data;
      if (!entry || !entry.encrypted_key) return;

      // Derive ECDH key with sender
      let sharedKey = aesKeys.get(senderId);
      if (!sharedKey) {
        const senderPubKey = entry.sender_public_key || await fetchRemotePublicKey(senderId);
        if (!senderPubKey) return;
        sharedKey = await deriveAESKey(privateKey, senderPubKey);
        aesKeys.set(senderId, sharedKey);
      }

      const senderKeyB64 = await decryptSenderKeyDistribution(entry.encrypted_key, sharedKey);
      const cryptoKey = await importSenderKey(senderKeyB64);

      let convMap = groupSenderKeys.get(conversationId);
      if (!convMap) {
        convMap = new Map();
        groupSenderKeys.set(conversationId, convMap);
      }
      convMap.set(senderId, { keyB64: senderKeyB64, cryptoKey, keyId: entry.key_id });

      set({ groupSenderKeys: new Map(groupSenderKeys), aesKeys: new Map(aesKeys) });
      saveGroupReceivedKeys(userId, groupSenderKeys);
      logger.debug(`[E2EE] Fetched sender key for ${senderId} in ${conversationId} (kid=${entry.key_id})`);
    } catch (err) {
      logger.warn(`[E2EE] Failed to fetch sender key for ${senderId}:`, err);
    }
  },

  /**
   * Rotate own sender key for a group (e.g., after member removed).
   * Generates new key, persists, and distributes to all current members.
   */
  rotateGroupKey: async (conversationId: string): Promise<GroupSenderKey> => {
    const { ownGroupKeys, userId } = get();
    if (!userId) throw new Error('Not initialized');

    const existing = ownGroupKeys.get(conversationId);
    const newKeyId = existing ? existing.keyId + 1 : 1;

    const { key, cryptoKey } = await generateSenderKey();
    ownGroupKeys.set(conversationId, { keyB64: key, cryptoKey, keyId: newKeyId });
    set({ ownGroupKeys: new Map(ownGroupKeys) });
    saveGroupOwnKeys(userId, ownGroupKeys);

    // Distribute the new key to current members
    await get().distributeGroupSenderKey(conversationId);

    logger.debug(`[E2EE] Rotated sender key for ${conversationId} → kid=${newKeyId}`);
    return { key, keyId: newKeyId, createdAt: Date.now() };
  },

  /**
   * Handle member add/remove: rotate key (if removal) or distribute to new member.
   */
  handleMemberChange: async (conversationId: string, reason: 'member_added' | 'member_removed') => {
    try {
      if (reason === 'member_removed') {
        // Member removed → rotate key so removed member can't decrypt future messages
        await get().rotateGroupKey(conversationId);
      } else {
        // Member added → re-distribute existing key so new member can decrypt
        await get().distributeGroupSenderKey(conversationId);
      }

      // Notify other members via WebSocket
      const socket = getSocket();
      socket?.emit(SOCKET_EVENTS.GROUP_REQUEST_KEY_ROTATION, {
        conversation_id: conversationId,
        reason,
      });
    } catch (err) {
      logger.error('[E2EE] handleMemberChange failed:', err);
    }
  },

  /**
   * Encrypt plaintext for a group conversation using own sender key.
   * Automatically distributes key if not yet done.
   */
  encryptGroup: async (conversationId: string, plaintext: string): Promise<string> => {
    const { publicKey, ownGroupKeys } = get();
    if (!publicKey) throw new Error('E2EE not initialized');

    let keyInfo = ownGroupKeys.get(conversationId);
    if (!keyInfo) {
      // Generate and distribute sender key first
      await get().getOrCreateGroupSenderKey(conversationId);
      keyInfo = get().ownGroupKeys.get(conversationId);

      // Distribute in background (don't block the send)
      get().distributeGroupSenderKey(conversationId).catch(err => {
        logger.warn('[E2EE] Background key distribution failed:', err);
      });
    }
    if (!keyInfo) throw new Error('Failed to create group sender key');

    return encryptWithSenderKey(keyInfo.cryptoKey, plaintext, keyInfo.keyId, publicKey);
  },

  /**
   * Decrypt a group message from a specific sender.
   * Auto-fetches missing sender keys from server.
   */
  decryptGroup: async (senderId: string, conversationId: string, ciphertextJson: string): Promise<string> => {
    if (!isGroupEncryptedMessage(ciphertextJson)) {
      return ciphertextJson;
    }

    const { groupSenderKeys, userId } = get();

    // If it's our own message, use our own key
    if (senderId === userId) {
      const ownKey = get().ownGroupKeys.get(conversationId);
      if (ownKey) {
        try {
          return await decryptWithSenderKey(ownKey.cryptoKey, ciphertextJson);
        } catch {
          logger.warn('[E2EE] Failed to decrypt own group message');
          return '[Decryption failed]';
        }
      }
    }

    // Try stored sender key
    const convMap = groupSenderKeys.get(conversationId);
    const senderKeyInfo = convMap?.get(senderId);
    if (senderKeyInfo) {
      try {
        return await decryptWithSenderKey(senderKeyInfo.cryptoKey, ciphertextJson);
      } catch {
        // Key might be outdated/rotated — try fetching fresh
        logger.warn('[E2EE] Stored key failed, fetching fresh key...');
      }
    }

    // Auto-fetch sender key from server
    try {
      await get().fetchSenderKeyForUser(conversationId, senderId);
      const updatedConvMap = get().groupSenderKeys.get(conversationId);
      const fetchedKey = updatedConvMap?.get(senderId);
      if (fetchedKey) {
        return await decryptWithSenderKey(fetchedKey.cryptoKey, ciphertextJson);
      }
    } catch {
      logger.warn('[E2EE] Failed to fetch sender key for', senderId);
    }

    // Final fallback: try 1:1 decryption (backward compat with pre-sender-key messages)
    try {
      return await get().decrypt(senderId, ciphertextJson);
    } catch {
      return '[Cannot decrypt — missing sender key]';
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
   * Clear in-memory crypto state (logout).
   * Keys are preserved in localStorage so re-login doesn't require key re-generation.
   * Call clearKeys() explicitly to fully wipe keys (e.g., account deletion).
   */
  cleanup: () => {
    set({
      isInitialized: false,
      userId: null,
      publicKey: null,
      privateKey: null,
      aesKeys: new Map(),
      groupSenderKeys: new Map(),
      ownGroupKeys: new Map(),
    });
  },
}));

// ========== Helpers ==========

/** Hydrate own group keys from localStorage (re-import CryptoKey objects) */
async function hydrateOwnGroupKeys(userId: string): Promise<Map<string, { keyB64: string; cryptoKey: CryptoKey; keyId: number }>> {
  const raw = loadGroupOwnKeysRaw(userId);
  const result = new Map<string, { keyB64: string; cryptoKey: CryptoKey; keyId: number }>();
  for (const [convId, data] of raw) {
    try {
      const cryptoKey = await importSenderKey(data.keyB64);
      result.set(convId, { ...data, cryptoKey });
    } catch {
      logger.warn(`[E2EE] Failed to import own sender key for ${convId}`);
    }
  }
  return result;
}

/** Hydrate received group keys from localStorage */
async function hydrateReceivedGroupKeys(userId: string): Promise<Map<string, Map<string, { keyB64: string; cryptoKey: CryptoKey; keyId: number }>>> {
  const raw = loadGroupReceivedKeysRaw(userId);
  const result = new Map<string, Map<string, { keyB64: string; cryptoKey: CryptoKey; keyId: number }>>();
  for (const [convId, senderMap] of raw) {
    const imported = new Map<string, { keyB64: string; cryptoKey: CryptoKey; keyId: number }>();
    for (const [senderId, data] of senderMap) {
      try {
        const cryptoKey = await importSenderKey(data.keyB64);
        imported.set(senderId, { ...data, cryptoKey });
      } catch {
        logger.warn(`[E2EE] Failed to import received sender key from ${senderId} in ${convId}`);
      }
    }
    if (imported.size > 0) result.set(convId, imported);
  }
  return result;
}

// ========== Fetch remote user's public key from server ==========

const remoteKeyCache = new Map<string, { key: string; fetchedAt: number }>();
const REMOTE_KEY_CACHE_TTL = 600000; // 10 minutes

async function fetchRemotePublicKey(remoteUserId: string): Promise<string | null> {
  const cached = remoteKeyCache.get(remoteUserId);
  if (cached && Date.now() - cached.fetchedAt < REMOTE_KEY_CACHE_TTL) {
    return cached.key;
  }

  try {
    const res = await api.get(`/keys/${remoteUserId}/identity`);
    const key = res.data.identity_keys?.[0]?.identity_key;
    if (key) {
      remoteKeyCache.set(remoteUserId, { key, fetchedAt: Date.now() });
      return key;
    }
  } catch { /* fall through */ }

  try {
    const res = await api.get(`/keys/${remoteUserId}/bundle`);
    const key = res.data.identity_key || null;
    if (key) {
      remoteKeyCache.set(remoteUserId, { key, fetchedAt: Date.now() });
    }
    return key;
  } catch {
    logger.error('[E2EE] Failed to fetch public key for', remoteUserId);
    return null;
  }
}
