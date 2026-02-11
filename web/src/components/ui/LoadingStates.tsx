// ═══════════════════════════════════════════════════════
// ZYNK — LoadingStates Library
// Complete skeleton loading states for all component types
// ═══════════════════════════════════════════════════════

'use client';

import { cn } from '@/lib/utils';

// ─── Base Skeleton ───
function Skeleton({ className, animate = true }: { className?: string; animate?: boolean }) {
  return (
    <div className={cn(
      'bg-[var(--bg-wash)] rounded-lg',
      animate && 'animate-pulse',
      className
    )} />
  );
}

// ─── Shimmer Skeleton (premium feel) ───
function ShimmerSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn(
      'relative overflow-hidden bg-[var(--bg-wash)] rounded-lg',
      className
    )}>
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[var(--hover)] to-transparent animate-shimmer" 
        style={{ backgroundSize: '200% 100%' }}
      />
    </div>
  );
}

// ─── Conversation Skeleton ───
export function SkeletonConversation({ shimmer = false }: { shimmer?: boolean }) {
  const Sk = shimmer ? ShimmerSkeleton : Skeleton;
  return (
    <div className="flex items-center gap-3 px-4 py-3" role="status" aria-label="Loading conversation">
      <Sk className="w-12 h-12 !rounded-full flex-shrink-0" />
      <div className="flex-1 min-w-0 space-y-2.5 border-b border-[var(--border-subtle)] pb-3">
        <div className="flex items-center justify-between gap-4">
          <Sk className="h-3.5 w-28" />
          <Sk className="h-2.5 w-10" />
        </div>
        <Sk className="h-3 w-44" />
      </div>
    </div>
  );
}

export function SkeletonConversationList({ count = 8, shimmer = false }: { count?: number; shimmer?: boolean }) {
  return (
    <div role="status" aria-label="Loading conversations" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonConversation key={i} shimmer={shimmer} />
      ))}
      <span className="sr-only">Loading conversations...</span>
    </div>
  );
}

// ─── Message Skeleton ───
export function SkeletonMessage({ isOwn = false, variant = 'text' }: { 
  isOwn?: boolean; 
  variant?: 'text' | 'image' | 'file' | 'audio';
}) {
  const Sk = Skeleton;

  if (variant === 'image') {
    return (
      <div className={cn('flex', isOwn ? 'justify-end' : 'justify-start', 'mt-2')}>
        <div className={cn(
          'rounded-2xl overflow-hidden',
          isOwn ? 'rounded-br-sm' : 'rounded-bl-sm',
        )}>
          <Sk className="w-[220px] h-[160px] !rounded-2xl" />
        </div>
      </div>
    );
  }

  if (variant === 'audio') {
    return (
      <div className={cn('flex', isOwn ? 'justify-end' : 'justify-start', 'mt-2')}>
        <div className={cn(
          'rounded-2xl px-4 py-3 w-[280px]',
          isOwn ? 'rounded-br-sm bg-[var(--accent-subtle)]' : 'rounded-bl-sm bg-[var(--bg-wash)]',
        )}>
          <div className="flex items-center gap-3">
            <Sk className="w-10 h-10 !rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="flex items-end gap-[2px] h-6">
                {Array.from({ length: 20 }).map((_, i) => (
                  <Sk key={i} className="w-[3px] !rounded-full" style={{ height: `${8 + Math.random() * 16}px` }} />
                ))}
              </div>
              <Sk className="h-2 w-8" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'file') {
    return (
      <div className={cn('flex', isOwn ? 'justify-end' : 'justify-start', 'mt-2')}>
        <div className={cn(
          'rounded-2xl px-3 py-2.5 w-[280px]',
          isOwn ? 'rounded-br-sm bg-[var(--accent-subtle)]' : 'rounded-bl-sm bg-[var(--bg-wash)]',
        )}>
          <div className="flex items-center gap-3 p-2.5 rounded-xl bg-[var(--bg-wash)]">
            <Sk className="w-11 h-11 !rounded-xl flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Sk className="h-3.5 w-32" />
              <Sk className="h-2.5 w-20" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex', isOwn ? 'justify-end' : 'justify-start', 'mt-2')}>
      <div className={cn(
        'rounded-2xl px-4 py-3',
        isOwn ? 'rounded-br-sm bg-[var(--accent-subtle)]' : 'rounded-bl-sm bg-[var(--bg-wash)]',
        isOwn ? 'max-w-[50%]' : 'max-w-[60%]'
      )}>
        {!isOwn && <Sk className="h-2.5 w-16 mb-2" />}
        <div className="space-y-1.5">
          <Sk className={cn('h-3', isOwn ? '' : '', 'w-48')} />
          <Sk className={cn('h-3', 'w-32')} />
        </div>
        <div className="flex justify-end mt-1.5">
          <Sk className="h-2 w-12" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonMessageList({ count = 6 }: { count?: number }) {
  const variants: Array<{ isOwn: boolean; variant: 'text' | 'image' | 'file' | 'audio' }> = [
    { isOwn: false, variant: 'text' },
    { isOwn: false, variant: 'text' },
    { isOwn: true, variant: 'text' },
    { isOwn: false, variant: 'image' },
    { isOwn: true, variant: 'text' },
    { isOwn: true, variant: 'audio' },
    { isOwn: false, variant: 'text' },
    { isOwn: false, variant: 'file' },
  ];

  return (
    <div className="space-y-1 px-4 lg:px-16 py-4" role="status" aria-label="Loading messages" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => {
        const v = variants[i % variants.length];
        return <SkeletonMessage key={i} isOwn={v.isOwn} variant={v.variant} />;
      })}
      <span className="sr-only">Loading messages...</span>
    </div>
  );
}

// ─── Profile Skeleton ───
export function SkeletonProfile() {
  return (
    <div className="p-6" role="status" aria-label="Loading profile" aria-busy="true">
      <Skeleton className="w-20 h-20 !rounded-full mx-auto mb-4" />
      <Skeleton className="h-5 w-32 mx-auto mb-2" />
      <Skeleton className="h-3 w-20 mx-auto mb-2" />
      <Skeleton className="h-3 w-48 mx-auto" />
      <div className="mt-6 space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="w-8 h-8 !rounded-lg flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-2.5 w-36" />
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">Loading profile...</span>
    </div>
  );
}

// ─── Media Grid Skeleton ───
export function SkeletonMediaGrid({ count = 9 }: { count?: number }) {
  return (
    <div className="grid grid-cols-3 gap-1 p-2" role="status" aria-label="Loading media" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="aspect-square !rounded-md" />
      ))}
      <span className="sr-only">Loading media...</span>
    </div>
  );
}

// ─── Contact Card Skeleton ───
export function SkeletonContact() {
  return (
    <div className="flex items-center gap-3 px-4 py-3" role="status" aria-label="Loading contact">
      <Skeleton className="w-10 h-10 !rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-28" />
        <Skeleton className="h-2.5 w-40" />
      </div>
    </div>
  );
}

export function SkeletonContactList({ count = 6 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading contacts" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonContact key={i} />
      ))}
      <span className="sr-only">Loading contacts...</span>
    </div>
  );
}

// ─── Call Log Skeleton ───
export function SkeletonCallLog() {
  return (
    <div className="flex items-center gap-3 px-4 py-3" role="status" aria-label="Loading call log">
      <Skeleton className="w-10 h-10 !rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-24" />
        <div className="flex items-center gap-2">
          <Skeleton className="w-3 h-3 !rounded-sm" />
          <Skeleton className="h-2.5 w-20" />
        </div>
      </div>
      <Skeleton className="w-8 h-8 !rounded-full flex-shrink-0" />
    </div>
  );
}

export function SkeletonCallLogList({ count = 5 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading call history" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCallLog key={i} />
      ))}
      <span className="sr-only">Loading call history...</span>
    </div>
  );
}

// ─── Settings Skeleton ───
export function SkeletonSettings() {
  return (
    <div className="p-4 space-y-4" role="status" aria-label="Loading settings" aria-busy="true">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-2">
          <Skeleton className="w-8 h-8 !rounded-lg flex-shrink-0" />
          <div className="flex-1 space-y-1">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-2.5 w-40" />
          </div>
          <Skeleton className="w-10 h-5 !rounded-full flex-shrink-0" />
        </div>
      ))}
      <span className="sr-only">Loading settings...</span>
    </div>
  );
}

// ─── Inline Skeleton (for within components) ───
export function SkeletonInline({ width = 'w-20', height = 'h-3' }: { width?: string; height?: string }) {
  return <Skeleton className={cn(width, height, 'inline-block')} />;
}

// ─── Full page loader ───
export function SkeletonFullPage() {
  return (
    <div className="h-screen flex" role="status" aria-label="Loading application" aria-busy="true">
      {/* Sidebar skeleton */}
      <div className="w-[380px] border-r border-[var(--border)] bg-[var(--sidebar-bg)] hidden lg:flex flex-col">
        <div className="h-14 px-4 flex items-center justify-between border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            <Skeleton className="w-10 h-10 !rounded-full" />
            <Skeleton className="h-5 w-16" />
          </div>
          <div className="flex items-center gap-1">
            <Skeleton className="w-9 h-9 !rounded-full" />
            <Skeleton className="w-9 h-9 !rounded-full" />
          </div>
        </div>
        <div className="px-3 py-2">
          <Skeleton className="h-9 w-full !rounded-lg" />
        </div>
        <div className="flex border-b border-[var(--border)] px-3 py-2 gap-2">
          <Skeleton className="h-8 w-full !rounded-full" />
          <Skeleton className="h-8 w-full !rounded-full" />
          <Skeleton className="h-8 w-full !rounded-full" />
        </div>
        <SkeletonConversationList />
      </div>

      {/* Chat area skeleton */}
      <div className="flex-1 flex flex-col bg-[var(--bg-app)]">
        <div className="h-14 px-4 flex items-center gap-3 border-b border-[var(--border)] bg-[var(--header-bg)]">
          <Skeleton className="w-10 h-10 !rounded-full" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-2.5 w-16" />
          </div>
        </div>
        <div className="flex-1">
          <SkeletonMessageList />
        </div>
        <div className="px-3 py-3 bg-[var(--header-bg)]">
          <div className="flex items-center gap-2">
            <Skeleton className="w-9 h-9 !rounded-full" />
            <Skeleton className="w-9 h-9 !rounded-full" />
            <Skeleton className="flex-1 h-10 !rounded-2xl" />
            <Skeleton className="w-10 h-10 !rounded-full" />
          </div>
        </div>
      </div>
      <span className="sr-only">Loading application...</span>
    </div>
  );
}
