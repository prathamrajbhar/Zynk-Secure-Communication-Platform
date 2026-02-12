// ═══════════════════════════════════════════════════════
// ZYNK UI — Connection Indicator & Banner (HeroUI)
// ═══════════════════════════════════════════════════════

'use client';

import { useConnectionStore } from '@/stores/connectionStore';
import { WifiOff, Loader2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ConnectionBanner() {
  const status = useConnectionStore((s) => s.status);

  if (status === 'connected' || status === 'connecting') return null;

  const config = {
    disconnected: {
      icon: WifiOff,
      text: 'Connection lost. Reconnecting...',
      color: 'warning' as const,
    },
    reconnecting: {
      icon: Loader2,
      text: 'Reconnecting...',
      color: 'warning' as const,
    },
    error: {
      icon: AlertTriangle,
      text: 'Connection failed. Check your internet.',
      color: 'danger' as const,
    },
  }[status];

  if (!config) return null;

  const Icon = config.icon;

  return (
    <div
      className={cn(
        'flex items-center justify-center gap-2 px-4 py-1.5 text-white text-xs font-medium animate-slide-down',
        config.color === 'warning' ? 'bg-warning' : 'bg-danger',
      )}
      role="alert"
    >
      <Icon className={cn('w-3.5 h-3.5', status === 'reconnecting' && 'animate-spin')} />
      <span>{config.text}</span>
    </div>
  );
}

export function ConnectionDot() {
  const status = useConnectionStore((s) => s.status);

  const colors: Record<string, string> = {
    connected: 'bg-success',
    connecting: 'bg-warning',
    reconnecting: 'bg-warning',
    disconnected: 'bg-danger',
    error: 'bg-danger',
  };

  return (
    <span
      className={cn(
        'w-2 h-2 rounded-full inline-block',
        colors[status],
        status === 'connected' && 'status-online',
      )}
      title={status}
    />
  );
}
