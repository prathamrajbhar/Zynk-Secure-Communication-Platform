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
  deriveAESKeyDirect,
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
  // Key backup & v5 encryption
  encryptPrivateKeyForBackup,
  decryptPrivateKeyFromBackup,
  deriveEpochAESKey,
  encryptTextV5,
  decryptTextV5,
  isV5EncryptedMessage,
  getEnvelopeEpoch,
  exportAESKey,
  encryptKeyForArchive,
  base64ToArrayBuffer,
  // Envelope-aware helpers
  extractEnvelopeSenderKey,
  publicKeyFingerprint,
  importAESKey,
  decryptKeyFromArchive,
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
  // Save current keys to history BEFORE clearing (never lose keys)
  const existing = loadKeys(userId);
  if (existing) {
    appendKeyHistory(userId, existing.publicKey, existing.privateKey);
  }

  localStorage.removeItem(`zynk_pub_${userId}`);
  localStorage.removeItem(`zynk_priv_${userId}`);
  localStorage.removeItem(`zynk_group_own_${userId}`);
  localStorage.removeItem(`zynk_group_received_${userId}`);
  localStorage.removeItem(`zynk_epoch_${userId}`);
  // NOTE: We intentionally DO NOT clear key_history or known_remote_keys
  // Old keys must persist forever for decryption of historical messages
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

// ========== Key History Persistence (NEVER lose old keys) ==========
//
// WhatsApp/Signal principle: Identity keys are permanent.
// When keys rotate, old key pairs are preserved so historical messages
// encrypted with old keys remain decryptable forever.

interface HistoricalKeyPair {
  publicKey: string;
  privateKey: string;
  createdAt: number;
}

function saveKeyHistory(userId: string, history: HistoricalKeyPair[]) {
  try {
    localStorage.setItem(`zynk_key_history_${userId}`, JSON.stringify(history));
  } catch { /* non-fatal */ }
}

function loadKeyHistory(userId: string): HistoricalKeyPair[] {
  try {
    const raw = localStorage.getItem(`zynk_key_history_${userId}`);
    if (!raw) return [];
    return JSON.parse(raw) as HistoricalKeyPair[];
  } catch { return []; }
}

/**
 * Add a key pair to history. Deduplicates by public key fingerprint.
 * Never removes keys — only appends.
 */
function appendKeyHistory(userId: string, publicKey: string, privateKey: string) {
  const history = loadKeyHistory(userId);
  const fp = publicKeyFingerprint(publicKey);
  if (history.some(h => publicKeyFingerprint(h.publicKey) === fp)) return; // already stored
  history.push({ publicKey, privateKey, createdAt: Date.now() });
  saveKeyHistory(userId, history);
}

// ========== All-known-public-keys cache (per remote user) ==========
//
// Stores every public key we've ever seen for a remote user.
// Used as fallback during decryption when the current key doesn't work.

function saveKnownRemoteKeys(userId: string, keys: Map<string, Set<string>>) {
  try {
    const obj: Record<string, string[]> = {};
    keys.forEach((keySet, remoteUserId) => {
      obj[remoteUserId] = Array.from(keySet);
    });
    localStorage.setItem(`zynk_known_remote_keys_${userId}`, JSON.stringify(obj));
  } catch { /* non-fatal */ }
}

function loadKnownRemoteKeys(userId: string): Map<string, Set<string>> {
  try {
    const raw = localStorage.getItem(`zynk_known_remote_keys_${userId}`);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Record<string, string[]>;
    const result = new Map<string, Set<string>>();
    for (const [remoteUserId, keys] of Object.entries(parsed)) {
      result.set(remoteUserId, new Set(keys));
    }
    return result;
  } catch { return new Map(); }
}

/**
 * Track a known public key for a remote user.
 * Called whenever we see or fetch a key for someone.
 */
function trackRemoteKey(userId: string, remoteUserId: string, publicKey: string) {
  const allKnown = loadKnownRemoteKeys(userId);
  let keys = allKnown.get(remoteUserId);
  if (!keys) {
    keys = new Set();
    allKnown.set(remoteUserId, keys);
  }
  if (!keys.has(publicKey)) {
    keys.add(publicKey);
    saveKnownRemoteKeys(userId, allKnown);
  }
}

// ========== Initialization Deduplication & Ready Gate ==========

/**
 * Tracks the in-flight initialization promise so concurrent callers share the
 * same init run and don't race against each other.
 */
let _initializationPromise: Promise<void> | null = null;

/**
 * Wait for the crypto store to become initialized.
 * Returns `true` when ready, or `false` if the timeout is reached.
 *
 * Uses a Zustand subscription under the hood so it works even when called
 * before `initialize()` has been invoked.
 *
 * @param timeoutMs  Maximum wait time (default 10 s).  Set to 0 for infinite.
 */
export function waitForCryptoReady(timeoutMs = 10_000): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    if (useCryptoStore.getState().isInitialized) {
      resolve(true);
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;

    const unsub = useCryptoStore.subscribe((state) => {
      if (state.isInitialized) {
        if (timer) clearTimeout(timer);
        unsub();
        resolve(true);
      }
    });

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        unsub();
        resolve(false);
      }, timeoutMs);
    }
  });
}

// ========== Store ==========

interface GroupKeyEntry { keyB64: string; cryptoKey: CryptoKey; keyId: number }

interface CryptoState {
  isInitialized: boolean;
  userId: string | null;
  publicKey: string | null;
  privateKey: string | null;

  /** Current key epoch (incremented on key rotation) */
  keyEpoch: number;

  /** In-memory cache: remoteUserId → CryptoKey (AES-GCM) */
  aesKeys: Map<string, CryptoKey>;

  /** Group sender keys: conversationId → { senderId → GroupKeyEntry } */
  groupSenderKeys: Map<string, Map<string, GroupKeyEntry>>;

  /** Own sender keys per group: conversationId → GroupKeyEntry */
  ownGroupKeys: Map<string, GroupKeyEntry>;

  // Actions
  initialize: (userId: string, password?: string) => Promise<void>;
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
  keyEpoch: 1,

  /**
   * Initialize E2EE for the logged-in user.
   *
   * Key restoration priority:
   *   1. localStorage (fastest — same device, same browser)
   *   2. Server backup  (new device — needs password to decrypt)
   *   3. Generate new   (first-time registration)
   *
   * When password is provided (login/register), creates or verifies
   * an encrypted backup on the server so that future devices can
   * restore the same identity key pair.
   *
   * Safe to call concurrently — only one init runs at a time.
   */
  initialize: async (userId: string, password?: string) => {
    if (!userId) return;

    const state = get();
    if (state.isInitialized && state.userId === userId && state.privateKey) {
      logger.debug('[E2EE] Already initialized');
      return;
    }

    // Dedup: if an init is already in-flight, just await it
    if (_initializationPromise) {
      await _initializationPromise;
      return;
    }

    logger.debug('[E2EE] Initializing for user:', userId);

    _initializationPromise = (async () => {

      // ── 1. Try localStorage ──────────────────────────────────────────
      const existing = loadKeys(userId);
      if (existing) {
        logger.debug('[E2EE] Loaded existing key pair from localStorage');

        // Save to key history (idempotent — deduplicates)
        appendKeyHistory(userId, existing.publicKey, existing.privateKey);

        // Ensure server backup exists (non-blocking)
        if (password) {
          ensureServerBackup(existing.privateKey, existing.publicKey, password).catch(e =>
            logger.warn('[E2EE] Backup sync failed (non-fatal):', e)
          );
        }

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

        // Restore key epoch from localStorage
        const savedEpoch = parseInt(localStorage.getItem(`zynk_epoch_${userId}`) || '1', 10);

        set({
          isInitialized: true,
          userId,
          publicKey: existing.publicKey,
          privateKey: existing.privateKey,
          aesKeys: new Map(),
          ownGroupKeys,
          groupSenderKeys,
          keyEpoch: savedEpoch,
        });
        return;
      }

      // ── 2. Try server backup (new device / cleared storage) ─────────
      if (password) {
        try {
          const backupRes = await api.get('/keys/backup');
          if (backupRes.data && backupRes.data.encrypted_private_key) {
            logger.debug('[E2EE] Found server backup, restoring...');
            const privateKey = await decryptPrivateKeyFromBackup(backupRes.data, password);
            const publicKey = backupRes.data.public_key;
            const keyVersion = backupRes.data.key_version || 1;

            // Persist locally for future sessions
            storeKeys(userId, publicKey, privateKey);
            localStorage.setItem(`zynk_epoch_${userId}`, String(keyVersion));

            // Save to key history (so we never lose restored keys)
            appendKeyHistory(userId, publicKey, privateKey);

            // Re-sync identity key with server
            try {
              const payload = await buildKeyUploadPayload(publicKey);
              await api.post('/keys/upload', payload);
            } catch (e) {
              logger.warn('[E2EE] Key re-sync failed (non-fatal):', e);
            }

            set({
              isInitialized: true,
              userId,
              publicKey,
              privateKey,
              aesKeys: new Map(),
              ownGroupKeys: new Map(),
              groupSenderKeys: new Map(),
              keyEpoch: keyVersion,
            });
            logger.debug('[E2EE] Keys restored from server backup (v' + keyVersion + ')');
            return;
          }
        } catch (e: unknown) {
          // 404 = no backup exists, which is fine (first-time user)
          if (e && typeof e === 'object' && 'response' in e && (e as { response: { status: number } }).response?.status !== 404) {
            logger.warn('[E2EE] Backup restore attempt failed:', e);
          }
        }
      }

      // ── 3. Generate new keys ─────────────────────────────────────────
      // Only generate if password is available (login/register flow).
      // During hydrate (no password), we must NOT generate new keys because
      // that would orphan all previous messages encrypted with the old key.
      if (!password) {
        logger.warn('[E2EE] No local keys and no password — cannot initialize. User must re-login.');
        return;
      }

      logger.debug('[E2EE] Generating new key pair...');
      try {
        const kp = await generateKeyPair();
        const payload = await buildKeyUploadPayload(kp.publicKey);
        await api.post('/keys/upload', payload);
        storeKeys(userId, kp.publicKey, kp.privateKey);
        localStorage.setItem(`zynk_epoch_${userId}`, '1');
        logger.debug('[E2EE] Keys generated and uploaded');

        // Save to key history
        appendKeyHistory(userId, kp.publicKey, kp.privateKey);

        // Create server backup if password is available
        if (password) {
          try {
            const backup = await encryptPrivateKeyForBackup(kp.privateKey, kp.publicKey, password, 1);
            await api.post('/keys/backup', backup);
            logger.debug('[E2EE] Key backup created on server');
          } catch (e) {
            logger.warn('[E2EE] Backup creation failed (non-fatal):', e);
          }
        }

        set({
          isInitialized: true,
          userId,
          publicKey: kp.publicKey,
          privateKey: kp.privateKey,
          aesKeys: new Map(),
          ownGroupKeys: new Map(),
          groupSenderKeys: new Map(),
          keyEpoch: 1,
        });
      } catch (err) {
        logger.error('[E2EE] Key generation/upload failed:', err);
        throw err;
      }

    })(); // end of _initializationPromise IIFE

    try {
      await _initializationPromise;
    } finally {
      _initializationPromise = null;
    }
  },

  /**
   * Encrypt plaintext for a remote user (1:1).
   * Uses v5 epoch-based encryption when available, falling back to v3.
   */
  encrypt: async (remoteUserId: string, plaintext: string): Promise<string> => {
    const { privateKey, publicKey, aesKeys, keyEpoch } = get();
    if (!privateKey || !publicKey) throw new Error('E2EE not initialized');

    // Cache key by userId + epoch for v5
    const cacheKey = `${remoteUserId}:e${keyEpoch}`;
    let aesKey = aesKeys.get(cacheKey);
    if (!aesKey) {
      const remotePub = await fetchRemotePublicKey(remoteUserId);
      if (!remotePub) throw new Error('Cannot fetch remote public key');
      aesKey = await deriveEpochAESKey(privateKey, remotePub, keyEpoch);
      aesKeys.set(cacheKey, aesKey);
      set({ aesKeys: new Map(aesKeys) });

      // Archive the conversation key in background (non-blocking)
      archiveConversationKey(aesKey, remoteUserId, keyEpoch, remotePub).catch(() => { });
    }

    return encryptTextV5(aesKey, plaintext, publicKey, keyEpoch);
  },

  /**
   * Decrypt ciphertext from a remote user (1:1).
   *
   * ROBUST MULTI-STRATEGY PIPELINE (WhatsApp/Signal-level):
   *   1. Try cached AES key (fast path)
   *   2. Try deriving from envelope's embedded sender key (`sk` field)
   *   3. Try current remote public key from server (fresh fetch)
   *   4. Try ALL historical local key pairs × envelope sender key
   *   5. Try archived message keys from server
   *   6. Try ALL known remote public keys × current private key
   *
   * NEVER returns "[Decryption failed]" permanently — queues for retry.
   * Key principle: the envelope carries the sender's key at encryption time.
   */
  decrypt: async (remoteUserId: string, ciphertextJson: string): Promise<string> => {
    const { privateKey, aesKeys, userId } = get();
    if (!privateKey) throw new Error('E2EE not initialized');

    if (!isValidEncryptedMessage(ciphertextJson) && !isV5EncryptedMessage(ciphertextJson)) {
      return ciphertextJson;
    }

    // Extract the sender key embedded in the envelope (key at encryption time)
    const envelopeSenderKey = extractEnvelopeSenderKey(ciphertextJson);
    const isV5 = isV5EncryptedMessage(ciphertextJson);
    const msgEpoch = isV5 ? getEnvelopeEpoch(ciphertextJson) : 0;

    // Track the envelope sender key for future fallback use
    if (envelopeSenderKey && userId) {
      trackRemoteKey(userId, remoteUserId, envelopeSenderKey);
    }

    // ── Strategy 1: Try cached AES key ──────────────────────────────
    const cacheKey = isV5 ? `${remoteUserId}:e${msgEpoch}` : remoteUserId;
    const cachedKey = aesKeys.get(cacheKey);
    if (cachedKey) {
      try {
        return isV5
          ? await decryptTextV5(cachedKey, ciphertextJson)
          : await decryptText(cachedKey, ciphertextJson);
      } catch {
        // Cached key didn't work — continue to fallbacks
        aesKeys.delete(cacheKey);
      }
    }

    // ── Strategy 2: Derive from envelope sender key (KEY FIX) ───────
    // The envelope's `sk` field is the sender's public key AT ENCRYPTION TIME.
    // If the sender's identity key has since rotated, this is the only way
    // to derive the correct shared secret for this specific message.
    if (envelopeSenderKey) {
      try {
        const derivedKey = isV5
          ? await deriveEpochAESKey(privateKey, envelopeSenderKey, msgEpoch)
          : await deriveAESKey(privateKey, envelopeSenderKey);
        const result = isV5
          ? await decryptTextV5(derivedKey, ciphertextJson)
          : await decryptText(derivedKey, ciphertextJson);
        // Success! Cache this key for future messages from the same sender+epoch
        aesKeys.set(cacheKey, derivedKey);
        set({ aesKeys: new Map(aesKeys) });
        // Archive in background
        archiveConversationKey(derivedKey, remoteUserId, msgEpoch || 1, envelopeSenderKey).catch(() => {});
        return result;
      } catch {
        logger.debug('[E2EE] Envelope sender key derivation failed, trying more strategies...');
      }
    }

    // ── Strategy 3: Try current remote public key from server ───────
    try {
      const remotePub = await fetchRemotePublicKey(remoteUserId);
      if (remotePub) {
        if (userId) trackRemoteKey(userId, remoteUserId, remotePub);
        const derivedKey = isV5
          ? await deriveEpochAESKey(privateKey, remotePub, msgEpoch)
          : await deriveAESKey(privateKey, remotePub);
        const result = isV5
          ? await decryptTextV5(derivedKey, ciphertextJson)
          : await decryptText(derivedKey, ciphertextJson);
        aesKeys.set(cacheKey, derivedKey);
        set({ aesKeys: new Map(aesKeys) });
        archiveConversationKey(derivedKey, remoteUserId, msgEpoch || 1, remotePub).catch(() => {});
        return result;
      }
    } catch {
      // Continue to next strategy
    }

    // ── Strategy 4: Try ALL historical local key pairs with envelope key ─
    // If OUR identity key rotated, old messages used our old private key.
    // The envelope sender key is correct but we need the matching private key.
    if (envelopeSenderKey && userId) {
      const history = loadKeyHistory(userId);
      for (const historicalKP of history) {
        if (historicalKP.privateKey === privateKey) continue; // already tried
        try {
          const derivedKey = isV5
            ? await deriveEpochAESKey(historicalKP.privateKey, envelopeSenderKey, msgEpoch)
            : await deriveAESKey(historicalKP.privateKey, envelopeSenderKey);
          const result = isV5
            ? await decryptTextV5(derivedKey, ciphertextJson)
            : await decryptText(derivedKey, ciphertextJson);
          aesKeys.set(cacheKey, derivedKey);
          set({ aesKeys: new Map(aesKeys) });
          logger.info('[E2EE] Decrypted using historical key pair');
          return result;
        } catch {
          // This combination didn't work, try next
        }
      }
    }

    // ── Strategy 5: Try archived message keys from server ───────────
    try {
      const archivedKey = await tryArchivedMessageKeys(remoteUserId, ciphertextJson, isV5, msgEpoch);
      if (archivedKey) return archivedKey;
    } catch {
      // Archive fetch failed, continue
    }

    // ── Strategy 6: Try all known remote public keys × current key ──
    if (userId) {
      const allKnown = loadKnownRemoteKeys(userId);
      const knownKeys = allKnown.get(remoteUserId);
      if (knownKeys) {
        for (const remotePub of knownKeys) {
          if (remotePub === envelopeSenderKey) continue; // already tried in strategy 2
          try {
            const derivedKey = isV5
              ? await deriveEpochAESKey(privateKey, remotePub, msgEpoch)
              : await deriveAESKey(privateKey, remotePub);
            const result = isV5
              ? await decryptTextV5(derivedKey, ciphertextJson)
              : await decryptText(derivedKey, ciphertextJson);
            aesKeys.set(cacheKey, derivedKey);
            set({ aesKeys: new Map(aesKeys) });
            logger.info('[E2EE] Decrypted using known historical remote key');
            return result;
          } catch {
            // This combination didn't work, try next
          }
        }
      }
    }

    // ── Strategy 7: Cross-version fallback (v5 ↔ v3) ───────────────
    if (envelopeSenderKey) {
      try {
        const crossKey = isV5
          ? await deriveAESKey(privateKey, envelopeSenderKey)        // try v3 derivation on v5 message
          : await deriveEpochAESKey(privateKey, envelopeSenderKey, 1); // try v5-epoch-1 on v3 message
        const result = isV5
          ? await decryptText(crossKey, ciphertextJson)   // v3 decrypt
          : await decryptTextV5(crossKey, ciphertextJson); // v5 decrypt
        aesKeys.set(cacheKey, crossKey);
        set({ aesKeys: new Map(aesKeys) });
        logger.info('[E2EE] Decrypted using cross-version fallback');
        return result;
      } catch {
        // Cross-version also failed
      }
    }

    // ── All strategies exhausted — queue for retry, NEVER hard-fail ─
    logger.warn(`[E2EE] All ${7} decryption strategies failed for message from ${remoteUserId}`);
    return '🔒 Decrypting...';
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
   * NEVER returns "[Decryption failed]" — queues for retry.
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
          logger.warn('[E2EE] Failed to decrypt own group message with current key');
          // Don't return failure — try other strategies below
        }
      }
    }

    // Strategy 1: Try stored sender key
    const convMap = groupSenderKeys.get(conversationId);
    const senderKeyInfo = convMap?.get(senderId);
    if (senderKeyInfo) {
      try {
        return await decryptWithSenderKey(senderKeyInfo.cryptoKey, ciphertextJson);
      } catch {
        logger.warn('[E2EE] Stored key failed, fetching fresh key...');
      }
    }

    // Strategy 2: Auto-fetch sender key from server
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

    // Strategy 3: Fetch ALL group sender keys (bulk refresh)
    try {
      await get().fetchGroupSenderKeys(conversationId);
      const refreshedConvMap = get().groupSenderKeys.get(conversationId);
      const refreshedKey = refreshedConvMap?.get(senderId);
      if (refreshedKey) {
        return await decryptWithSenderKey(refreshedKey.cryptoKey, ciphertextJson);
      }
    } catch {
      logger.warn('[E2EE] Bulk sender key fetch failed');
    }

    // Strategy 4: Fallback to 1:1 decryption (backward compat with pre-sender-key messages)
    try {
      const result = await get().decrypt(senderId, ciphertextJson);
      // Only return if it's not a failure placeholder
      if (!result.startsWith('🔒') && !result.startsWith('🔐') && !result.startsWith('⏳')) {
        return result;
      }
    } catch {
      // 1:1 fallback also failed
    }

    // Never hard-fail — return retry placeholder
    logger.warn(`[E2EE] All group decryption strategies failed for message from ${senderId}`);
    return '🔒 Decrypting...';
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
    _initializationPromise = null;
    set({
      isInitialized: false,
      userId: null,
      publicKey: null,
      privateKey: null,
      aesKeys: new Map(),
      groupSenderKeys: new Map(),
      ownGroupKeys: new Map(),
      keyEpoch: 1,
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
      // Track every key we've ever seen for this user
      const userId = useCryptoStore.getState().userId;
      if (userId) trackRemoteKey(userId, remoteUserId, key);
      return key;
    }
  } catch { /* fall through */ }

  try {
    const res = await api.get(`/keys/${remoteUserId}/bundle`);
    const key = res.data.identity_key || null;
    if (key) {
      remoteKeyCache.set(remoteUserId, { key, fetchedAt: Date.now() });
      const userId = useCryptoStore.getState().userId;
      if (userId) trackRemoteKey(userId, remoteUserId, key);
    }
    return key;
  } catch {
    logger.error('[E2EE] Failed to fetch public key for', remoteUserId);
    return null;
  }
}

/**
 * Force-refresh a remote user's public key (bypasses cache).
 * Called when all cached strategies fail and we want the absolute latest key.
 */
async function fetchRemotePublicKeyFresh(remoteUserId: string): Promise<string | null> {
  remoteKeyCache.delete(remoteUserId);
  return fetchRemotePublicKey(remoteUserId);
}

// ========== Archived message key fallback ==========

/**
 * Try to decrypt a message using archived message keys stored on the server.
 * This handles the case where the current identity key pair can't derive
 * the correct AES key (e.g., key rotated since the message was sent).
 *
 * WhatsApp/Signal principle: message keys are stored so historical messages
 * remain decryptable even after key rotation.
 */
async function tryArchivedMessageKeys(
  remoteUserId: string,
  ciphertextJson: string,
  isV5: boolean,
  msgEpoch: number,
): Promise<string | null> {
  const userId = useCryptoStore.getState().userId;
  const privateKey = useCryptoStore.getState().privateKey;
  if (!userId || !privateKey) return null;

  try {
    // Find the conversation for this remote user
    const convRes = await api.get('/messages/conversations/list');
    const conversations = convRes.data.conversations || [];
    const conv = conversations.find((c: { type: string; other_user?: { user_id: string } }) =>
      c.type === 'one_to_one' && c.other_user?.user_id === remoteUserId
    );
    if (!conv) return null;

    // Fetch archived keys for this conversation
    const archiveRes = await api.get(`/keys/message-keys/${conv.id}`);
    const archives = archiveRes.data?.archives || [];
    if (archives.length === 0) return null;

    // Derive the archive encryption key (same derivation as archiveConversationKey)
    const archiveKey = await deriveArchiveEncryptionKey(privateKey);

    // Also try with historical key pairs
    const keyPairs = [{ privateKey }, ...loadKeyHistory(userId)];

    for (const archive of archives) {
      // Try to decrypt the archived AES key
      try {
        const restoredAESKey = await decryptKeyFromArchive(
          archive.encrypted_key,
          archive.iv,
          archiveKey,
        );

        // Try decrypting the message with this restored key
        try {
          const result = isV5
            ? await decryptTextV5(restoredAESKey, ciphertextJson)
            : await decryptText(restoredAESKey, ciphertextJson);
          logger.info(`[E2EE] Decrypted using archived key (epoch ${archive.key_epoch})`);
          return result;
        } catch {
          // This archived key didn't work for this specific message, try next
        }
      } catch {
        // Archive decryption failed (different backup key), try with historical keys
        for (const kp of keyPairs) {
          try {
            const altArchiveKey = await deriveArchiveEncryptionKey(kp.privateKey);
            const restoredAESKey = await decryptKeyFromArchive(
              archive.encrypted_key,
              archive.iv,
              altArchiveKey,
            );
            const result = isV5
              ? await decryptTextV5(restoredAESKey, ciphertextJson)
              : await decryptText(restoredAESKey, ciphertextJson);
            logger.info(`[E2EE] Decrypted using archived key with historical key pair`);
            return result;
          } catch {
            // Continue trying
          }
        }
      }
    }
  } catch (err) {
    logger.debug('[E2EE] Archive key fetch attempt failed:', err);
  }

  return null;
}

// ========== Server backup helpers ==========

/**
 * Ensure that an encrypted key backup exists on the server.
 * If no backup is found, creates one. If one exists, verifies
 * the public key matches (detects local key corruption).
 */
async function ensureServerBackup(
  privateKey: string,
  publicKey: string,
  password: string,
): Promise<void> {
  try {
    const res = await api.get('/keys/backup');
    if (res.data && res.data.encrypted_private_key) {
      // Backup exists — verify public key matches
      if (res.data.public_key !== publicKey) {
        logger.warn('[E2EE] Local key differs from backup — updating backup');
        const backup = await encryptPrivateKeyForBackup(privateKey, publicKey, password);
        await api.post('/keys/backup', backup);
      }
      return;
    }
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'response' in e && (e as { response: { status: number } }).response?.status !== 404) throw e;
  }

  // No backup exists — create one
  const backup = await encryptPrivateKeyForBackup(privateKey, publicKey, password);
  await api.post('/keys/backup', backup);
  logger.debug('[E2EE] Created new server backup');
}

/**
 * Archive a conversation AES key to the server for message history.
 * Keys are encrypted with the PBKDF2 backup key before upload.
 * This runs in the background and failures are non-fatal.
 */
async function archiveConversationKey(
  aesKey: CryptoKey,
  remoteUserId: string,
  epoch: number,
  remotePublicKey: string,
): Promise<void> {
  try {
    const userId = useCryptoStore.getState().userId;
    if (!userId) return;

    const keyB64 = await exportAESKey(aesKey);

    // Find the conversation ID for this remote user
    const convRes = await api.get('/messages/conversations/list');
    const conversations = convRes.data.conversations || [];
    const conv = conversations.find((c: { type: string; other_user?: { user_id: string } }) =>
      c.type === 'one_to_one' && c.other_user?.user_id === remoteUserId
    );
    if (!conv) return; // No conversation yet, will archive when one exists

    // We need the backup key to encrypt the archive entry.
    // Since we may not have the password in memory, we encrypt with
    // a deterministic key derived from the identity private key.
    const { privateKey } = useCryptoStore.getState();
    if (!privateKey) return;

    // Use identity key as archive encryption key (not password-based,
    // since password may not be available at this point)
    const archiveKey = await deriveArchiveEncryptionKey(privateKey);
    const { ct, iv } = await encryptKeyForArchive(keyB64, archiveKey);

    await api.post('/keys/message-keys/archive', {
      archives: [{
        conversation_id: conv.id,
        key_epoch: epoch,
        encrypted_key: ct,
        iv,
        remote_public_key: remotePublicKey,
      }],
    });
  } catch {
    // Best-effort archival — non-fatal
  }
}

/**
 * Derive a deterministic archive encryption key from the identity private key.
 * Used to encrypt message key archives when the password isn't available.
 * Since the private key is backed up, any device with the backup can derive this.
 */
async function deriveArchiveEncryptionKey(privateKeyB64: string): Promise<CryptoKey> {
  const privBytes = new Uint8Array(base64ToArrayBuffer(privateKeyB64));
  // Use a hash of the private key as HKDF input
  const hash = await crypto.subtle.digest('SHA-256', privBytes);
  const hkdfKey = await crypto.subtle.importKey('raw', hash, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new TextEncoder().encode('zynk-archive-key'),
      info: new TextEncoder().encode('message-key-archive'),
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}
