'use client';

import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { AnimatedPresence } from './primitives';
import type { ToastData } from './types';

/* ─── Toast Singleton ─── */
type ToastListener = (toast: ToastData) => void;
const toastListenerRef: { current: ToastListener | null } = { current: null };

export function showToast(type: ToastData['type'], title: string, message?: string, duration?: number) {
  toastListenerRef.current?.({ id: Date.now().toString(), type, title, message, duration: duration || 4000 });
}


/* ─── Toast Item ─── */
const TOAST_ICONS: Record<ToastData['type'], ReactNode> = {
  success: (
    <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
    </svg>
  ),
  error: (
    <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
    </svg>
  ),
  warning: (
    <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
    </svg>
  ),
  info: (
    <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
    </svg>
  ),
};

const TOAST_STYLES: Record<ToastData['type'], string> = {
  success: 'border-success/30 text-success',
  error: 'border-destructive/30 text-destructive',
  warning: 'border-warning/30 text-warning',
  info: 'border-primary/30 text-primary',
};

function ToastItem({ toast, onDismiss }: { toast: ToastData; onDismiss: (id: string) => void }) {
  const [show, setShow] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    timerRef.current = setTimeout(() => setShow(false), toast.duration || 4000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [toast.duration]);

  return (
    <AnimatedPresence show={show} animation="slide-right" duration={250}>
      <div
        className={cn(
          'group w-80 bg-card border rounded-xl p-4 shadow-lg backdrop-blur-sm',
          'flex items-start gap-3 cursor-pointer hover:bg-card/90 transition-colors',
          TOAST_STYLES[toast.type],
        )}
        onClick={() => setShow(false)}
        onTransitionEnd={() => { if (!show) onDismiss(toast.id); }}
        role="alert"
      >
        <div className="flex-shrink-0 mt-0.5">{TOAST_ICONS[toast.type]}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{toast.title}</p>
          {toast.message && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{toast.message}</p>}
        </div>
        <button
          className="flex-shrink-0 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
          onClick={(e) => { e.stopPropagation(); setShow(false); }}
          aria-label="Dismiss"
        >
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
    </AnimatedPresence>
  );
}


/* ─── Toast Provider ─── */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  useEffect(() => {
    toastListenerRef.current = (toast: ToastData) => {
      setToasts((prev) => [...prev.slice(-4), toast]);
    };
    return () => { toastListenerRef.current = null; };
  }, []);

  const handleDismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <ToastItem toast={toast} onDismiss={handleDismiss} />
          </div>
        ))}
      </div>
    </>
  );
}
