'use client';

import { Message } from '@/stores/chatStore';
import { cn } from '@/lib/utils';
import { X, Check, CheckCheck, Clock } from 'lucide-react';

interface MessageInfoModalProps {
  isOpen: boolean;
  message: Message;
  onClose: () => void;
}

export default function MessageInfoModal({ isOpen, message, onClose }: MessageInfoModalProps) {
  if (!isOpen) return null;

  const statusInfo = {
    pending: { label: 'Sending...', icon: Clock, color: 'text-[var(--text-muted)]' },
    sent: { label: 'Sent', icon: Check, color: 'text-[var(--text-muted)]' },
    delivered: { label: 'Delivered', icon: CheckCheck, color: 'text-[var(--text-muted)]' },
    read: { label: 'Read', icon: CheckCheck, color: 'text-blue-400' },
    failed: { label: 'Failed', icon: X, color: 'text-[var(--danger)]' },
  };

  const status = statusInfo[message.status] || statusInfo.sent;
  const StatusIcon = status.icon;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 animate-fade-in" onClick={onClose}>
      <div className="bg-[var(--bg-surface)] rounded-xl w-full max-w-sm shadow-overlay border border-[var(--border)] animate-scale-in overflow-hidden"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
          <h3 className="text-base font-bold text-[var(--text-primary)]">Message info</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-[var(--hover)] transition-colors">
            <X className="w-5 h-5 text-[var(--text-muted)]" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Message preview */}
          <div className="bg-[var(--bg-wash)] rounded-xl p-3">
            <p className="text-sm text-[var(--text-primary)] line-clamp-3">
              {message.content || message.encrypted_content || 'Encrypted message'}
            </p>
          </div>

          {/* Status details */}
          <div className="space-y-3">
            <InfoRow label="Status" value={
              <span className={cn('flex items-center gap-1.5', status.color)}>
                <StatusIcon className="w-4 h-4" />
                {status.label}
              </span>
            } />
            <InfoRow label="Sent" value={formatDetailedTime(message.created_at)} />
            {message.edited_at && (
              <InfoRow label="Edited" value={formatDetailedTime(message.edited_at)} />
            )}
            <InfoRow label="Type" value={
              <span className="capitalize">{message.message_type}</span>
            } />
            {message.sender_username && (
              <InfoRow label="From" value={message.sender_display_name || message.sender_username} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-[var(--text-muted)] font-medium">{label}</span>
      <span className="text-sm text-[var(--text-primary)] font-medium">{value}</span>
    </div>
  );
}

function formatDetailedTime(date: string): string {
  const d = new Date(date);
  return d.toLocaleString([], {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}
