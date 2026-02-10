import { create } from 'zustand';
import api from '@/lib/api';
import logger from '@/lib/logger';

export interface CallLog {
    call_id: string;
    call_type: 'audio' | 'video';
    status: 'initiated' | 'ringing' | 'in_progress' | 'ended' | 'missed' | 'declined';
    duration_seconds: number | null;
    created_at: string;
    initiator_id: string;
    participants: {
        user_id: string;
        username: string;
        display_name: string | null;
    }[];
}

interface CallHistoryState {
    callLogs: CallLog[];
    isLoading: boolean;
    error: string | null;
    fetchCallHistory: () => Promise<void>;
}

export const useCallHistoryStore = create<CallHistoryState>((set) => ({
    callLogs: [],
    isLoading: false,
    error: null,

    fetchCallHistory: async () => {
        set({ isLoading: true, error: null });
        try {
            const response = await api.get('/calls/history/list', {
                params: { limit: 50 }
            });
            set({ callLogs: response.data.calls, isLoading: false });
        } catch (error) {
            logger.error('Failed to fetch call history:', error);
            set({ error: 'Failed to load call history', isLoading: false });
        }
    },
}));
