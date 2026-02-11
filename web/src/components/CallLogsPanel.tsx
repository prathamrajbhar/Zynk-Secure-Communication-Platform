'use client';

/**
 * CallLogsPanel — Call history list with direction icons, duration, timestamps.
 */

import { useEffect, useCallback } from 'react';
import { useCallHistoryStore, CallHistoryEntry } from '@/stores/callHistoryStore';
import { useCallStore } from '@/stores/callStore';
import { getInitials, getAvatarColor, cn } from '@/lib/utils';
import {
  Phone, PhoneMissed, Video,
  ArrowDownLeft, ArrowUpRight, Loader2,
} from 'lucide-react';

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const dayMs = 86400000;

  if (diff < dayMs && now.getDate() === d.getDate()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (diff < 2 * dayMs) return 'Yesterday';
  if (diff < 7 * dayMs) {
    return d.toLocaleDateString([], { weekday: 'short' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function CallLogItem({ entry, onCall }: { entry: CallHistoryEntry; onCall: (userId: string, userName: string, type: 'audio' | 'video') => void }) {
  const otherUser = entry.other_user;
  const name = otherUser?.display_name || otherUser?.username || 'Unknown';
  const color = getAvatarColor(name);
  const isMissed = entry.status === 'missed' || entry.status === 'declined';
  const isOutgoing = entry.direction === 'outgoing';
  const isVideo = entry.call_type === 'video';

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-hover)] transition-colors cursor-pointer group">
      {/* Avatar */}
      <div className={cn(
        'w-11 h-11 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0',
        color
      )}>
        {getInitials(name)}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={cn(
            'font-semibold text-sm truncate',
            isMissed ? 'text-red-400' : 'text-[var(--text-primary)]'
          )}>
            {name}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          {/* Direction icon */}
          {isMissed ? (
            <PhoneMissed className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
          ) : isOutgoing ? (
            <ArrowUpRight className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
          ) : (
            <ArrowDownLeft className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
          )}
          <span className="text-xs text-[var(--text-muted)]">
            {isVideo ? 'Video' : 'Voice'}
            {entry.duration_seconds ? ` · ${formatDuration(entry.duration_seconds)}` : ''}
          </span>
        </div>
      </div>

      {/* Time & callback */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-xs text-[var(--text-muted)]">
          {formatTimestamp(entry.created_at)}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (otherUser?.id) onCall(otherUser.id, name, isVideo ? 'video' : 'audio');
          }}
          className="opacity-0 group-hover:opacity-100 w-8 h-8 rounded-full hover:bg-[var(--accent)]/10 flex items-center justify-center text-[var(--accent)] transition-all"
          title={`Call ${name}`}
        >
          {isVideo ? <Video className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

export default function CallLogsPanel() {
  const { calls, isLoading, hasMore, fetchCalls, fetchMoreCalls } = useCallHistoryStore();
  const { initiateCall } = useCallStore();

  useEffect(() => {
    fetchCalls();
  }, [fetchCalls]);

  const handleCall = useCallback((userId: string, userName: string, type: 'audio' | 'video') => {
    // We need the conversationId — look it up from chat store
    const chatStore = (window as any).__chatStore || null;
    // For call logs, we initiate by userId; the server side handles finding/creating conversation
    initiateCall(userId, userName, undefined, '', type);
  }, [initiateCall]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 100 && hasMore && !isLoading) {
      fetchMoreCalls();
    }
  }, [hasMore, isLoading, fetchMoreCalls]);

  if (isLoading && calls.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)]">
        <Loader2 className="w-6 h-6 animate-spin mb-2" />
        <span className="text-sm">Loading call history...</span>
      </div>
    );
  }

  if (calls.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)] p-8">
        <Phone className="w-10 h-10 mb-3 opacity-30" />
        <p className="text-sm font-semibold text-[var(--text-secondary)]">No recent calls</p>
        <p className="text-xs mt-1.5 text-center">Start a voice or video call from any chat</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-[var(--border)]">
        <h2 className="text-base font-bold text-[var(--text-primary)]">Calls</h2>
      </div>
      <div className="flex-1 overflow-y-auto" onScroll={handleScroll}>
        {calls.map((entry) => (
          <CallLogItem key={entry.id} entry={entry} onCall={handleCall} />
        ))}
        {isLoading && (
          <div className="flex justify-center py-3">
            <Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" />
          </div>
        )}
      </div>
    </div>
  );
}
