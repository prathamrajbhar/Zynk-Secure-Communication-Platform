'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import {
  CheckSquare, Eraser, ArrowDown, Wallpaper, Search, Pin,
} from 'lucide-react';

interface ChatAreaBackgroundMenuProps {
  x: number;
  y: number;
  hasPinnedMessages: boolean;
  onClose: () => void;
  onSelectAll: () => void;
  onClearChat: () => void;
  onScrollToBottom: () => void;
  onSearchInChat: () => void;
  onViewPinned: () => void;
}

export default function ChatAreaBackgroundMenu({
  x, y, hasPinnedMessages,
  onClose, onSelectAll, onClearChat, onScrollToBottom, onSearchInChat, onViewPinned,
}: ChatAreaBackgroundMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (rect.right > vw) menuRef.current.style.left = `${x - rect.width}px`;
    if (rect.bottom > vh) menuRef.current.style.top = `${y - rect.height}px`;
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

  const menuItems: { icon: React.ElementType; label: string; action: () => void; show?: boolean; dividerBefore?: boolean; danger?: boolean }[] = [
    { icon: Search, label: 'Search in chat', action: onSearchInChat },
    { icon: CheckSquare, label: 'Select messages', action: onSelectAll },
    { icon: Pin, label: 'View pinned messages', action: onViewPinned, show: hasPinnedMessages },
    { icon: ArrowDown, label: 'Scroll to bottom', action: onScrollToBottom, dividerBefore: true },
    { icon: Eraser, label: 'Clear chat', action: onClearChat, dividerBefore: true, danger: true },
  ];

  return (
    <>
      <div className="fixed inset-0 z-[51]" />
      <div
        ref={menuRef}
        className="fixed z-[52] bg-[var(--bg-elevated)] border border-[var(--border)] rounded-2xl shadow-overlay py-1.5 min-w-[200px] animate-scale-in backdrop-blur-xl"
        style={{ top: y, left: x }}
      >
        {menuItems
          .filter(item => item.show !== false)
          .map((item) => (
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
                <item.icon className={cn('w-4 h-4', item.danger ? '' : 'text-[var(--text-muted)]')} />
                {item.label}
              </button>
            </div>
          ))
        }
      </div>
    </>
  );
}
