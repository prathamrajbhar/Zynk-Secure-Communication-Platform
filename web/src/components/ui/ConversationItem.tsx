// ═══════════════════════════════════════════════════════
// ZYNK — ConversationItem Component
// Production-grade conversation list item
// Telegram/WhatsApp style with badges, pins, swipe actions
// ═══════════════════════════════════════════════════════

'use client';

import { memo, useRef, useCallback, useState } from 'react';
import { cn, formatTime, getAvatarColor, formatLastMessage } from '@/lib/utils';
import {
  Pin, BellOff, Pencil, Archive,
  Image as ImageIcon, Mic, FileText, MapPin, BarChart3,
} from 'lucide-react';
import { Avatar, Badge } from '@/components/ui/primitives';
import type { ConversationItemProps, MessageVariant } from '@/components/ui/types';

// ─── Last message icon by type ───
function LastMessageIcon({ type }: { type?: MessageVariant }) {
  const iconClass = 'w-3.5 h-3.5 text-[var(--text-muted)] flex-shrink-0';
  switch (type) {
    case 'image': return <ImageIcon className={iconClass} />;
    case 'audio':
    case 'voice': return <Mic className={iconClass} />;
    case 'file': return <FileText className={iconClass} />;
    case 'location': return <MapPin className={iconClass} />;
    case 'poll': return <BarChart3 className={iconClass} />;
    default: return null;
  }
}

// ─── ConversationItem ───
const ConversationItem = memo(function ConversationItem({
  type,
  name,
  avatarUrl,
  avatarColor,
  lastMessage,
  lastMessageType,
  timestamp,
  unreadCount,
  isOnline,
  isTyping,
  typingUsers,
  isPinned,
  isMuted,
  draft,
  isActive,
  onClick,
  onContextMenu,
  onSwipeAction,
}: ConversationItemProps) {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const touchStartX = useRef(0);
  const swipeThreshold = 80;

  // Swipe gesture handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const delta = touchStartX.current - e.touches[0].clientX;
    setSwipeOffset(Math.max(0, Math.min(delta, 160)));
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (swipeOffset > swipeThreshold) {
      onSwipeAction?.(isPinned ? 'archive' : 'pin');
    }
    setSwipeOffset(0);
  }, [swipeOffset, isPinned, onSwipeAction]);

  const hasUnread = unreadCount > 0;
  const formattedTime = timestamp ? formatTime(timestamp) : '';
  const displayMessage = draft
    ? undefined
    : lastMessage
      ? formatLastMessage(lastMessage, 40)
      : 'No messages yet';

  return (
    <button
      onClick={onClick}
      onContextMenu={onContextMenu}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={cn(
        'conv-item w-full flex items-center gap-3 px-4 py-[10px] text-left transition-all duration-100',
        'focus-visible:outline-none focus-visible:bg-[var(--active)]',
        isActive && 'active',
      )}
      style={{
        transform: swipeOffset > 0 ? `translateX(-${swipeOffset}px)` : undefined,
        transition: swipeOffset === 0 ? 'transform 0.2s ease' : undefined,
      }}
      role="listitem"
      aria-label={`Chat with ${name}${hasUnread ? `, ${unreadCount} unread` : ''}`}
      aria-current={isActive ? 'true' : undefined}
    >
      {/* Avatar */}
      <Avatar
        name={name}
        src={avatarUrl}
        size="lg"
        color={type === 'group' ? 'bg-violet-500' : avatarColor || getAvatarColor(name)}
        isOnline={type === 'one_to_one' && isOnline}
        showStatus={type === 'one_to_one'}
      />

      {/* Content */}
      <div className="flex-1 min-w-0 border-b border-[var(--border-subtle)] pb-[10px]">
        {/* Top row: name + time */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={cn(
              'text-[14px] truncate',
              hasUnread
                ? 'font-semibold text-[var(--text-primary)]'
                : 'font-normal text-[var(--text-primary)]'
            )}>
              {name}
            </span>
            {isPinned && (
              <Pin className="w-3 h-3 text-[var(--text-muted)] flex-shrink-0 rotate-45" aria-label="Pinned" />
            )}
            {isMuted && (
              <BellOff className="w-3 h-3 text-[var(--text-muted)] flex-shrink-0" aria-label="Muted" />
            )}
          </div>
          <span className={cn(
            'text-[11px] whitespace-nowrap flex-shrink-0',
            hasUnread ? 'text-[var(--accent)] font-semibold' : 'text-[var(--text-muted)]'
          )}>
            {formattedTime}
          </span>
        </div>

        {/* Bottom row: last message + badge */}
        <div className="flex items-center justify-between gap-2 mt-1">
          {isTyping ? (
            <span className="text-[13px] text-[var(--accent)] font-medium flex items-center gap-1 truncate">
              <span className="flex gap-[3px]">
                <span className="typing-dot" style={{ width: '4px', height: '4px' }} />
                <span className="typing-dot" style={{ width: '4px', height: '4px' }} />
                <span className="typing-dot" style={{ width: '4px', height: '4px' }} />
              </span>
              {typingUsers?.length === 1 ? `${typingUsers[0]} is typing` : 'typing'}
            </span>
          ) : draft ? (
            <span className="text-[13px] truncate text-[var(--danger)] flex items-center gap-1">
              <Pencil className="w-3 h-3 flex-shrink-0" />
              {draft.length > 40 ? draft.slice(0, 40) + '...' : draft}
            </span>
          ) : (
            <span className={cn(
              'text-[13px] truncate flex items-center gap-1',
              hasUnread ? 'text-[var(--text-secondary)]' : 'text-[var(--text-muted)]'
            )}>
              <LastMessageIcon type={lastMessageType} />
              {displayMessage}
            </span>
          )}

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {hasUnread && !isMuted && (
              <Badge count={unreadCount} variant="accent" size="sm" />
            )}
            {hasUnread && isMuted && (
              <Badge count={unreadCount} variant="default" size="sm" className="!bg-[var(--text-muted)]" />
            )}
          </div>
        </div>
      </div>

      {/* Swipe action reveal */}
      {swipeOffset > 20 && (
        <div
          className="absolute right-0 top-0 bottom-0 flex items-center px-4 bg-[var(--accent)] text-white"
          style={{ width: `${swipeOffset}px` }}
        >
          {swipeOffset > swipeThreshold ? (
            <span className="text-xs font-medium">
              {isPinned ? <Archive className="w-5 h-5" /> : <Pin className="w-5 h-5" />}
            </span>
          ) : null}
        </div>
      )}
    </button>
  );
});

export default ConversationItem;
