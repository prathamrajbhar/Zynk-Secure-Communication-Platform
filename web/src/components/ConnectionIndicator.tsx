'use client';

import { useConnectionStore, ConnectionStatus, ConnectionQuality } from '@/stores/connectionStore';
import { RefreshCw, Wifi, WifiOff, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const statusConfig: Record<ConnectionStatus, { color: string; label: string; pulse?: boolean }> = {
    connected: { color: 'bg-green-500', label: 'Connected' },
    connecting: { color: 'bg-yellow-500', label: 'Connecting...', pulse: true },
    reconnecting: { color: 'bg-yellow-500', label: 'Reconnecting...', pulse: true },
    disconnected: { color: 'bg-red-500', label: 'Disconnected' },
    error: { color: 'bg-red-500', label: 'Connection Error' },
};

const qualityConfig: Record<ConnectionQuality, { label: string; color: string }> = {
    excellent: { label: 'Excellent', color: 'text-green-500' },
    good: { label: 'Good', color: 'text-yellow-500' },
    poor: { label: 'Poor', color: 'text-red-500' },
    unknown: { label: 'Unknown', color: 'text-[var(--text-muted)]' },
};

interface ConnectionIndicatorProps {
    showLabel?: boolean;
    size?: 'sm' | 'md';
}

export default function ConnectionIndicator({ showLabel = false, size = 'sm' }: ConnectionIndicatorProps) {
    const { status, quality, latency, reconnectAttempts, error } = useConnectionStore();

    const config = statusConfig[status];
    const qualityInfo = qualityConfig[quality];
    const dotSize = size === 'sm' ? 'w-2 h-2' : 'w-3 h-3';

    const handleRetry = () => {
        // Import dynamically to avoid circular deps
        import('@/lib/socket').then(({ attemptReconnect }) => {
            attemptReconnect();
        });
    };

    return (
        <div className="relative group">
            {/* Status dot */}
            <div className="flex items-center gap-1.5 cursor-help">
                <div className={cn('rounded-full', dotSize, config.color, config.pulse && 'animate-pulse')} />
                {showLabel && (
                    <span className="text-xs text-[var(--text-muted)]">{config.label}</span>
                )}
            </div>

            {/* Tooltip */}
            <div className="absolute top-full left-0 mt-2 z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 transform translate-y-1 group-hover:translate-y-0">
                <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg shadow-xl p-3 min-w-[180px]">
                    <div className="flex items-center gap-2 mb-2">
                        {status === 'connected' ? (
                            <Wifi className="w-4 h-4 text-green-500" />
                        ) : status === 'error' ? (
                            <AlertCircle className="w-4 h-4 text-red-500" />
                        ) : status === 'reconnecting' ? (
                            <RefreshCw className="w-4 h-4 text-yellow-500 animate-spin" />
                        ) : (
                            <WifiOff className="w-4 h-4 text-red-500" />
                        )}
                        <span className="text-sm font-medium text-[var(--text-primary)]">{config.label}</span>
                    </div>

                    {status === 'connected' && (
                        <>
                            <div className="flex justify-between text-xs mb-1">
                                <span className="text-[var(--text-muted)]">Quality</span>
                                <span className={qualityInfo.color}>{qualityInfo.label}</span>
                            </div>
                            {latency !== null && latency > 0 && (
                                <div className="flex justify-between text-xs">
                                    <span className="text-[var(--text-muted)]">Latency</span>
                                    <span className="text-[var(--text-secondary)]">{latency}ms</span>
                                </div>
                            )}
                        </>
                    )}

                    {status === 'reconnecting' && reconnectAttempts > 0 && (
                        <p className="text-xs text-[var(--text-muted)]">
                            Attempt {reconnectAttempts}...
                        </p>
                    )}

                    {error && (
                        <p className="text-xs text-red-500 mt-1">{error}</p>
                    )}

                    {(status === 'disconnected' || status === 'error') && (
                        <button
                            onClick={handleRetry}
                            className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-zynk-600 hover:bg-zynk-700 text-white text-xs font-medium transition-colors"
                        >
                            <RefreshCw className="w-3 h-3" />
                            Retry Connection
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

// Simplified connection banner for showing at the top when disconnected
export function ConnectionBanner() {
    const { status, reconnectAttempts, error } = useConnectionStore();

    if (status === 'connected') return null;

    return (
        <div
            className={cn(
                'px-4 py-2 text-sm text-center flex items-center justify-center gap-2',
                status === 'reconnecting' && 'bg-yellow-500/10 text-yellow-500',
                status === 'disconnected' && 'bg-red-500/10 text-red-500',
                status === 'error' && 'bg-red-500/10 text-red-500',
                status === 'connecting' && 'bg-yellow-500/10 text-yellow-500'
            )}
        >
            {status === 'reconnecting' ? (
                <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Reconnecting... {reconnectAttempts > 0 && `(attempt ${reconnectAttempts})`}</span>
                </>
            ) : status === 'connecting' ? (
                <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Connecting...</span>
                </>
            ) : (
                <>
                    <WifiOff className="w-4 h-4" />
                    <span>{error || 'Connection lost'}</span>
                    <button
                        onClick={() => import('@/lib/socket').then(({ attemptReconnect }) => attemptReconnect())}
                        className="ml-2 px-2 py-0.5 rounded bg-red-500 text-white text-xs font-medium hover:bg-red-600"
                    >
                        Retry
                    </button>
                </>
            )}
        </div>
    );
}
