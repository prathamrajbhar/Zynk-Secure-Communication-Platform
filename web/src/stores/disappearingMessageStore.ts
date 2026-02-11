import { create } from 'zustand';
import logger from '@/lib/logger';
import { useChatStore } from './chatStore';

interface DisappearingMessageState {
  // conversationId -> timer in seconds
  conversationTimers: Map<string, number | null>;
  
  // Actions
  setTimer: (conversationId: string, seconds: number | null) => void;
  getTimer: (conversationId: string) => number | null;
  handleMessageExpiry: (conversationId: string, messageId: string) => void;
  loadTimersFromStorage: () => void;
}

export const useDisappearingMessageStore = create<DisappearingMessageState>((set, get) => ({
  conversationTimers: new Map(),

  setTimer: (conversationId: string, seconds: number | null) => {
    const timers = new Map(get().conversationTimers);
    
    if (seconds === null || seconds === 0) {
      timers.delete(conversationId);
      localStorage.removeItem(`zynk_disappearing_timer_${conversationId}`);
    } else {
      timers.set(conversationId, seconds);
      localStorage.setItem(`zynk_disappearing_timer_${conversationId}`, seconds.toString());
    }
    
    set({ conversationTimers: timers });
    logger.debug(`[Disappearing] Timer set for ${conversationId}: ${seconds || 'OFF'}`);
  },

  getTimer: (conversationId: string) => {
    const timer = get().conversationTimers.get(conversationId);
    return timer === undefined ? null : timer;
  },

  handleMessageExpiry: (conversationId: string, messageId: string) => {
    logger.debug(`[Disappearing] Message ${messageId} expired, removing from UI`);
    
    // Remove message from chat store
    const chatStore = useChatStore.getState();
    const messages = chatStore.messages[conversationId] || [];
    const updatedMessages = messages.filter(m => m.id !== messageId && m.tempId !== messageId);
    
    chatStore.setMessages(conversationId, updatedMessages);
    
    // Optionally show a toast notification
    // toast.info('Message expired and was deleted');
  },

  loadTimersFromStorage: () => {
    if (typeof window === 'undefined') return;
    
    const timers = new Map<string, number>();
    const keys = Object.keys(localStorage);
    
    keys.forEach(key => {
      if (key.startsWith('zynk_disappearing_timer_')) {
        const conversationId = key.replace('zynk_disappearing_timer_', '');
        const value = parseInt(localStorage.getItem(key) || '0', 10);
        if (value > 0) {
          timers.set(conversationId, value);
        }
      }
    });
    
    set({ conversationTimers: timers });
    logger.debug(`[Disappearing] Loaded ${timers.size} timer(s) from storage`);
  },
}));

// Initialize on load
if (typeof window !== 'undefined') {
  useDisappearingMessageStore.getState().loadTimersFromStorage();
}
