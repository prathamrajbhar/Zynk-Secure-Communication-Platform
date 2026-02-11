// ═══════════════════════════════════════════════════════
// ZYNK — Toast Notification System
// Production-grade toasts with actions, undo, stacking
// ═══════════════════════════════════════════════════════

'use client';

import { useState, useEffect, useCallback, createContext, useContext, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { X, CheckCircle2, AlertCircle, AlertTriangle, Info, Undo2 } from 'lucide-react';
import type { ToastVariant, ToastAction } from '@/components/ui/types';

// ─── Toast Item ───
interface ToastItem {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ToastAction;
  duration: number;
  createdAt: number;
}

// ─── Default icons ───
const DEFAULT_ICONS: Record<ToastVariant, ReactNode> = {
  success: <CheckCircle2 className="w-5 h-5 text-[var(--success)]" />,
  error: <AlertCircle className="w-5 h-5 text-[var(--danger)]" />,
  warning: <AlertTriangle className="w-5 h-5 text-[var(--warning)]" />,
  info: <Info className="w-5 h-5 text-[var(--info)]" />,
  action: <Info className="w-5 h-5 text-[var(--accent)]" />,
  undo: <Undo2 className="w-5 h-5 text-[var(--accent)]" />,
};

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: 'border-l-[3px] border-l-[var(--success)]',
  error: 'border-l-[3px] border-l-[var(--danger)]',
  warning: 'border-l-[3px] border-l-[var(--warning)]',
  info: 'border-l-[3px] border-l-[var(--info)]',
  action: 'border-l-[3px] border-l-[var(--accent)]',
  undo: 'border-l-[3px] border-l-[var(--accent)]',
};

// ─── Toast Component ───
function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  const [exiting, setExiting] = useState(false);
  const [progress, setProgress] = useState(100);

  const handleDismiss = useCallback(() => {
    setExiting(true);
    setTimeout(() => onDismiss(toast.id), 200);
  }, [toast.id, onDismiss]);

  useEffect(() => {
    if (toast.duration <= 0) return;

    const interval = setInterval(() => {
      const elapsed = Date.now() - toast.createdAt;
      const remaining = Math.max(0, 100 - (elapsed / toast.duration) * 100);
      setProgress(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
        handleDismiss();
      }
    }, 50);

    return () => clearInterval(interval);
  }, [toast.duration, toast.createdAt, handleDismiss]);

  return (
    <div
      className={cn(
        'relative overflow-hidden',
        'bg-[var(--bg-elevated)] rounded-xl border border-[var(--border)]',
        'shadow-[var(--shadow-lg)]',
        'w-[380px] max-w-[calc(100vw-2rem)]',
        'transition-all duration-200',
        VARIANT_STYLES[toast.variant],
        exiting
          ? 'opacity-0 translate-x-full scale-95'
          : 'opacity-100 translate-x-0 scale-100 animate-slide-in-right',
      )}
      role="alert"
      aria-live={toast.variant === 'error' ? 'assertive' : 'polite'}
    >
      <div className="flex items-start gap-3 p-3.5">
        {/* Icon */}
        <div className="flex-shrink-0 mt-0.5">
          {toast.icon || DEFAULT_ICONS[toast.variant]}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--text-primary)] leading-tight">
            {toast.title}
          </p>
          {toast.description && (
            <p className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed">
              {toast.description}
            </p>
          )}
          {toast.action && (
            <button
              onClick={() => {
                toast.action!.onClick();
                handleDismiss();
              }}
              className="mt-2 text-xs font-semibold text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors"
            >
              {toast.action.label}
            </button>
          )}
        </div>

        {/* Dismiss */}
        <button
          onClick={handleDismiss}
          className="flex-shrink-0 p-0.5 rounded-md hover:bg-[var(--hover)] text-[var(--text-muted)] transition-colors"
          aria-label="Dismiss notification"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Progress bar */}
      {toast.duration > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-transparent">
          <div
            className={cn(
              'h-full transition-all ease-linear',
              toast.variant === 'error' ? 'bg-[var(--danger)]' :
                toast.variant === 'success' ? 'bg-[var(--success)]' :
                  toast.variant === 'warning' ? 'bg-[var(--warning)]' :
                    'bg-[var(--accent)]'
            )}
            style={{ width: `${progress}%`, opacity: 0.4 }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Toast Container ───
interface ToastContextType {
  showToast: (options: {
    variant?: ToastVariant;
    title: string;
    description?: string;
    icon?: ReactNode;
    action?: ToastAction;
    duration?: number;
  }) => string;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fallback for when context isn't available
    return {
      showToast: ({ title }: { title: string }) => {
        console.log('[Toast]', title);
        return '';
      },
      dismissToast: () => { },
    };
  }
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback(({ variant = 'info', title, description, icon, action, duration = 4000 }: {
    variant?: ToastVariant;
    title: string;
    description?: string;
    icon?: ReactNode;
    action?: ToastAction;
    duration?: number;
  }) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const toast: ToastItem = { id, variant, title, description, icon, action, duration, createdAt: Date.now() };

    setToasts(prev => {
      // Max 5 toasts
      const trimmed = prev.length >= 5 ? prev.slice(1) : prev;
      return [...trimmed, toast];
    });

    return id;
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      {/* Toast stack */}
      <div
        className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none"
        aria-label="Notifications"
      >
        {toasts.map((toast, i) => (
          <div key={toast.id} className="pointer-events-auto" style={{ zIndex: 100 + i }}>
            <Toast toast={toast} onDismiss={dismissToast} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
