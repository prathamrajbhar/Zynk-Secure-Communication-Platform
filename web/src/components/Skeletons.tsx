'use client';

import { cn } from '@/lib/utils';

export function SkeletonConversation() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 animate-pulse">
      <div className="w-11 h-11 rounded-full bg-[var(--bg-wash)] flex-shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center justify-between gap-4">
          <div className="h-3.5 bg-[var(--bg-wash)] rounded-full w-28" />
          <div className="h-2.5 bg-[var(--bg-wash)] rounded-full w-10" />
        </div>
        <div className="h-3 bg-[var(--bg-wash)] rounded-full w-44" />
      </div>
    </div>
  );
}

export function SkeletonConversationList({ count = 8 }: { count?: number }) {
  return (
    <div>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonConversation key={i} />
      ))}
    </div>
  );
}

export function SkeletonMessage({ isOwn = false }: { isOwn?: boolean }) {
  return (
    <div className={cn('flex animate-pulse', isOwn ? 'justify-end' : 'justify-start', 'mt-2')}>
      <div className={cn(
        'rounded-2xl px-4 py-3',
        isOwn ? 'rounded-br-sm bg-[var(--accent-subtle)]' : 'rounded-bl-sm bg-[var(--bg-wash)]',
        isOwn ? 'max-w-[50%]' : 'max-w-[60%]'
      )}>
        {!isOwn && <div className="h-2.5 bg-[var(--bg-wash)] rounded-full w-16 mb-2" />}
        <div className="space-y-1.5">
          <div className={cn('h-3 rounded-full', isOwn ? 'bg-[var(--accent-muted)]' : 'bg-[var(--bg-wash)]', 'w-48')} />
          <div className={cn('h-3 rounded-full', isOwn ? 'bg-[var(--accent-muted)]' : 'bg-[var(--bg-wash)]', 'w-32')} />
        </div>
        <div className="flex justify-end mt-1.5">
          <div className={cn('h-2 rounded-full', isOwn ? 'bg-[var(--accent-muted)]' : 'bg-[var(--bg-wash)]', 'w-12')} />
        </div>
      </div>
    </div>
  );
}

export function SkeletonMessageList({ count = 6 }: { count?: number }) {
  return (
    <div className="space-y-1 px-4 lg:px-16 py-4">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonMessage key={i} isOwn={i % 3 === 0} />
      ))}
    </div>
  );
}

export function SkeletonProfile() {
  return (
    <div className="p-6 animate-pulse">
      <div className="w-20 h-20 rounded-full bg-[var(--bg-wash)] mx-auto mb-4" />
      <div className="h-5 bg-[var(--bg-wash)] rounded-full w-32 mx-auto mb-2" />
      <div className="h-3 bg-[var(--bg-wash)] rounded-full w-20 mx-auto mb-2" />
      <div className="h-3 bg-[var(--bg-wash)] rounded-full w-48 mx-auto" />
    </div>
  );
}
