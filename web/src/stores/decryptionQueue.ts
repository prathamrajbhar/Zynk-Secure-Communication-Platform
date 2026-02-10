/**
 * Persistent Decryption Queue Store
 * 
 * Handles failed decryptions with persistent retry mechanism.
 * Ensures no message data is ever permanently lost.
 */

import { create } from 'zustand';
import logger from '@/lib/logger';
import { useCryptoStore } from './cryptoStore';
import { useChatStore } from './chatStore';
import { isGroupEncryptedMessage } from '@/lib/crypto';

export interface FailedDecryption {
  messageId: string;
  conversationId: string;
  senderId: string;
  encryptedContent: string;
  isGroup: boolean;
  attempts: number;
  lastAttempt: number;
  firstFailed: number;
  error?: string;
}

interface DecryptionQueueState {
  failedDecryptions: Map<string, FailedDecryption>;
  isProcessing: boolean;
  
  // Actions
  addFailedDecryption: (messageId: string, conversationId: string, senderId: string, encryptedContent: string, error?: string) => void;
  removeFailedDecryption: (messageId: string) => void;
  processQueue: () => Promise<void>;
  retryAll: () => Promise<void>;
  clearQueue: () => void;
  getQueueStats: () => { total: number; recent: number; old: number };
}

const MAX_RETRY_ATTEMPTS = 10;
const RETRY_INTERVALS = [1000, 2000, 5000, 10000, 30000, 60000, 300000, 600000, 1800000, 3600000]; // 1s to 1h
const QUEUE_STORAGE_KEY = 'zynk_decryption_queue';

// Load persisted queue from localStorage
function loadPersistedQueue(): Map<string, FailedDecryption> {
  try {
    const stored = localStorage.getItem(QUEUE_STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      return new Map(Object.entries(data));
    }
  } catch (error) {
    logger.warn('[DecryptQueue] Failed to load persisted queue:', error);
  }
  return new Map();
}

// Save queue to localStorage
function saveQueueToStorage(queue: Map<string, FailedDecryption>) {
  try {
    const obj: Record<string, FailedDecryption> = {};
    queue.forEach((value, key) => {
      obj[key] = value;
    });
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(obj));
  } catch (error) {
    logger.warn('[DecryptQueue] Failed to save queue to storage:', error);
  }
}

export const useDecryptionQueue = create<DecryptionQueueState>((set, get) => ({
  failedDecryptions: loadPersistedQueue(),
  isProcessing: false,

  addFailedDecryption: (messageId, conversationId, senderId, encryptedContent, error) => {
    const now = Date.now();
    const existing = get().failedDecryptions.get(messageId);
    
    const failedDecryption: FailedDecryption = {
      messageId,
      conversationId,
      senderId,
      encryptedContent,
      isGroup: isGroupEncryptedMessage(encryptedContent),
      attempts: existing ? existing.attempts + 1 : 1,
      lastAttempt: now,
      firstFailed: existing ? existing.firstFailed : now,
      error: error || 'Unknown decryption error'
    };

    const newQueue = new Map(get().failedDecryptions);
    newQueue.set(messageId, failedDecryption);
    
    set({ failedDecryptions: newQueue });
    saveQueueToStorage(newQueue);
    
    logger.debug(`[DecryptQueue] Added failed decryption for message ${messageId} (attempt ${failedDecryption.attempts})`);

    // Schedule retry if not at max attempts
    if (failedDecryption.attempts <= MAX_RETRY_ATTEMPTS) {
      const retryDelay = RETRY_INTERVALS[Math.min(failedDecryption.attempts - 1, RETRY_INTERVALS.length - 1)];
      setTimeout(() => {
        get().processQueue();
      }, retryDelay);
    }
  },

  removeFailedDecryption: (messageId) => {
    const newQueue = new Map(get().failedDecryptions);
    if (newQueue.delete(messageId)) {
      set({ failedDecryptions: newQueue });
      saveQueueToStorage(newQueue);
      logger.debug(`[DecryptQueue] Removed failed decryption for message ${messageId}`);
    }
  },

  processQueue: async () => {
    const { failedDecryptions, isProcessing } = get();
    if (isProcessing || failedDecryptions.size === 0) return;

    set({ isProcessing: true });
    
    const cryptoStore = useCryptoStore.getState();
    if (!cryptoStore.isInitialized) {
      set({ isProcessing: false });
      return;
    }

    const chatStore = useChatStore.getState();
    const processedIds: string[] = [];
    const now = Date.now();

    for (const [messageId, failedDecryption] of failedDecryptions) {
      if (failedDecryption.attempts > MAX_RETRY_ATTEMPTS) continue;

      // Check if enough time has passed for retry
      const timeSinceLastAttempt = now - failedDecryption.lastAttempt;
      const requiredInterval = RETRY_INTERVALS[Math.min(failedDecryption.attempts - 1, RETRY_INTERVALS.length - 1)];
      
      if (timeSinceLastAttempt < requiredInterval) continue;

      try {
        let decryptedContent: string;

        if (failedDecryption.isGroup) {
          decryptedContent = await cryptoStore.decryptGroup(
            failedDecryption.senderId,
            failedDecryption.conversationId,
            failedDecryption.encryptedContent
          );
        } else {
          decryptedContent = await cryptoStore.decrypt(
            failedDecryption.senderId,
            failedDecryption.encryptedContent
          );
        }

        // Success! Update the message in chat store
        chatStore.updateMessageContent(messageId, decryptedContent);
        processedIds.push(messageId);
        
        logger.info(`[DecryptQueue] Successfully decrypted message ${messageId} after ${failedDecryption.attempts} attempts`);

      } catch (error) {
        // Update attempts count and error
        const updatedDecryption: FailedDecryption = {
          ...failedDecryption,
          attempts: failedDecryption.attempts + 1,
          lastAttempt: now,
          error: error instanceof Error ? error.message : String(error)
        };

        const newQueue = new Map(failedDecryptions);
        newQueue.set(messageId, updatedDecryption);
        set({ failedDecryptions: newQueue });
        
        logger.debug(`[DecryptQueue] Retry ${updatedDecryption.attempts} failed for message ${messageId}:`, error);
      }
    }

    // Remove successfully processed items
    if (processedIds.length > 0) {
      const newQueue = new Map(failedDecryptions);
      processedIds.forEach(id => newQueue.delete(id));
      set({ failedDecryptions: newQueue });
      saveQueueToStorage(newQueue);
    }

    set({ isProcessing: false });
  },

  retryAll: async () => {
    const { failedDecryptions } = get();
    
    // Reset last attempt time to force immediate retry
    const resetQueue = new Map(failedDecryptions);
    resetQueue.forEach((decryption, messageId) => {
      resetQueue.set(messageId, { ...decryption, lastAttempt: 0 });
    });
    
    set({ failedDecryptions: resetQueue });
    await get().processQueue();
  },

  clearQueue: () => {
    set({ failedDecryptions: new Map() });
    localStorage.removeItem(QUEUE_STORAGE_KEY);
    logger.info('[DecryptQueue] Queue cleared');
  },

  getQueueStats: () => {
    const queue = get().failedDecryptions;
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    
    let recent = 0;
    let old = 0;
    
    queue.forEach(item => {
      if (item.firstFailed > oneHourAgo) {
        recent++;
      } else {
        old++;
      }
    });

    return { total: queue.size, recent, old };
  },
}));

// Background processor - runs every 30 seconds
let backgroundProcessor: ReturnType<typeof setInterval> | null = null;

export function startDecryptionQueueProcessor() {
  if (backgroundProcessor) return;
  
  backgroundProcessor = setInterval(() => {
    const queue = useDecryptionQueue.getState();
    if (queue.failedDecryptions.size > 0) {
      queue.processQueue();
    }
  }, 30000); // 30 seconds
  
  logger.info('[DecryptQueue] Background processor started');
}

export function stopDecryptionQueueProcessor() {
  if (backgroundProcessor) {
    clearInterval(backgroundProcessor);
    backgroundProcessor = null;
    logger.info('[DecryptQueue] Background processor stopped');
  }
}