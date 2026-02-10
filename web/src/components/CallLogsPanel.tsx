'use client';

import { useEffect } from 'react';
import { useCallHistoryStore, CallLog } from '@/stores/callHistoryStore';
import { useAuthStore } from '@/stores/authStore';
import { useCallStore } from '@/stores/callStore';
import { formatTime, getInitials, cn, getAvatarColor } from '@/lib/utils';
import { Phone, Video, PhoneIncoming, PhoneOutgoing, PhoneMissed, Loader2 } from 'lucide-react';

export default function CallLogsPanel() {
  const { callLogs, isLoading, error, fetchCallHistory } = useCallHistoryStore();
  const { user } = useAuthStore();
  const { initiateCall } = useCallStore();

  useEffect(() => { fetchCallHistory(); }, [fetchCallHistory]);

  const handleCallClick = (log: CallLog) => {
    const other = log.participants.find(p => p.user_id !== user?.id);
    if (other) initiateCall(other.user_id, log.call_type, other.display_name || other.username);
  };

  const formatDuration = (s: number | null) => {
    if (!s) return '';
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  if (isLoading) return <div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" /></div>;

  if (error) return (
    <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)] p-4">
      <p className="text-sm font-medium text-[var(--text-secondary)]">{error}</p>
      <button onClick={() => fetchCallHistory()} className="mt-3 text-xs text-[var(--accent)] font-bold hover:underline underline-offset-2">Try again</button>
    </div>
  );

  if (callLogs.length === 0) return (
    <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)] p-8">
      <div className="w-16 h-16 rounded-2xl bg-[var(--bg-wash)] flex items-center justify-center mb-4">
        <Phone className="w-7 h-7 opacity-40" />
      </div>
      <p className="text-sm font-semibold text-[var(--text-secondary)]">No calls yet</p>
      <p className="text-xs mt-1.5">Your call history will appear here</p>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto scroll-thin">
      {callLogs.map(log => {
        const isOutgoing = log.initiator_id === user?.id;
        const isMissed = log.status === 'missed' || log.status === 'declined';
        const isCompleted = log.status === 'ended';
        const other = log.participants.find(p => p.user_id !== user?.id);
        const name = other?.display_name || other?.username || 'Unknown';
        const CallTypeIcon = log.call_type === 'video' ? Video : Phone;
        const StatusIcon = isMissed ? PhoneMissed : isOutgoing ? PhoneOutgoing : PhoneIncoming;

        return (
          <div key={log.call_id} className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--hover)] transition-all duration-200 cursor-pointer group" onClick={() => handleCallClick(log)}>
            <div className={cn('w-11 h-11 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 shadow-sm transition-transform duration-200 group-hover:scale-105', getAvatarColor(name))}>
              {getInitials(name)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className={cn('text-sm font-semibold truncate', isMissed ? 'text-[var(--danger)]' : 'text-[var(--text-primary)]')}>{name}</span>
                <span className="text-[11px] text-[var(--text-muted)] flex-shrink-0 font-medium">{formatTime(log.created_at)}</span>
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <StatusIcon className={cn('w-3.5 h-3.5', isMissed ? 'text-[var(--danger)]' : 'text-[var(--text-muted)]')} />
                <span className={cn('text-xs font-medium', isMissed ? 'text-[var(--danger)]' : 'text-[var(--text-muted)]')}>
                  {isMissed ? (log.status === 'declined' ? 'Declined' : 'Missed') : isCompleted ? formatDuration(log.duration_seconds) || 'Ended' : log.status}
                </span>
              </div>
            </div>
            <button className="btn-icon text-[var(--accent)] flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <CallTypeIcon className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
