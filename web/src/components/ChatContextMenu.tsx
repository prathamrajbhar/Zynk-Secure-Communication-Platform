'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import {
  Pin, BellOff, Bell, Archive, Trash2, CheckCircle, Circle,
  Eraser, Volume2, VolumeX,
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
  onArchive: () => void;
  onMarkReadUnread: () => void;
  onDeleteChat: () => void;
  onClearHistory: () => void;
}

export default function ChatContextMenu({
  x, y, isPinned, isMuted, isArchived, unreadCount,
  onClose, onPin, onMute, onArchive, onMarkReadUnread, onDeleteChat, onClearHistory,
}: ChatContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

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

  const menuItems = [
    { icon: Pin, label: isPinned ? 'Unpin chat' : 'Pin chat', action: onPin, accent: isPinned ? 'text-[var(--accent)]' : undefined },
    { icon: isMuted ? Bell : BellOff, label: isMuted ? 'Unmute' : 'Mute', action: onMute },
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
          <div key={item.label}>
            {item.dividerBefore && <div className="my-1 mx-3 h-px bg-[var(--separator)]" />}
            <button
              onClick={() => { item.action(); onClose(); }}
              className={cn(
                'w-full flex items-center gap-3 px-3.5 py-2.5 text-[13px] font-medium transition-colors',
                item.danger
                  ? 'text-[var(--danger)] hover:bg-red-500/5'
                  : 'text-[var(--text-primary)] hover:bg-[var(--hover)]'
              )}
            >
              <item.icon className={cn('w-4 h-4', item.danger ? '' : item.accent || 'text-[var(--text-muted)]')} />
              {item.label}
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
