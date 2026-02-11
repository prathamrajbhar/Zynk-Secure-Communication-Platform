// ═══════════════════════════════════════════════════════
// ZYNK — MessageInput Component
// Rich text input with emoji, attachments, mentions, voice
// Production-grade with accessibility and animations
// ═══════════════════════════════════════════════════════

'use client';

import { useState, useRef, useEffect, useCallback, memo } from 'react';
import { cn } from '@/lib/utils';
import {
  Send, Smile, Paperclip, Mic, X, Image as ImageIcon,
  Camera, FileText, Music, MapPin, BarChart3, Loader2,
  Reply,
} from 'lucide-react';
import { IconButton } from '@/components/ui/primitives';

// ─── Quick Emoji Panel ───
const QUICK_EMOJIS = ['😀', '😂', '❤️', '👍', '🔥', '🎉', '😢', '🤔', '👋', '🙏', '💯', '✨'];
const EMOJI_CATEGORIES: Record<string, string[]> = {
  '😀 Smileys': ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '🥲', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬'],
  '❤️ Hearts': ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❤️‍🔥', '💕', '💞', '💓', '💗', '💖', '💝', '💘'],
  '👋 Hands': ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '🤝', '🙏'],
  '🎉 Objects': ['🎉', '🎊', '🎈', '🔥', '⭐', '🌟', '✨', '💫', '🎯', '🏆', '🥇', '🎮', '🎵', '🎶', '💡', '📱', '💻', '📷', '🔒', '🔑', '💯'],
};

// ─── Emoji Picker ───
function EmojiPicker({ onSelect, onClose }: { onSelect: (emoji: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className={cn(
        'absolute bottom-full left-0 mb-2 bg-[var(--bg-surface)] border border-[var(--border)]',
        'rounded-2xl shadow-[var(--shadow-xl)] w-80 max-h-80 overflow-hidden z-40',
        'animate-slide-up'
      )}
      role="dialog"
      aria-label="Emoji picker"
    >
      {/* Quick access */}
      <div className="p-2.5 border-b border-[var(--border)]">
        <div className="grid grid-cols-12 gap-0.5">
          {QUICK_EMOJIS.map(e => (
            <button
              key={e}
              onClick={() => onSelect(e)}
              className="w-8 h-8 flex items-center justify-center text-lg hover:bg-[var(--hover)] rounded-lg transition-all hover:scale-110 active:scale-95"
              aria-label={`Emoji ${e}`}
            >
              {e}
            </button>
          ))}
        </div>
      </div>
      {/* Categories */}
      <div className="max-h-52 overflow-y-auto p-2 scroll-thin">
        {Object.entries(EMOJI_CATEGORIES).map(([cat, emojis]) => (
          <div key={cat} className="mb-3">
            <p className="text-[10px] text-[var(--text-muted)] mb-1.5 px-1 font-medium uppercase tracking-wider">{cat}</p>
            <div className="grid grid-cols-8 gap-0.5">
              {emojis.map(e => (
                <button
                  key={e}
                  onClick={() => onSelect(e)}
                  className="w-8 h-8 flex items-center justify-center text-lg hover:bg-[var(--hover)] rounded-lg transition-all hover:scale-110 active:scale-95"
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Attachment Menu ───
interface AttachmentOption {
  icon: React.ElementType;
  label: string;
  color: string;
  accept?: string;
  capture?: string;
  action?: () => void;
}

function AttachmentMenu({ onSelect, onClose, showPoll, onPollCreate, onLocationShare }: {
  onSelect: (accept?: string, capture?: string) => void;
  onClose: () => void;
  showPoll?: boolean;
  onPollCreate?: () => void;
  onLocationShare?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const options: AttachmentOption[] = [
    { icon: ImageIcon, label: 'Gallery', color: 'bg-violet-500', accept: 'image/*' },
    { icon: Camera, label: 'Camera', color: 'bg-pink-500', accept: 'image/*', capture: 'environment' },
    { icon: FileText, label: 'Document', color: 'bg-blue-500', accept: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.7z,.tar,.gz' },
    { icon: Music, label: 'Audio', color: 'bg-orange-500', accept: 'audio/*' },
    { icon: MapPin, label: 'Location', color: 'bg-green-500', action: onLocationShare },
  ];

  if (showPoll) {
    options.push({ icon: BarChart3, label: 'Poll', color: 'bg-amber-500', action: onPollCreate });
  }

  return (
    <div
      ref={ref}
      className={cn(
        'absolute bottom-full left-0 mb-2 bg-[var(--bg-surface)] border border-[var(--border)]',
        'rounded-2xl shadow-[var(--shadow-xl)] p-3 w-[252px] z-40',
        'animate-scale-in origin-bottom-left'
      )}
      role="menu"
      aria-label="Attachment options"
    >
      <div className="grid grid-cols-3 gap-1">
        {options.map(({ icon: Icon, label, color, accept, capture, action }) => (
          <button
            key={label}
            onClick={() => {
              if (action) {
                action();
              } else {
                onSelect(accept, capture);
              }
              onClose();
            }}
            className="flex flex-col items-center gap-1.5 py-2.5 px-1 rounded-xl hover:bg-[var(--hover)] transition-all group"
            role="menuitem"
          >
            <div className={cn(
              'w-10 h-10 rounded-full flex items-center justify-center text-white shadow-sm transition-transform group-hover:scale-110',
              color
            )}>
              <Icon className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-medium text-[var(--text-secondary)]">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Reply Banner ───
function ReplyBanner({ senderName, content, onCancel }: {
  senderName: string;
  content: string;
  onCancel: () => void;
}) {
  return (
    <div className={cn(
      'mx-1 mb-1 px-3 py-2 rounded-t-xl bg-[var(--bg-wash)]',
      'flex items-center gap-3 border-l-[3px] border-[var(--accent)]',
      'animate-slide-up'
    )}>
      <Reply className="w-4 h-4 text-[var(--accent)] flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold text-[var(--accent)]">{senderName}</p>
        <p className="text-xs text-[var(--text-muted)] truncate">{content}</p>
      </div>
      <button
        onClick={onCancel}
        className="p-1 rounded-full hover:bg-[var(--hover)] transition-colors"
        aria-label="Cancel reply"
      >
        <X className="w-3.5 h-3.5 text-[var(--text-muted)]" />
      </button>
    </div>
  );
}

// ─── Main MessageInput Component ───
export interface MessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onTyping?: () => void;
  onFileUpload?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onVoiceRecord?: () => void;
  onGifToggle?: () => void;
  onLocationShare?: () => void;
  onPollCreate?: () => void;
  replyTo?: { senderName: string; content: string } | null;
  onCancelReply?: () => void;
  onMentionQuery?: (query: string | null, position: { top: number; left: number }) => void;
  isUploading?: boolean;
  uploadProgress?: number;
  disabled?: boolean;
  placeholder?: string;
  showPoll?: boolean;
  connectionError?: boolean;
}

const MessageInput = memo(function MessageInput({
  value,
  onChange,
  onSend,
  onTyping,
  onFileUpload,
  onVoiceRecord,
  onGifToggle,
  onLocationShare,
  onPollCreate,
  replyTo,
  onCancelReply,
  onMentionQuery,
  isUploading,
  uploadProgress,
  disabled,
  placeholder = 'Type a message...',
  showPoll,
  connectionError,
}: MessageInputProps) {
  const [showEmoji, setShowEmoji] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [value]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim()) onSend();
    }
    if (e.key === 'Escape') {
      onCancelReply?.();
      setShowEmoji(false);
      setShowAttach(false);
    }
  }, [value, onSend, onCancelReply]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    onChange(val);
    onTyping?.();

    // @mention detection
    if (onMentionQuery) {
      const cursorPos = e.target.selectionStart;
      const mentionMatch = val.substring(0, cursorPos).match(/@(\w*)$/);
      if (mentionMatch) {
        const rect = e.target.getBoundingClientRect();
        onMentionQuery(mentionMatch[1], { top: rect.top - 10, left: rect.left + 20 });
      } else {
        onMentionQuery(null, { top: 0, left: 0 });
      }
    }
  }, [onChange, onTyping, onMentionQuery]);

  const handleEmojiSelect = useCallback((emoji: string) => {
    onChange(value + emoji);
    setShowEmoji(false);
    textareaRef.current?.focus();
  }, [value, onChange]);

  const handleAttachSelect = useCallback((accept?: string, capture?: string) => {
    if (!fileInputRef.current) return;
    fileInputRef.current.accept = accept || '';
    if (capture) {
      fileInputRef.current.setAttribute('capture', capture);
    } else {
      fileInputRef.current.removeAttribute('capture');
    }
    fileInputRef.current.click();
  }, []);

  const hasText = value.trim().length > 0;

  return (
    <div className="flex-shrink-0 chat-input-bar px-3 pb-3 pt-2">
      {/* Reply banner */}
      {replyTo && (
        <ReplyBanner
          senderName={replyTo.senderName}
          content={replyTo.content}
          onCancel={() => onCancelReply?.()}
        />
      )}

      {/* Upload progress */}
      {isUploading && (
        <div className="mx-1 mb-2 px-3 py-2 bg-[var(--bg-wash)] rounded-xl">
          <div className="flex items-center gap-3">
            <Paperclip className="w-4 h-4 text-[var(--accent)] flex-shrink-0 animate-pulse-soft" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-[var(--text-secondary)]">Uploading...</span>
                <span className="text-xs font-bold text-[var(--accent)]">{uploadProgress || 0}%</span>
              </div>
              <div className="w-full h-1 bg-[var(--bg-wash)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[var(--accent)] rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${uploadProgress || 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-2">
        {/* Left action buttons */}
        <div className="flex items-center gap-0.5 pb-1">
          {/* Emoji */}
          <div className="relative">
            <IconButton
              label="Emoji"
              onClick={() => { setShowEmoji(!showEmoji); setShowAttach(false); }}
              active={showEmoji}
            >
              <Smile className="w-5 h-5" />
            </IconButton>
            {showEmoji && (
              <EmojiPicker onSelect={handleEmojiSelect} onClose={() => setShowEmoji(false)} />
            )}
          </div>

          {/* Attachments */}
          <div className="relative">
            <IconButton
              label="Attach file"
              onClick={() => { setShowAttach(!showAttach); setShowEmoji(false); }}
              active={showAttach}
            >
              {isUploading ? (
                <Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" />
              ) : (
                <Paperclip className={cn(
                  'w-5 h-5 transition-transform duration-200',
                  showAttach && 'rotate-[135deg] text-[var(--accent)]'
                )} />
              )}
            </IconButton>
            {showAttach && (
              <AttachmentMenu
                onSelect={handleAttachSelect}
                onClose={() => setShowAttach(false)}
                showPoll={showPoll}
                onPollCreate={onPollCreate}
                onLocationShare={onLocationShare}
              />
            )}
          </div>

          {/* GIF button */}
          {onGifToggle && (
            <IconButton label="GIF" onClick={onGifToggle}>
              <span className="text-xs font-bold text-[var(--text-muted)]">GIF</span>
            </IconButton>
          )}

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={onFileUpload}
          />
        </div>

        {/* Textarea */}
        <div className="flex-1 min-w-0 relative">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            className={cn(
              'w-full resize-none rounded-2xl px-4 py-2.5 text-sm',
              'bg-[var(--bg-wash)] text-[var(--text-primary)]',
              'border border-[var(--border)] outline-none',
              'placeholder-[var(--text-muted)]',
              'transition-all duration-150',
              'focus:bg-[var(--bg-surface)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]',
              'scroll-thin',
            )}
            placeholder={placeholder}
            rows={1}
            disabled={disabled}
            aria-label="Message input"
            style={{
              minHeight: '40px',
              maxHeight: '120px',
            }}
          />
        </div>

        {/* Send / Voice button */}
        <div className="pb-1">
          {hasText ? (
            <button
              onClick={onSend}
              disabled={connectionError || disabled}
              className={cn(
                'w-10 h-10 rounded-full flex items-center justify-center',
                'bg-[var(--accent)] text-white shadow-md',
                'transition-all duration-200',
                'hover:bg-[var(--accent-hover)] hover:shadow-lg hover:scale-105',
                'active:scale-90',
                'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] focus-visible:ring-offset-2',
              )}
              aria-label="Send message"
            >
              <Send className="w-[18px] h-[18px] ml-0.5" />
            </button>
          ) : (
            <IconButton
              label="Record voice message"
              size="md"
              onClick={onVoiceRecord}
            >
              <Mic className="w-5 h-5" />
            </IconButton>
          )}
        </div>
      </div>
    </div>
  );
});

export default MessageInput;
