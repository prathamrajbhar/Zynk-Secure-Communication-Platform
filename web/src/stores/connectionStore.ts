import { create } from 'zustand';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';
export type ConnectionQuality = 'excellent' | 'good' | 'poor' | 'unknown';

interface ConnectionState {
    status: ConnectionStatus;
    quality: ConnectionQuality;
    latency: number | null;
    lastConnectedAt: Date | null;
    lastDisconnectedAt: Date | null;
    reconnectAttempts: number;
    error: string | null;

    // Actions
    setStatus: (status: ConnectionStatus) => void;
    setQuality: (quality: ConnectionQuality, latency: number) => void;
    setError: (error: string | null) => void;
    incrementReconnectAttempts: () => void;
    resetReconnectAttempts: () => void;
    markConnected: () => void;
    markDisconnected: () => void;
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
    status: 'disconnected',
    quality: 'unknown',
    latency: null,
    lastConnectedAt: null,
    lastDisconnectedAt: null,
    reconnectAttempts: 0,
    error: null,

    setStatus: (status) => {
        set({ status, error: status === 'error' ? get().error : null });
    },

    setQuality: (quality, latency) => {
        set({ quality, latency });
    },

    setError: (error) => {
        set({ error, status: error ? 'error' : get().status });
    },

    incrementReconnectAttempts: () => {
        set((state) => ({ reconnectAttempts: state.reconnectAttempts + 1 }));
    },

    resetReconnectAttempts: () => {
        set({ reconnectAttempts: 0 });
    },

    markConnected: () => {
        set({
            status: 'connected',
            lastConnectedAt: new Date(),
            reconnectAttempts: 0,
            error: null,
        });
    },

    markDisconnected: () => {
        set({
            status: 'disconnected',
            lastDisconnectedAt: new Date(),
            quality: 'unknown',
            latency: null,
        });
    },
}));

// Helper function to determine quality based on latency
export function getQualityFromLatency(latencyMs: number): ConnectionQuality {
    if (latencyMs < 100) return 'excellent';
    if (latencyMs < 300) return 'good';
    return 'poor';
}

// Selector hooks for common use cases
export const useConnectionStatus = () => useConnectionStore((state) => state.status);
export const useIsConnected = () => useConnectionStore((state) => state.status === 'connected');
export const useIsReconnecting = () => useConnectionStore((state) => state.status === 'reconnecting');
