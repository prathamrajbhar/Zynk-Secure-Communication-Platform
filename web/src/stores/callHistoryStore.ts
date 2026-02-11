/**
 * Call History Store — manages fetching and displaying call logs.
 */

import { create } from 'zustand';
import api from '@/lib/api';
import logger from '@/lib/logger';

export interface CallHistoryEntry {
  id: string;
  call_type: 'audio' | 'video';
  status: 'answered' | 'missed' | 'declined';
  direction: 'incoming' | 'outgoing';
  duration_seconds: number | null;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  conversation_id: string;
  other_user: {
    id: string;
    username: string;
    display_name?: string;
    avatar_url?: string;
  } | null;
}

interface CallHistoryState {
  calls: CallHistoryEntry[];
  isLoading: boolean;
  hasMore: boolean;
  nextCursor: string | null;
  fetchCalls: () => Promise<void>;
  fetchMoreCalls: () => Promise<void>;
  addCall: (call: CallHistoryEntry) => void;
  clear: () => void;
}

export const useCallHistoryStore = create<CallHistoryState>((set, get) => ({
  calls: [],
  isLoading: false,
  hasMore: false,
  nextCursor: null,

  fetchCalls: async () => {
    set({ isLoading: true });
    try {
      const res = await api.get('/calls/history?limit=50');
      set({
        calls: res.data.calls || [],
        hasMore: res.data.hasMore || false,
        nextCursor: res.data.nextCursor || null,
      });
    } catch (error) {
      logger.error('Failed to fetch call history:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  fetchMoreCalls: async () => {
    const { nextCursor, hasMore, calls } = get();
    if (!hasMore || !nextCursor) return;
    try {
      const res = await api.get(`/calls/history?limit=50&cursor=${encodeURIComponent(nextCursor)}`);
      const older = res.data.calls || [];
      set({
        calls: [...calls, ...older],
        hasMore: res.data.hasMore || false,
        nextCursor: res.data.nextCursor || null,
      });
    } catch (error) {
      logger.error('Failed to fetch more call history:', error);
    }
  },

  addCall: (call) => {
    set((state) => ({ calls: [call, ...state.calls] }));
  },

  clear: () => {
    set({ calls: [], hasMore: false, nextCursor: null });
  },
}));
