// ═══════════════════════════════════════════════════════
// ZYNK UI — Loading States (HeroUI v7)
// Skeleton screens for all major views
// ═══════════════════════════════════════════════════════

'use client';

import { cn } from '@/lib/utils';

function SkeletonBox({ className }: { className?: string }) {
  return (
    <div className={cn('bg-content2 rounded-lg animate-pulse', className)} />
  );
}

export function ConversationListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="flex flex-col" role="status" aria-label="Loading conversations">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3" style={{ animationDelay: `${i * 60}ms` }}>
          <SkeletonBox className="w-12 h-12 rounded-full flex-shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center justify-between">
              <SkeletonBox className="h-3.5 w-28 rounded-md" />
              <SkeletonBox className="h-3 w-10 rounded-md" />
            </div>
            <SkeletonBox className="h-3 w-48 rounded-md" />
          </div>
        </div>
      ))}
      <span className="sr-only">Loading conversations...</span>
    </div>
  );
}

export function MessagesSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3 p-4 max-w-chat mx-auto" role="status" aria-label="Loading messages">
      {Array.from({ length: count }).map((_, i) => {
        const isSent = i % 3 !== 0;
        return (
          <div key={i} className={cn('flex', isSent ? 'justify-end' : 'justify-start')}>
            <div
              className={cn(
                'rounded-2xl p-3 space-y-2',
                isSent
                  ? 'bg-primary/20 max-w-[55%] rounded-br-md'
                  : 'bg-content2 max-w-[60%] rounded-bl-md',
              )}
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <SkeletonBox className={cn('h-3', isSent ? 'w-40' : 'w-52')} />
              {i % 2 === 0 && <SkeletonBox className={cn('h-3', isSent ? 'w-28' : 'w-36')} />}
              <div className={cn('flex items-center gap-1.5', isSent ? 'justify-end' : '')}>
                <SkeletonBox className="h-2.5 w-10 rounded" />
              </div>
            </div>
          </div>
        );
      })}
      <span className="sr-only">Loading messages...</span>
    </div>
  );
}

export function ChatHeaderSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3" role="status" aria-label="Loading chat header">
      <SkeletonBox className="w-10 h-10 rounded-full flex-shrink-0" />
      <div className="space-y-2 flex-1">
        <SkeletonBox className="h-3.5 w-32 rounded-md" />
        <SkeletonBox className="h-2.5 w-20 rounded-md" />
      </div>
      <div className="flex gap-2">
        <SkeletonBox className="w-9 h-9 rounded-full" />
        <SkeletonBox className="w-9 h-9 rounded-full" />
      </div>
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="flex flex-col items-center p-6 space-y-4" role="status" aria-label="Loading profile">
      <SkeletonBox className="w-20 h-20 rounded-full" />
      <div className="space-y-2 w-full max-w-[200px]">
        <SkeletonBox className="h-4 w-full rounded-md mx-auto" />
        <SkeletonBox className="h-3 w-3/4 rounded-md mx-auto" />
      </div>
      <div className="w-full space-y-3 mt-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2.5">
            <SkeletonBox className="w-9 h-9 rounded-lg" />
            <div className="flex-1 space-y-1.5">
              <SkeletonBox className="h-3 w-24 rounded-md" />
              <SkeletonBox className="h-2.5 w-40 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FullPageLoader() {
  return (
    <div className="fixed inset-0 bg-background flex items-center justify-center z-50">
      <div className="flex flex-col items-center gap-4 animate-appear">
        <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center animate-pulse">
          <span className="text-white text-lg font-extrabold">Z</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}
