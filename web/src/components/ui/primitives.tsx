'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn, getInitials, getAvatarColor } from '@/lib/utils';
import type { AvatarProps, BadgeProps, ProgressBarProps, AnimatedPresenceProps } from './types';

/* ─── Avatar ─── */
const AVATAR_SIZES = {
  xs: 'w-6 h-6 text-[9px]',
  sm: 'w-8 h-8 text-[11px]',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-lg',
} as const;

const STATUS_SIZES = {
  xs: 'w-2 h-2 border',
  sm: 'w-2.5 h-2.5 border-[1.5px]',
  md: 'w-3 h-3 border-2',
  lg: 'w-3.5 h-3.5 border-2',
  xl: 'w-4 h-4 border-[2.5px]',
} as const;

export function Avatar({ name, src, size = 'md', color, isOnline, showStatus = true, className, onClick }: AvatarProps) {
  const [imgError, setImgError] = useState(false);
  const bgColor = color || getAvatarColor(name);
  const sizeClass = AVATAR_SIZES[size];
  const statusSize = STATUS_SIZES[size];

  return (
    <button
      type="button"
      className={cn('relative flex-shrink-0 group outline-none', onClick ? 'cursor-pointer' : 'cursor-default', className)}
      onClick={onClick}
      aria-label={`${name}'s avatar${isOnline ? ', online' : ''}`}
      tabIndex={onClick ? 0 : -1}
    >
      {src && !imgError ? (
        <img
          src={src}
          alt={name}
          className={cn(sizeClass, 'rounded-full object-cover ring-0 transition-all duration-200', onClick && 'group-hover:ring-2 group-hover:ring-primary/40 group-hover:brightness-105')}
          onError={() => setImgError(true)}
          loading="lazy"
          draggable={false}
        />
      ) : (
        <div
          className={cn(sizeClass, 'rounded-full flex items-center justify-center font-semibold text-white select-none transition-all duration-200', bgColor, onClick && 'group-hover:brightness-110 group-hover:ring-2 group-hover:ring-primary/40')}
        >
          {getInitials(name)}
        </div>
      )}
      {showStatus && isOnline && (
        <span className={cn(statusSize, 'absolute bottom-0 right-0 rounded-full bg-online border-background status-online online-pulse')} aria-label="Online" />
      )}
    </button>
  );
}


/* ─── Badge ─── */
export function Badge({ count, max = 99, variant = 'default', size = 'sm', dot, className }: BadgeProps) {
  if (count <= 0 && !dot) return null;

  const variants = {
    default: 'bg-primary text-white',
    accent: 'bg-primary text-white',
    danger: 'bg-destructive text-white',
    success: 'bg-success text-white',
    warning: 'bg-warning text-white',
  };

  const sizes = {
    sm: dot ? 'w-2.5 h-2.5' : 'min-w-[18px] h-[18px] text-[10px] px-1',
    md: dot ? 'w-3 h-3' : 'min-w-[22px] h-[22px] text-xs px-1.5',
  };

  if (dot) {
    return <span className={cn('rounded-full', variants[variant], sizes[size], className)} />;
  }

  return (
    <span className={cn('rounded-full font-bold flex items-center justify-center flex-shrink-0 leading-none', variants[variant], sizes[size], className)} aria-label={`${count} unread`}>
      {count > max ? `${max}+` : count}
    </span>
  );
}


/* ─── ProgressBar ─── */
export function ProgressBar({ value, max = 100, variant = 'accent', size = 'md', animated, showLabel, className }: ProgressBarProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

  const variants = {
    default: 'bg-muted-foreground',
    accent: 'bg-primary',
    success: 'bg-success',
    danger: 'bg-destructive',
  };

  const sizes = { sm: 'h-1', md: 'h-1.5', lg: 'h-2' };

  return (
    <div className={cn('w-full', className)} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      {showLabel && (
        <div className="flex justify-between mb-1.5">
          <span className="text-xs text-muted-foreground">Progress</span>
          <span className="text-xs font-bold text-primary">{Math.round(percentage)}%</span>
        </div>
      )}
      <div className={cn('w-full rounded-full bg-secondary overflow-hidden', sizes[size])}>
        <div
          className={cn('h-full rounded-full transition-all duration-500 ease-out', variants[variant], animated && 'relative overflow-hidden after:absolute after:inset-0 after:bg-gradient-to-r after:from-transparent after:via-white/20 after:to-transparent after:animate-shimmer')}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}


/* ─── AnimatedPresence ─── */
const ANIMATIONS = {
  'fade': { enter: 'animate-appear', exit: 'opacity-0' },
  'slide-up': { enter: 'animate-appear', exit: 'opacity-0 translate-y-2' },
  'slide-down': { enter: 'animate-appear', exit: 'opacity-0 -translate-y-2' },
  'slide-left': { enter: 'animate-appear', exit: 'opacity-0 -translate-x-3' },
  'slide-right': { enter: 'animate-appear', exit: 'opacity-0 translate-x-3' },
  'scale': { enter: 'animate-appear', exit: 'opacity-0 scale-95' },
  'bounce': { enter: 'animate-appear', exit: 'opacity-0 scale-90' },
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
    <div className={cn('transition-all', isAnimating ? anim.enter : anim.exit, className)} style={{ transitionDuration: `${duration}ms` }}>
      {children}
    </div>
  );
}


/* ─── GlassPanel ─── */
export function GlassPanel({ children, className, ...props }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('glass-panel rounded-xl p-4', className)} {...props}>
      {children}
    </div>
  );
}


/* ─── Skeleton ─── */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('rounded-lg bg-secondary animate-pulse', className)} />;
}


/* ─── Divider ─── */
export function Divider({ label, className }: { label?: string; className?: string }) {
  if (label) {
    return (
      <div className={cn('flex items-center gap-3 my-2', className)}>
        <div className="flex-1 h-px bg-border" />
        <span className="text-2xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
        <div className="flex-1 h-px bg-border" />
      </div>
    );
  }
  return <div className={cn('h-px bg-border my-2', className)} />;
}


/* ─── Tooltip ─── */
export function Tooltip({ children, label, position = 'top' }: { children: ReactNode; label: string; position?: 'top' | 'bottom' | 'left' | 'right' }) {
  const positions = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  return (
    <div className="relative group/tooltip inline-flex">
      {children}
      <div
        className={cn(
          'absolute z-50 px-2.5 py-1.5 text-xs font-medium text-white bg-popover rounded-lg',
          'opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible',
          'transition-all duration-150 pointer-events-none whitespace-nowrap',
          'shadow-lg border border-border',
          positions[position],
        )}
        role="tooltip"
      >
        {label}
      </div>
    </div>
  );
}


/* ─── EmptyState ─── */
export function EmptyState({ icon, title, description, action }: {
  icon: ReactNode; title: string; description?: string; action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center animate-appear">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-5 text-primary">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
      {description && <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
