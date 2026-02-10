'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  Pin, BellOff, Bell, Archive, Trash2, CheckCircle, Circle,
  Eraser, ChevronRight, Clock,
} from 'lucide-react';

interface ChatContextMenuProps {
  x: number;
  y: number;
  isPinned: boolean;
  isMuted: boolean;
  isArchived: boolean;
  unreadCount: number;
  onClose: () => void;
  onPin: () => void;
  onMute: () => void;
  onMuteDuration?: (duration: string) => void;
  onArchive: () => void;
  onMarkReadUnread: () => void;
  onDeleteChat: () => void;
  onClearHistory: () => void;
}

export default function ChatContextMenu({
  x, y, isPinned, isMuted, isArchived, unreadCount,
  onClose, onPin, onMute, onMuteDuration, onArchive, onMarkReadUnread, onDeleteChat, onClearHistory,
}: ChatContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [showMuteSub, setShowMuteSub] = useState(false);

  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (rect.right > vw) {
      menuRef.current.style.left = `${x - rect.width}px`;
    }
    if (rect.bottom > vh) {
      menuRef.current.style.top = `${y - rect.height}px`;
    }
  }, [x, y]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  const isUnread = unreadCount > 0;

  const muteDurations = [
    { label: '1 hour', value: '1h' },
    { label: '8 hours', value: '8h' },
    { label: '1 day', value: '1d' },
    { label: '1 week', value: '1w' },
    { label: 'Forever', value: 'forever' },
  ];

  const menuItems = [
    { icon: Pin, label: isPinned ? 'Unpin chat' : 'Pin chat', action: onPin, accent: isPinned ? 'text-[var(--accent)]' : undefined },
    { icon: isMuted ? Bell : BellOff, label: isMuted ? 'Unmute' : 'Mute', action: isMuted ? onMute : undefined, hasSub: !isMuted && !!onMuteDuration },
    { icon: Archive, label: isArchived ? 'Unarchive' : 'Archive', action: onArchive },
    { icon: isUnread ? CheckCircle : Circle, label: isUnread ? 'Mark as read' : 'Mark as unread', action: onMarkReadUnread, dividerBefore: true },
    { icon: Eraser, label: 'Clear history', action: onClearHistory, dividerBefore: true },
    { icon: Trash2, label: 'Delete chat', action: onDeleteChat, danger: true },
  ];

  return (
    <>
      <div className="fixed inset-0 z-[51]" />
      <div
        ref={menuRef}
        className="fixed z-[52] bg-[var(--bg-elevated)] border border-[var(--border)] rounded-2xl shadow-overlay py-1.5 min-w-[200px] animate-scale-in backdrop-blur-xl"
        style={{ top: y, left: x }}
      >
        {menuItems.map((item) => (
          <div key={item.label} className="relative">
            {item.dividerBefore && <div className="my-1 mx-3 h-px bg-[var(--separator)]" />}
            <button
              onClick={() => {
                if (item.hasSub) {
                  setShowMuteSub(!showMuteSub);
                  return;
                }
                item.action?.();
                onClose();
              }}
              onMouseEnter={() => { if (item.hasSub) setShowMuteSub(true); }}
              className={cn(
                'w-full flex items-center gap-3 px-3.5 py-2.5 text-[13px] font-medium transition-colors',
                item.danger
                  ? 'text-[var(--danger)] hover:bg-red-500/5'
                  : 'text-[var(--text-primary)] hover:bg-[var(--hover)]'
              )}
            >
              <item.icon className={cn('w-4 h-4', item.danger ? '' : item.accent || 'text-[var(--text-muted)]')} />
              {item.label}
              {item.hasSub && <ChevronRight className="w-3.5 h-3.5 ml-auto text-[var(--text-muted)]" />}
            </button>

            {/* Mute duration submenu */}
            {item.hasSub && showMuteSub && (
              <div className="absolute left-full top-0 ml-1 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl shadow-overlay py-1.5 min-w-[160px] animate-scale-in z-[53]"
                onMouseLeave={() => setShowMuteSub(false)}>
                {muteDurations.map(d => (
                  <button key={d.value}
                    onClick={() => { onMuteDuration?.(d.value); onClose(); }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[13px] font-medium text-[var(--text-primary)] hover:bg-[var(--hover)] transition-colors">
                    <Clock className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                    {d.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
