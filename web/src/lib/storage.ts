/**
 * IndexedDB Encrypted Storage for Zynk
 * 
 * Provides encrypted local storage using IndexedDB for:
 * - E2EE key material (identity keys, session states, pre-keys)
 * - Cached messages for offline access
 * - User preferences and settings
 * 
 * All sensitive data is encrypted with AES-256-GCM using a key
 * derived from the user's session token via PBKDF2.
 */

const DB_NAME = 'zynk_secure_store';
const DB_VERSION = 1;

// Store names
const STORES = {
  KEYS: 'keys',            // E2EE key material
  SESSIONS: 'sessions',    // Signal protocol session states
  MESSAGES: 'messages',    // Cached messages
  SETTINGS: 'settings',    // User preferences
  META: 'meta',            // Metadata (encryption salt, etc.)
} as const;

let db: IDBDatabase | null = null;
let encryptionKey: CryptoKey | null = null;

// ========== Database Initialization ==========

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (db) return resolve(db);

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      // Key store: identity keys, pre-keys per device
      if (!database.objectStoreNames.contains(STORES.KEYS)) {
        database.createObjectStore(STORES.KEYS, { keyPath: 'id' });
      }

      // Session store: encrypted session states per conversation partner
      if (!database.objectStoreNames.contains(STORES.SESSIONS)) {
        const sessionStore = database.createObjectStore(STORES.SESSIONS, { keyPath: 'id' });
        sessionStore.createIndex('userId', 'userId', { unique: false });
      }

      // Message cache: recent messages for offline access
      if (!database.objectStoreNames.contains(STORES.MESSAGES)) {
        const msgStore = database.createObjectStore(STORES.MESSAGES, { keyPath: 'id' });
        msgStore.createIndex('conversationId', 'conversationId', { unique: false });
        msgStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // Settings store
      if (!database.objectStoreNames.contains(STORES.SETTINGS)) {
        database.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
      }

      // Metadata store
      if (!database.objectStoreNames.contains(STORES.META)) {
        database.createObjectStore(STORES.META, { keyPath: 'key' });
      }
    };

    request.onsuccess = (event) => {
      db = (event.target as IDBOpenDBRequest).result;
      resolve(db);
    };

    request.onerror = () => reject(request.error);
  });
}

// ========== Encryption Key Derivation ==========

/**
 * Derive an encryption key from user's password/token using PBKDF2.
 * Called once after login.
 */
export async function initializeEncryption(userSecret: string): Promise<void> {
  const database = await openDB();

  // Get or create salt
  let salt: Uint8Array;
  const metaTransaction = database.transaction(STORES.META, 'readonly');
  const metaStore = metaTransaction.objectStore(STORES.META);

  const existingSalt = await new Promise<{ key: string; value: string } | undefined>((resolve) => {
    const req = metaStore.get('encryption_salt');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(undefined);
  });

  if (existingSalt) {
    salt = new Uint8Array(atob(existingSalt.value).split('').map(c => c.charCodeAt(0)));
  } else {
    salt = crypto.getRandomValues(new Uint8Array(32));
    const saltBase64 = btoa(String.fromCharCode.apply(null, Array.from(salt)));
    const writeTransaction = database.transaction(STORES.META, 'readwrite');
    writeTransaction.objectStore(STORES.META).put({ key: 'encryption_salt', value: saltBase64 });
  }

  // Derive encryption key via PBKDF2
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(userSecret),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  encryptionKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt a value before storing in IndexedDB
 */
async function encrypt(data: string): Promise<{ ciphertext: string; iv: string }> {
  if (!encryptionKey) throw new Error('Encryption not initialized');

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(data);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    encryptionKey,
    encoded
  );

  return {
    ciphertext: btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(ciphertext)))),
    iv: btoa(String.fromCharCode.apply(null, Array.from(iv))),
  };
}

/**
 * Decrypt a value retrieved from IndexedDB
 */
async function decrypt(ciphertext: string, iv: string): Promise<string> {
  if (!encryptionKey) throw new Error('Encryption not initialized');

  const ciphertextBuffer = new Uint8Array(atob(ciphertext).split('').map(c => c.charCodeAt(0)));
  const ivBuffer = new Uint8Array(atob(iv).split('').map(c => c.charCodeAt(0)));

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBuffer },
    encryptionKey,
    ciphertextBuffer
  );

  return new TextDecoder().decode(decrypted);
}

// ========== Generic CRUD Operations ==========

async function putEncrypted(storeName: string, id: string, data: unknown, extraIndexFields?: Record<string, string>): Promise<void> {
  const database = await openDB();
  const serialized = JSON.stringify(data);
  const { ciphertext, iv } = await encrypt(serialized);

  const record: Record<string, string> = { id, ciphertext, iv, ...extraIndexFields || {} };

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function getEncrypted<T>(storeName: string, id: string): Promise<T | null> {
  const database = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.get(id);

    request.onsuccess = async () => {
      if (!request.result) return resolve(null);
      try {
        const decrypted = await decrypt(request.result.ciphertext, request.result.iv);
        resolve(JSON.parse(decrypted) as T);
      } catch {
        resolve(null);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

async function deleteItem(storeName: string, id: string): Promise<void> {
  const database = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function getAllByIndex<T>(storeName: string, indexName: string, value: string): Promise<T[]> {
  const database = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const index = store.index(indexName);
    const request = index.getAll(value);

    request.onsuccess = async () => {
      const results: T[] = [];
      for (const record of request.result) {
        try {
          const decrypted = await decrypt(record.ciphertext, record.iv);
          results.push(JSON.parse(decrypted) as T);
        } catch {
          // Skip corrupted entries
        }
      }
      resolve(results);
    };
    request.onerror = () => reject(request.error);
  });
}

// ========== Key Store Operations ==========

export interface StoredKeyBundle {
  registrationId: number;
  identityPublicKey: string;
  identityPrivateKey: string;
  signedPreKey: {
    keyId: number;
    publicKey: string;
    privateKey: string;
    signature: string;
  };
  preKeys: {
    keyId: number;
    publicKey: string;
    privateKey: string;
  }[];
}

export async function storeKeyBundle(userId: string, bundle: StoredKeyBundle): Promise<void> {
  await putEncrypted(STORES.KEYS, `identity_${userId}`, bundle);
}

export async function getKeyBundle(userId: string): Promise<StoredKeyBundle | null> {
  return getEncrypted<StoredKeyBundle>(STORES.KEYS, `identity_${userId}`);
}

// ========== Session Store Operations ==========

import type { SessionState } from './crypto';

export async function storeSession(userId: string, session: SessionState): Promise<void> {
  await putEncrypted(STORES.SESSIONS, `session_${userId}`, session, { userId });
}

export async function getSession(userId: string): Promise<SessionState | null> {
  return getEncrypted<SessionState>(STORES.SESSIONS, `session_${userId}`);
}

export async function deleteSession(userId: string): Promise<void> {
  await deleteItem(STORES.SESSIONS, `session_${userId}`);
}

// ========== Message Cache Operations ==========

interface CachedMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  messageType: string;
  status: string;
  createdAt: string;
}

export async function cacheMessage(message: CachedMessage): Promise<void> {
  await putEncrypted(STORES.MESSAGES, message.id, message, {
    conversationId: message.conversationId,
    createdAt: message.createdAt,
  });
}

export async function getCachedMessages(conversationId: string): Promise<CachedMessage[]> {
  return getAllByIndex<CachedMessage>(STORES.MESSAGES, 'conversationId', conversationId);
}

export async function clearMessageCache(): Promise<void> {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORES.MESSAGES, 'readwrite');
    const store = transaction.objectStore(STORES.MESSAGES);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// ========== Settings Store Operations ==========

export async function storeSetting(key: string, value: unknown): Promise<void> {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORES.SETTINGS, 'readwrite');
    const store = transaction.objectStore(STORES.SETTINGS);
    const request = store.put({ key, value: JSON.stringify(value) });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getSetting<T>(key: string, defaultValue: T): Promise<T> {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORES.SETTINGS, 'readonly');
    const store = transaction.objectStore(STORES.SETTINGS);
    const request = store.get(key);
    request.onsuccess = () => {
      if (!request.result) return resolve(defaultValue);
      try {
        resolve(JSON.parse(request.result.value) as T);
      } catch {
        resolve(defaultValue);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

// ========== Cleanup ==========

/**
 * Clear all encrypted storage (called on logout)
 */
export async function clearAllStorage(): Promise<void> {
  const database = await openDB();

  const storeNames = [STORES.KEYS, STORES.SESSIONS, STORES.MESSAGES, STORES.SETTINGS];

  for (const storeName of storeNames) {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  encryptionKey = null;
}

/**
 * Delete the entire database (nuclear option)
 */
export async function deleteDatabase(): Promise<void> {
  if (db) {
    db.close();
    db = null;
  }
  encryptionKey = null;

  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
