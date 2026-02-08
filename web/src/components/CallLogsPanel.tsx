'use client';

import { useEffect } from 'react';
import { useCallHistoryStore, CallLog } from '@/stores/callHistoryStore';
import { useAuthStore } from '@/stores/authStore';
import { useCallStore } from '@/stores/callStore';
import { formatTime, getInitials, cn } from '@/lib/utils';
import {
    Phone, Video, PhoneIncoming, PhoneOutgoing, PhoneMissed,
    Loader2
} from 'lucide-react';

export default function CallLogsPanel() {
    const { callLogs, isLoading, error, fetchCallHistory } = useCallHistoryStore();
    const { user } = useAuthStore();
    const { initiateCall } = useCallStore();

    useEffect(() => {
        fetchCallHistory();
    }, [fetchCallHistory]);

    const handleCallClick = (log: CallLog) => {
        // Find the other participant to call
        const otherParticipant = log.participants.find(p => p.user_id !== user?.id);
        if (otherParticipant) {
            initiateCall(
                otherParticipant.user_id,
                log.call_type,
                otherParticipant.display_name || otherParticipant.username
            );
        }
    };

    const formatDuration = (seconds: number | null) => {
        if (!seconds) return '';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${String(secs).padStart(2, '0')}`;
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="w-6 h-6 animate-spin text-zynk-500" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)] p-4">
                <p className="text-sm">{error}</p>
                <button
                    onClick={() => fetchCallHistory()}
                    className="mt-2 text-xs text-zynk-500 hover:text-zynk-400"
                >
                    Try again
                </button>
            </div>
        );
    }

    if (callLogs.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)]">
                <Phone className="w-12 h-12 mb-3 opacity-30" />
                <p className="text-sm">No calls yet</p>
                <p className="text-xs mt-1">Your call history will appear here</p>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto">
            {callLogs.map((log) => (
                <CallLogItem
                    key={log.call_id}
                    log={log}
                    currentUserId={user?.id || ''}
                    onClick={() => handleCallClick(log)}
                    formatDuration={formatDuration}
                />
            ))}
        </div>
    );
}

function CallLogItem({
    log,
    currentUserId,
    onClick,
    formatDuration,
}: {
    log: CallLog;
    currentUserId: string;
    onClick: () => void;
    formatDuration: (seconds: number | null) => string;
}) {
    const isOutgoing = log.initiator_id === currentUserId;
    const isMissed = log.status === 'missed' || log.status === 'declined';
    const isCompleted = log.status === 'ended';

    // Get the other participant's info
    const otherParticipant = log.participants.find(p => p.user_id !== currentUserId);
    const displayName = otherParticipant?.display_name || otherParticipant?.username || 'Unknown';

    const CallTypeIcon = log.call_type === 'video' ? Video : Phone;

    const StatusIcon = isMissed
        ? PhoneMissed
        : isOutgoing
            ? PhoneOutgoing
            : PhoneIncoming;

    return (
        <button
            onClick={onClick}
            className="w-full flex items-center gap-3 p-3 hover:bg-[var(--bg-tertiary)] transition-colors text-left"
        >
            {/* Avatar */}
            <div className="relative">
                <div className="w-11 h-11 rounded-full bg-zynk-600 flex items-center justify-center text-white text-sm font-medium">
                    {getInitials(displayName)}
                </div>
                {/* Call type badge */}
                <div className={cn(
                    'absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center',
                    isMissed ? 'bg-red-500' : 'bg-[var(--bg-secondary)] border border-[var(--border)]'
                )}>
                    <CallTypeIcon className={cn(
                        'w-3 h-3',
                        isMissed ? 'text-white' : 'text-[var(--text-secondary)]'
                    )} />
                </div>
            </div>

            {/* Call info */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                        {displayName}
                    </span>
                    <span className="text-xs text-[var(--text-muted)] ml-2 whitespace-nowrap">
                        {formatTime(log.created_at)}
                    </span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                    <StatusIcon className={cn(
                        'w-3.5 h-3.5',
                        isMissed ? 'text-red-500' : 'text-[var(--text-muted)]'
                    )} />
                    <span className={cn(
                        'text-xs',
                        isMissed ? 'text-red-500' : 'text-[var(--text-secondary)]'
                    )}>
                        {isMissed
                            ? (log.status === 'declined' ? 'Declined' : 'Missed')
                            : isCompleted
                                ? formatDuration(log.duration_seconds) || 'Ended'
                                : log.status.charAt(0).toUpperCase() + log.status.slice(1).replace('_', ' ')
                        }
                    </span>
                </div>
            </div>

            {/* Call action button */}
            <button
                className="p-2 rounded-full hover:bg-zynk-600/20 text-zynk-500 transition-colors"
                title={`Start ${log.call_type} call`}
            >
                <CallTypeIcon className="w-5 h-5" />
            </button>
        </button>
    );
}
