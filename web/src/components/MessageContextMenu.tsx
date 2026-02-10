'use client';

import { useEffect, useRef } from 'react';
import { Message } from '@/stores/chatStore';
import { cn } from '@/lib/utils';
import {
  Reply, Copy, Forward, Star, Pin, Pencil, Trash2, CheckSquare, Info,
} from 'lucide-react';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

interface MessageContextMenuProps {
  message: Message;
  x: number;
  y: number;
  isOwn: boolean;
  isStarred: boolean;
  isPinned: boolean;
  onClose: () => void;
  onReply: () => void;
  onCopy: () => void;
  onForward: () => void;
  onStar: () => void;
  onPin: () => void;
  onEdit: () => void;
  onSelect: () => void;
  onDeleteForMe: () => void;
  onDeleteForEveryone: () => void;
  onInfo: () => void;
  onReaction?: (emoji: string) => void;
}

export default function MessageContextMenu({
  message, x, y, isOwn, isStarred, isPinned,
  onClose, onReply, onCopy, onForward, onStar, onPin,
  onEdit, onSelect, onDeleteForMe, onDeleteForEveryone, onInfo, onReaction,
}: MessageContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Position adjustment to keep menu in viewport
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
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
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

  const isTextMessage = message.message_type === 'text';
  const canEdit = isOwn && isTextMessage && !message.isOptimistic && message.status !== 'failed';

  const menuItems: { icon: React.ElementType; label: string; action: () => void; danger?: boolean; dividerBefore?: boolean; show?: boolean; accent?: string }[] = [
    { icon: Reply, label: 'Reply', action: onReply },
    { icon: Copy, label: 'Copy text', action: onCopy, show: isTextMessage },
    { icon: Forward, label: 'Forward', action: onForward },
    { icon: Star, label: isStarred ? 'Unstar' : 'Star', action: onStar, accent: isStarred ? 'text-yellow-500' : undefined },
    { icon: Pin, label: isPinned ? 'Unpin' : 'Pin', action: onPin, accent: isPinned ? 'text-[var(--accent)]' : undefined },
    { icon: Pencil, label: 'Edit', action: onEdit, show: canEdit },
    { icon: CheckSquare, label: 'Select', action: onSelect, dividerBefore: true },
    { icon: Info, label: 'Message info', action: onInfo, show: isOwn },
    { icon: Trash2, label: 'Delete for me', action: onDeleteForMe, dividerBefore: true },
    { icon: Trash2, label: 'Delete for everyone', action: onDeleteForEveryone, danger: true, show: isOwn },
  ];

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[51]" />

      {/* Menu */}
      <div
        ref={menuRef}
        className="fixed z-[52] bg-[var(--bg-elevated)] border border-[var(--border)] rounded-2xl shadow-overlay py-1.5 min-w-[210px] animate-scale-in backdrop-blur-xl"
        style={{ top: y, left: x }}
      >
        {/* Quick Reactions Row — WhatsApp / Telegram style */}
        <div className="px-3 py-2 flex items-center gap-1 border-b border-[var(--separator)] mb-1">
          {QUICK_REACTIONS.map(emoji => (
            <button
              key={emoji}
              onClick={() => { onReaction?.(emoji); onClose(); }}
              className="w-9 h-9 flex items-center justify-center text-lg rounded-full hover:bg-[var(--hover)] hover:scale-125 transition-all active:scale-90"
            >
              {emoji}
            </button>
          ))}
        </div>

        {/* Action Items */}
        {menuItems
          .filter(item => item.show !== false)
          .map((item) => (
            <div key={item.label}>
              {item.dividerBefore && <div className="my-1 mx-3 h-px bg-[var(--separator)]" />}
              <button
                onClick={() => { item.action(); onClose(); }}
                className={cn(
                  'w-full flex items-center gap-3 px-3.5 py-2 text-[13px] font-medium transition-colors',
                  item.danger
                    ? 'text-[var(--danger)] hover:bg-red-500/5'
                    : 'text-[var(--text-primary)] hover:bg-[var(--hover)]'
                )}
              >
                <item.icon className={cn('w-4 h-4', item.danger ? '' : item.accent || 'text-[var(--text-muted)]')} />
                <span className="flex-1 text-left">{item.label}</span>
              </button>
            </div>
          ))
        }
      </div>
    </>
  );
}
