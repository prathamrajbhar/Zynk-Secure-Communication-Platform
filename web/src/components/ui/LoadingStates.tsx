'use client';

import { cn } from '@/lib/utils';
import { Skeleton } from './primitives';

/* ─── Conversation List Skeleton ─── */
export function ConversationListSkeleton() {
  return (
    <div className="flex flex-col gap-1.5 p-3" role="status" aria-label="Loading conversations">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-xl" style={{ animationDelay: `${i * 60}ms` }}>
          <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex justify-between items-center">
              <Skeleton className="h-3.5 w-24 rounded-md" />
              <Skeleton className="h-2.5 w-10 rounded-md" />
            </div>
            <Skeleton className="h-3 w-36 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}


/* ─── Messages Skeleton ─── */
export function MessagesSkeleton() {
  const patterns = [
    { align: 'justify-start', w: 'w-48' },
    { align: 'justify-start', w: 'w-64' },
    { align: 'justify-end', w: 'w-52' },
    { align: 'justify-start', w: 'w-40' },
    { align: 'justify-end', w: 'w-60' },
    { align: 'justify-start', w: 'w-56' },
    { align: 'justify-end', w: 'w-44' },
  ];

  return (
    <div className="flex flex-col gap-4 p-6" role="status" aria-label="Loading messages">
      {patterns.map((p, i) => (
        <div key={i} className={cn('flex gap-3', p.align)} style={{ animationDelay: `${i * 80}ms` }}>
          {p.align === 'justify-start' && <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />}
          <div className={cn('space-y-2', p.align === 'justify-end' && 'items-end')}>
            <Skeleton className={cn('h-12 rounded-2xl', p.w)} />
            <Skeleton className="h-2 w-12 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}


/* ─── Chat Header Skeleton ─── */
export function ChatHeaderSkeleton() {
  return (
    <div className="flex items-center gap-3 px-5 py-4 border-b border-border" role="status" aria-label="Loading header">
      <Skeleton className="w-10 h-10 rounded-full" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-28 rounded-md" />
        <Skeleton className="h-2.5 w-16 rounded-md" />
      </div>
    </div>
  );
}


/* ─── Profile Skeleton ─── */
export function ProfileSkeleton() {
  return (
    <div className="flex flex-col items-center gap-4 p-6" role="status" aria-label="Loading profile">
      <Skeleton className="w-20 h-20 rounded-full" />
      <Skeleton className="h-5 w-32 rounded-md" />
      <Skeleton className="h-3.5 w-24 rounded-md" />
      <div className="w-full space-y-3 mt-4">
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-10 w-full rounded-xl" />
      </div>
    </div>
  );
}


/* ─── Full Page Loader ─── */
export function FullPageLoader({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="fixed inset-0 bg-background flex items-center justify-center z-50">
      <div className="flex flex-col items-center gap-5 animate-appear">
        {/* Animated logo / spinner */}
        <div className="relative w-14 h-14">
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary to-primary/60 animate-pulse" />
          <div className="absolute inset-0 flex items-center justify-center">
            <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
        <div className="text-center space-y-1.5">
          <h3 className="text-lg font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">Zynk</h3>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
        {/* Loading bar */}
        <div className="w-48 h-1 rounded-full bg-secondary overflow-hidden">
          <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: '60%' }} />
        </div>
      </div>
    </div>
  );
}
