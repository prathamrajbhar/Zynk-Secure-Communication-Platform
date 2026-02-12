// ═══════════════════════════════════════════════════════
// ZYNK UI — Toast Notification System (HeroUI v7)
// ═══════════════════════════════════════════════════════

'use client';

import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import type { ToastData } from './types';

const ICONS = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const ICON_COLORS = {
  success: 'text-success',
  error: 'text-danger',
  warning: 'text-warning',
  info: 'text-primary',
};

const BG_COLORS = {
  success: 'border-success/30',
  error: 'border-danger/30',
  warning: 'border-warning/30',
  info: 'border-primary/30',
};

function ToastItem({ toast, onRemove }: { toast: ToastData; onRemove: (id: string) => void }) {
  const [exiting, setExiting] = useState(false);
  const Icon = ICONS[toast.type];

  useEffect(() => {
    const timer = setTimeout(() => {
      setExiting(true);
      setTimeout(() => onRemove(toast.id), 200);
    }, toast.duration || 4000);
    return () => clearTimeout(timer);
  }, [toast, onRemove]);

  const handleClose = () => {
    setExiting(true);
    setTimeout(() => onRemove(toast.id), 200);
  };

  return (
    <div
      className={cn(
        'flex items-start gap-3 px-4 py-3 rounded-xl border bg-content1 shadow-lg backdrop-blur-sm',
        'transition-all duration-200',
        BG_COLORS[toast.type],
        exiting ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0 animate-appear',
      )}
      role="alert"
      aria-live="assertive"
    >
      <Icon className={cn('w-5 h-5 flex-shrink-0 mt-0.5', ICON_COLORS[toast.type])} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground leading-tight">{toast.title}</p>
        {toast.message && (
          <p className="text-xs text-default-400 mt-0.5 leading-relaxed">{toast.message}</p>
        )}
      </div>
      <button
        onClick={handleClose}
        className="w-6 h-6 flex items-center justify-center rounded-md -mt-0.5 -mr-1 text-default-400 hover:text-foreground hover:bg-content2 transition-colors"
        aria-label="Dismiss notification"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// Singleton toast manager
let toastListenerRef: ((toast: ToastData) => void) | null = null;

export function showToast(type: ToastData['type'], title: string, message?: string, duration?: number) {
  const toast: ToastData = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    title,
    message,
    duration,
  };
  toastListenerRef?.(toast);
}

export function ToastProvider() {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const maxToasts = 5;

  const addToast = useCallback((toast: ToastData) => {
    setToasts(prev => [...prev.slice(-(maxToasts - 1)), toast]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  useEffect(() => {
    toastListenerRef = addToast;
    return () => { toastListenerRef = null; };
  }, [addToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]" aria-label="Notifications">
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
      ))}
    </div>
  );
}
