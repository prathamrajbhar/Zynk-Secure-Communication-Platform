// ═══════════════════════════════════════════════════════
// ZYNK UI — Primitive Components
// Avatar, Badge, ProgressBar, AnimatedPresence, etc.
// ═══════════════════════════════════════════════════════

'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn, getInitials, getAvatarColor } from '@/lib/utils';
import { Check } from 'lucide-react';
import type { AvatarProps, BadgeProps, ProgressBarProps, AnimatedPresenceProps } from './types';

// ─── Avatar ───
const AVATAR_SIZES = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-lg',
} as const;

const STATUS_SIZES = {
  xs: 'w-2 h-2 border',
  sm: 'w-2.5 h-2.5 border-[1.5px]',
  md: 'w-3 h-3 border-2',
  lg: 'w-3.5 h-3.5 border-2',
  xl: 'w-4 h-4 border-2',
} as const;

export function Avatar({ name, src, size = 'md', color, isOnline, showStatus = true, className, onClick }: AvatarProps) {
  const [imgError, setImgError] = useState(false);
  const bgColor = color || getAvatarColor(name);
  const sizeClass = AVATAR_SIZES[size];
  const statusSize = STATUS_SIZES[size];

  return (
    <button
      type="button"
      className={cn('relative flex-shrink-0 group', onClick && 'cursor-pointer', className)}
      onClick={onClick}
      aria-label={`${name}'s avatar${isOnline ? ', online' : ''}`}
      tabIndex={onClick ? 0 : -1}
    >
      {src && !imgError ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name}
          className={cn(sizeClass, 'rounded-full object-cover ring-0 transition-all', onClick && 'group-hover:ring-2 group-hover:ring-[var(--accent-ring)]')}
          onError={() => setImgError(true)}
          loading="lazy"
        />
      ) : (
        <div className={cn(
          sizeClass,
          'rounded-full flex items-center justify-center font-semibold text-white transition-all',
          bgColor,
          onClick && 'group-hover:brightness-110 group-hover:ring-2 group-hover:ring-[var(--accent-ring)]'
        )}>
          {getInitials(name)}
        </div>
      )}
      {showStatus && isOnline && (
        <span className={cn(
          statusSize,
          'absolute bottom-0 right-0 rounded-full bg-[var(--success)] border-[var(--bg-surface)]',
          'online-pulse'
        )} />
      )}
    </button>
  );
}

// ─── Badge ───
export function Badge({ count, max = 99, variant = 'default', size = 'sm', dot, className }: BadgeProps) {
  if (count <= 0 && !dot) return null;

  const variants = {
    default: 'bg-[var(--accent)] text-white',
    accent: 'bg-[var(--accent)] text-white',
    danger: 'bg-[var(--danger)] text-white',
    success: 'bg-[var(--success)] text-white',
  };

  const sizes = {
    sm: dot ? 'w-2.5 h-2.5' : 'min-w-[18px] h-[18px] text-[10px] px-1',
    md: dot ? 'w-3 h-3' : 'min-w-[22px] h-[22px] text-xs px-1.5',
  };

  if (dot) {
    return <span className={cn('rounded-full', variants[variant], sizes[size], className)} />;
  }

  return (
    <span className={cn(
      'rounded-full font-bold flex items-center justify-center flex-shrink-0',
      variants[variant],
      sizes[size],
      className
    )}
      aria-label={`${count} unread`}
    >
      {count > max ? `${max}+` : count}
    </span>
  );
}

// ─── ProgressBar ───
export function ProgressBar({ value, max = 100, variant = 'accent', size = 'md', animated, showLabel, className }: ProgressBarProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

  const variants = {
    default: 'bg-[var(--text-muted)]',
    accent: 'bg-[var(--accent)]',
    success: 'bg-[var(--success)]',
    danger: 'bg-[var(--danger)]',
  };

  const sizes = {
    sm: 'h-1',
    md: 'h-1.5',
    lg: 'h-2',
  };

  return (
    <div className={cn('w-full', className)} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      {showLabel && (
        <div className="flex justify-between mb-1">
          <span className="text-xs text-[var(--text-muted)]">Progress</span>
          <span className="text-xs font-bold text-[var(--accent)]">{Math.round(percentage)}%</span>
        </div>
      )}
      <div className={cn('w-full rounded-full bg-[var(--bg-wash)] overflow-hidden', sizes[size])}>
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500 ease-out',
            variants[variant],
            animated && 'relative overflow-hidden after:absolute after:inset-0 after:bg-gradient-to-r after:from-transparent after:via-white/20 after:to-transparent after:animate-shimmer'
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

// ─── AnimatedPresence ───
const ANIMATIONS = {
  'fade': { enter: 'animate-fade-in', exit: 'opacity-0' },
  'slide-up': { enter: 'animate-slide-up', exit: 'opacity-0 translate-y-2' },
  'slide-down': { enter: 'animate-slide-down', exit: 'opacity-0 -translate-y-2' },
  'slide-left': { enter: 'animate-slide-in-left', exit: 'opacity-0 -translate-x-3' },
  'slide-right': { enter: 'animate-slide-in-right', exit: 'opacity-0 translate-x-3' },
  'scale': { enter: 'animate-scale-in', exit: 'opacity-0 scale-95' },
  'bounce': { enter: 'animate-bounce-in', exit: 'opacity-0 scale-90' },
} as const;

export function AnimatedPresence({ children, show, animation = 'fade', duration = 200, className }: AnimatedPresenceProps) {
  const [shouldRender, setShouldRender] = useState(show);
  const [isAnimating, setIsAnimating] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (show) {
      setShouldRender(true);
      requestAnimationFrame(() => setIsAnimating(true));
    } else {
      setIsAnimating(false);
      timeoutRef.current = setTimeout(() => setShouldRender(false), duration);
    }
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [show, duration]);

  if (!shouldRender) return null;

  const anim = ANIMATIONS[animation];
  return (
    <div className={cn(
      'transition-all',
      isAnimating ? anim.enter : anim.exit,
      className
    )}
      style={{ transitionDuration: `${duration}ms` }}
    >
      {children}
    </div>
  );
}

// ─── GlassPanel ───
export function GlassPanel({ children, className, ...props }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn(
      'glass-card rounded-2xl',
      'bg-[var(--glass-bg)] backdrop-blur-xl border border-[var(--glass-border)]',
      'shadow-[var(--shadow-xl)]',
      className
    )} {...props}>
      {children}
    </div>
  );
}

// ─── Tooltip ───
export function Tooltip({ children, content, side = 'top', className }: {
  children: ReactNode;
  content: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}) {
  const [show, setShow] = useState(false);

  const positions = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  return (
    <div
      className={cn('relative inline-flex', className)}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div className={cn(
          'absolute z-50 px-2.5 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap pointer-events-none',
          'bg-[var(--text-primary)] text-[var(--bg-surface)] shadow-lg',
          'animate-fade-in',
          positions[side]
        )}
          role="tooltip"
        >
          {content}
        </div>
      )}
    </div>
  );
}

// ─── IconButton ───
export function IconButton({ children, label, variant = 'ghost', size = 'md', active, badge, className, ...props }: {
  children: ReactNode;
  label: string;
  variant?: 'ghost' | 'filled' | 'outlined';
  size?: 'sm' | 'md' | 'lg';
  active?: boolean;
  badge?: number;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const variants = {
    ghost: 'hover:bg-[var(--hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)]',
    filled: 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] shadow-md',
    outlined: 'border border-[var(--border)] hover:border-[var(--accent)] text-[var(--text-secondary)]',
  };

  const sizes = {
    sm: 'w-8 h-8',
    md: 'w-9 h-9',
    lg: 'w-11 h-11',
  };

  return (
    <button
      type="button"
      className={cn(
        'relative inline-flex items-center justify-center rounded-full transition-all duration-150 flex-shrink-0',
        'active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]',
        variants[variant],
        sizes[size],
        active && 'text-[var(--accent)] bg-[var(--accent-subtle)]',
        className
      )}
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
      {badge !== undefined && badge > 0 && (
        <Badge count={badge} size="sm" className="absolute -top-1 -right-1" />
      )}
    </button>
  );
}

// ─── Divider ───
export function Divider({ label, className }: { label?: string; className?: string }) {
  if (label) {
    return (
      <div className={cn('flex items-center gap-3 py-2', className)}>
        <div className="flex-1 h-px bg-[var(--border)]" />
        <span className="text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider">{label}</span>
        <div className="flex-1 h-px bg-[var(--border)]" />
      </div>
    );
  }
  return <div className={cn('h-px bg-[var(--border)]', className)} />;
}

// ─── StatusIndicator (message checks) ───
export function StatusIndicator({ status, className }: { status: MessageStatus; className?: string }) {
  const baseClass = cn('inline-flex items-center flex-shrink-0', className);

  switch (status) {
    case 'pending':
      return (
        <span className={cn(baseClass, 'text-[var(--text-muted)]')}>
          <svg className="w-3.5 h-3.5 animate-pulse-soft" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />
          </svg>
        </span>
      );
    case 'sent':
      return (
        <span className={cn(baseClass, 'text-[var(--text-muted)]')}>
          <Check className="w-3.5 h-3.5" />
        </span>
      );
    case 'delivered':
      return (
        <span className={cn(baseClass, 'text-[var(--text-muted)]')}>
          <svg className="w-4 h-3.5" viewBox="0 0 20 14" fill="none">
            <path d="M1.5 7.5L5.5 11.5L13.5 2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M7.5 7.5L11.5 11.5L19 2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
          </svg>
        </span>
      );
    case 'read':
      return (
        <span className={cn(baseClass, 'text-blue-400')}>
          <svg className="w-4 h-3.5" viewBox="0 0 20 14" fill="none">
            <path d="M1.5 7.5L5.5 11.5L13.5 2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M7.5 7.5L11.5 11.5L19 2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      );
    case 'failed':
      return (
        <span className={cn(baseClass, 'text-[var(--danger)]')}>
          <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 5v4M8 11h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </span>
      );
    default:
      return null;
  }
}

type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

// ─── TypingIndicator ───
export function TypingIndicator({ names, className }: { names?: string[]; className?: string }) {
  const label = names?.length
    ? names.length === 1
      ? `${names[0]} is typing`
      : `${names.slice(0, 2).join(', ')}${names.length > 2 ? ` +${names.length - 2}` : ''} typing`
    : 'typing';

  return (
    <div className={cn('flex items-center gap-2', className)} aria-live="polite" aria-label={label}>
      <div className="flex items-center gap-[3px] bg-[var(--bg-wash)] rounded-2xl rounded-bl-sm px-4 py-3 shadow-[var(--shadow-xs)]">
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </div>
      {names && names.length > 0 && (
        <span className="text-xs text-[var(--text-muted)] italic">{label}</span>
      )}
    </div>
  );
}

// ─── DateSeparator (WhatsApp-style pill) ───
export function DateSeparator({ date, className }: { date: string; className?: string }) {
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);

  let label: string;
  if (days === 0) label = 'Today';
  else if (days === 1) label = 'Yesterday';
  else if (days < 7) label = d.toLocaleDateString([], { weekday: 'long' });
  else label = d.toLocaleDateString([], { month: 'long', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });

  return (
    <div className={cn('flex justify-center my-4', className)}>
      <span className="text-[11px] font-medium text-[var(--text-secondary)] bg-[var(--bg-elevated)] px-3 py-1 rounded-lg shadow-[var(--shadow-xs)] select-none">
        {label}
      </span>
    </div>
  );
}

// ─── EmptyState ───
export function EmptyState({ icon, title, description, action, className }: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center px-8 py-12', className)}>
      <div className="w-16 h-16 rounded-2xl bg-[var(--accent-subtle)] flex items-center justify-center mb-4 text-[var(--accent)]">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-[var(--text-primary)] mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-[var(--text-muted)] max-w-[240px] leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
