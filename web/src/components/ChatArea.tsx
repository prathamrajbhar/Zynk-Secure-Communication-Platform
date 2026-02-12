// ═══════════════════════════════════════════════════════
// ZYNK UI — Chat Area (Discord-style)
// ═══════════════════════════════════════════════════════

'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useChatStore, type Message } from '@/stores/chatStore';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useCallStore } from '@/stores/callStore';
import { Avatar, MessagesSkeleton } from '@/components/ui';
import { cn, formatMessageTime, formatTime } from '@/lib/utils';
import {
  ArrowLeft, Phone, Video, Info,
  Send, Paperclip, Smile, Mic, Image as ImageIcon, File, X, Camera,
  Check, CheckCheck, Clock, AlertCircle, Lock,
  Reply, Copy, Trash2, Edit3, Star, Forward,
  MessageCircle, ChevronDown,
} from 'lucide-react';
import api from '@/lib/api';

export default function ChatArea() {
  const { activeConversation, conversations, messages, typingUsers,
    isLoadingMessages, sendMessageOptimistic, sendTyping, markConversationRead,
    fetchMessages, fetchOlderMessages, hasMoreMessages, drafts, setDraft } = useChatStore();
  const user = useAuthStore((s) => s.user);
  const { chatBackground, setShowUserInfo, setSidebarOpen } = useUIStore();
  const { initiateCall } = useCallStore();

  const conversation = conversations.find((c) => c.id === activeConversation);
  const msgs = useMemo(() => activeConversation ? messages[activeConversation] || [] : [], [activeConversation, messages]);
  const typing = activeConversation ? typingUsers[activeConversation] || [] : [];
  const isTyping = typing.length > 0 && !typing.includes(user?.id || '');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; message: Message } | null>(null);
  const userScrolledRef = useRef(false);

  useEffect(() => {
    if (activeConversation) {
      fetchMessages(activeConversation);
      markConversationRead(activeConversation);
    }
  }, [activeConversation, fetchMessages, markConversationRead]);

  useEffect(() => {
    if (!userScrolledRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [msgs.length]);

  const handleScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    setShowScrollButton(!isNearBottom);
    userScrolledRef.current = !isNearBottom;

    if (el.scrollTop < 100 && activeConversation && hasMoreMessages[activeConversation]) {
      fetchOlderMessages(activeConversation);
    }
  }, [activeConversation, hasMoreMessages, fetchOlderMessages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    userScrolledRef.current = false;
  };

  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [contextMenu]);

  // Group messages by date
  const groupedMessages = useMemo(() => {
    const groups: { date: string; messages: Message[] }[] = [];
    let currentDate = '';
    msgs.forEach((m) => {
      const date = new Date(m.created_at).toLocaleDateString(undefined, {
        year: 'numeric', month: 'long', day: 'numeric',
      });
      if (date !== currentDate) {
        currentDate = date;
        groups.push({ date, messages: [m] });
      } else {
        groups[groups.length - 1].messages.push(m);
      }
    });
    return groups;
  }, [msgs]);

  // No conversation selected
  if (!activeConversation || !conversation) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5 pointer-events-none" />
        <div className="text-center animate-appear relative z-10">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-primary/20">
            <MessageCircle className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">Welcome to Zynk</h2>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
            Select a conversation or start a new chat to begin messaging securely.
          </p>
          <div className="flex items-center justify-center gap-1.5 mt-6 text-xs text-muted-foreground">
            <Lock className="w-3.5 h-3.5" />
            <span>End-to-end encrypted</span>
          </div>
        </div>
      </div>
    );
  }

  const name = conversation.type === 'group'
    ? conversation.group_info?.name || 'Group'
    : conversation.other_user?.display_name || conversation.other_user?.username || 'User';
  const avatar = conversation.type === 'group'
    ? conversation.group_info?.avatar_url
    : conversation.other_user?.avatar_url;
  const isOnline = conversation.type === 'one_to_one' && conversation.is_online;

  const handleCall = (type: 'audio' | 'video') => {
    if (conversation.type !== 'one_to_one' || !conversation.other_user) return;
    initiateCall(
      conversation.other_user.user_id,
      conversation.other_user.display_name || conversation.other_user.username,
      conversation.other_user.avatar_url,
      conversation.id,
      type,
    );
  };

  const bgClass = `chat-bg-${chatBackground}`;

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full">
      {/* ─── Chat Header ─── */}
      <div className="flex items-center gap-3 px-4 py-2.5 flex-shrink-0 bg-card/80 backdrop-blur-xl border-b border-border z-10">
        <button
          onClick={() => { useChatStore.getState().setActiveConversation(null); setSidebarOpen(true); }}
          className="lg:hidden w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <button
          onClick={() => conversation.type === 'one_to_one' && setShowUserInfo(true)}
          className="flex items-center gap-3 flex-1 min-w-0 group"
          aria-label={`View ${name}'s info`}
        >
          <Avatar name={name} src={avatar} size="md" isOnline={isOnline} showStatus={conversation.type === 'one_to_one'} />
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-foreground truncate group-hover:text-primary transition-colors">
              {name}
            </h2>
            <p className="text-xs text-muted-foreground truncate">
              {isTyping ? (
                <span className="text-primary font-medium">typing...</span>
              ) : isOnline ? (
                <span className="text-success">online</span>
              ) : conversation.other_user?.last_seen_at ? (
                `last seen ${formatTime(conversation.other_user.last_seen_at)}`
              ) : conversation.type === 'group' ? (
                'Group chat'
              ) : (
                'offline'
              )}
            </p>
          </div>
        </button>

        <div className="flex items-center gap-1">
          {conversation.type === 'one_to_one' && (
            <>
              <button
                onClick={() => handleCall('audio')}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-primary transition-colors"
                aria-label="Voice call"
              >
                <Phone className="w-[18px] h-[18px]" />
              </button>
              <button
                onClick={() => handleCall('video')}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-primary transition-colors"
                aria-label="Video call"
              >
                <Video className="w-[18px] h-[18px]" />
              </button>
            </>
          )}
          <button
            onClick={() => conversation.type === 'one_to_one' && setShowUserInfo(true)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label="Info"
          >
            <Info className="w-[18px] h-[18px]" />
          </button>
        </div>
      </div>

      {/* ─── Messages Area ─── */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className={cn('flex-1 overflow-y-auto overflow-x-hidden relative bg-background', bgClass)}
      >
        <div className="max-w-3xl mx-auto px-4 py-4 space-y-1 relative z-10">
          {/* E2EE banner */}
          <div className="flex items-center justify-center gap-2 py-2 mb-2 rounded-xl bg-primary/5 border border-primary/10">
            <Lock className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-medium text-muted-foreground">Messages are end-to-end encrypted</span>
          </div>

          {isLoadingMessages ? (
            <MessagesSkeleton />
          ) : (
            groupedMessages.map((group) => (
              <div key={group.date}>
                <div className="flex items-center justify-center py-3">
                  <span className="px-3 py-1 rounded-full bg-secondary text-muted-foreground text-xs font-medium border border-border">
                    {group.date}
                  </span>
                </div>

                {group.messages.map((msg, i) => {
                  const isMine = msg.sender_id === user?.id;
                  const showAvatar = !isMine && conversation.type === 'group' &&
                    (i === 0 || group.messages[i - 1]?.sender_id !== msg.sender_id);
                  const showName = showAvatar;
                  const isConsecutive = i > 0 && group.messages[i - 1]?.sender_id === msg.sender_id;

                  return (
                    <MessageBubble
                      key={msg.id || msg.tempId}
                      message={msg}
                      isMine={isMine}
                      isGroup={conversation.type === 'group'}
                      showAvatar={showAvatar}
                      showName={showName}
                      isConsecutive={isConsecutive}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setContextMenu({ x: e.clientX, y: e.clientY, message: msg });
                      }}
                    />
                  );
                })}
              </div>
            ))
          )}

          {/* Typing indicator */}
          {isTyping && (
            <div className="flex items-end gap-2 animate-appear">
              <Avatar name={name} src={avatar} size="xs" />
              <div className="px-4 py-2.5 rounded-2xl rounded-bl-md bg-secondary flex items-center gap-1.5">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Scroll to bottom */}
        {showScrollButton && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-4 right-4 w-9 h-9 rounded-full shadow-lg z-10 bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="Scroll to bottom"
          >
            <ChevronDown className="w-[18px] h-[18px]" />
          </button>
        )}
      </div>

      {/* ─── Message Input ─── */}
      <ChatInput
        conversationId={activeConversation}
        draft={drafts[activeConversation] || ''}
        onDraftChange={(text) => setDraft(activeConversation, text)}
        onSend={(text) => sendMessageOptimistic(activeConversation, text)}
        onTyping={(isTyping) => sendTyping(activeConversation, isTyping)}
      />

      {/* ─── Context Menu ─── */}
      {contextMenu && (
        <MessageContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          message={contextMenu.message}
          isMine={contextMenu.message.sender_id === user?.id}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}


/* ─── Message Bubble ─── */
function MessageBubble({
  message: msg, isMine, isGroup, showAvatar, showName, isConsecutive, onContextMenu,
}: {
  message: Message; isMine: boolean; isGroup: boolean;
  showAvatar: boolean; showName: boolean; isConsecutive: boolean;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const content = msg.content || msg.encrypted_content || '';
  const isSystem = msg.message_type === 'system';
  const isImage = msg.message_type === 'image';
  const isFile = msg.message_type === 'file';

  if (isSystem) {
    return (
      <div className="flex justify-center py-1">
        <span className="px-3 py-1 rounded-full bg-secondary text-muted-foreground text-xs">{content}</span>
      </div>
    );
  }

  let fileData: { filename?: string; url?: string; mime_type?: string; size?: number; thumbnail_url?: string } | null = null;
  if ((isImage || isFile) && content) {
    try { fileData = JSON.parse(content); } catch { /* not JSON */ }
  }

  const statusIcon = isMine ? (
    msg.isOptimistic ? <Clock className="w-3 h-3 text-muted-foreground" /> :
    msg.status === 'read' ? <CheckCheck className="w-3 h-3 text-primary" /> :
    msg.status === 'delivered' ? <CheckCheck className="w-3 h-3 text-muted-foreground" /> :
    msg.status === 'sent' ? <Check className="w-3 h-3 text-muted-foreground" /> :
    msg.status === 'failed' ? <AlertCircle className="w-3 h-3 text-destructive" /> :
    <Clock className="w-3 h-3 text-muted-foreground" />
  ) : null;

  return (
    <div
      className={cn(
        'flex group',
        isMine ? 'justify-end' : 'justify-start',
        isConsecutive ? 'mt-0.5' : 'mt-2',
        isMine ? 'animate-msg-in-right' : 'animate-msg-in-left',
      )}
      onContextMenu={onContextMenu}
    >
      {isGroup && !isMine && (
        <div className="w-8 flex-shrink-0 self-end mb-1">
          {showAvatar && (
            <Avatar name={msg.sender_display_name || msg.sender_username || 'U'} src={msg.sender_avatar} size="xs" />
          )}
        </div>
      )}

      <div className={cn('max-w-[70%] sm:max-w-[65%] relative')}>
        {showName && (
          <p className="text-[11px] font-semibold text-primary ml-1 mb-0.5">
            {msg.sender_display_name || msg.sender_username}
          </p>
        )}

        <div className={cn(
          'px-3 py-2 relative rounded-2xl',
          isMine
            ? 'bg-chat-sent text-chat-sent-foreground rounded-br-md'
            : 'bg-chat-received text-foreground rounded-bl-md',
        )}>
          {/* Image message */}
          {isImage && fileData?.url && (
            <div className="mb-1.5 -mx-1 -mt-0.5 rounded-lg overflow-hidden">
              <img
                src={fileData.thumbnail_url || fileData.url}
                alt={fileData.filename || 'Image'}
                className="max-w-full max-h-72 object-cover rounded-lg cursor-pointer hover:opacity-95 transition-opacity"
                loading="lazy"
              />
            </div>
          )}

          {/* File message */}
          {isFile && fileData?.filename && !isImage && (
            <a
              href={fileData.url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'flex items-center gap-2.5 p-2 -mx-1 rounded-lg transition-colors',
                isMine ? 'bg-white/10 hover:bg-white/20' : 'bg-accent hover:bg-accent/80',
              )}
            >
              <div className={cn(
                'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                isMine ? 'bg-white/20' : 'bg-primary/10',
              )}>
                <File className={cn('w-5 h-5', isMine ? 'text-white' : 'text-primary')} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{fileData.filename}</p>
                {fileData.size && (
                  <p className={cn('text-[11px]', isMine ? 'text-white/60' : 'text-muted-foreground')}>
                    {formatFileSize(fileData.size)}
                  </p>
                )}
              </div>
            </a>
          )}

          {/* Text content */}
          {!isImage && !isFile && (
            <p className="text-[0.9375rem] leading-relaxed whitespace-pre-wrap break-words">
              {isEncryptedPlaceholder(content) ? (
                <span className={cn('italic flex items-center gap-1', isMine ? 'text-white/60' : 'text-muted-foreground')}>
                  <Lock className="w-3 h-3" /> Encrypted message
                </span>
              ) : (
                content
              )}
            </p>
          )}

          {/* Timestamp + status */}
          <div className={cn('flex items-center gap-1 mt-1', isMine ? 'justify-end' : 'justify-start')}>
            <span className={cn('text-[10px] tabular-nums', isMine ? 'text-white/60' : 'text-muted-foreground')}>
              {formatMessageTime(msg.created_at)}
            </span>
            {msg.edited_at && <span className={cn('text-[10px]', isMine ? 'text-white/60' : 'text-muted-foreground')}>edited</span>}
            {statusIcon}
          </div>
        </div>

        {/* Hover actions */}
        <div className={cn(
          'absolute top-0 flex items-center gap-0.5 bg-card rounded-lg shadow-md border border-border p-0.5',
          'opacity-0 group-hover:opacity-100 transition-opacity',
          isMine ? '-left-2 -translate-x-full' : '-right-2 translate-x-full',
        )}>
          <button className="w-7 h-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" aria-label="Reply">
            <Reply className="w-3.5 h-3.5" />
          </button>
          <button className="w-7 h-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" aria-label="React">
            <Smile className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}


/* ─── Chat Input ─── */
function ChatInput({
  conversationId, draft, onDraftChange, onSend, onTyping,
}: {
  conversationId: string; draft: string; onDraftChange: (text: string) => void;
  onSend: (text: string) => void; onTyping: (isTyping: boolean) => void;
}) {
  const [text, setText] = useState(draft);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setText(draft); }, [conversationId, draft]);

  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 160) + 'px';
    }
  }, [text]);

  // Close attach menu on outside click
  useEffect(() => {
    if (!showAttachMenu) return;
    const handler = (e: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) setShowAttachMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showAttachMenu]);

  const handleChange = (value: string) => {
    setText(value);
    onDraftChange(value);
    onTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => onTyping(false), 2000);
  };

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
    onDraftChange('');
    onTyping(false);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setShowAttachMenu(false);
    for (const file of Array.from(files)) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('conversation_id', conversationId);
        await api.post('/files/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } catch (err) {
        console.error('File upload failed:', err);
      }
    }
  };

  return (
    <div className="flex items-end gap-2 px-4 py-3 bg-card/80 backdrop-blur-xl border-t border-border relative">
      {/* Attachment */}
      <div className="relative" ref={attachMenuRef}>
        <button
          onClick={() => setShowAttachMenu(!showAttachMenu)}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          aria-label="Attach"
        >
          {showAttachMenu ? <X className="w-5 h-5" /> : <Paperclip className="w-5 h-5" />}
        </button>
        {showAttachMenu && (
          <div className="absolute bottom-full left-0 mb-2 w-44 bg-card border border-border rounded-xl shadow-lg py-1 z-50 animate-appear">
            <button
              onClick={() => { imageInputRef.current?.click(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
            >
              <ImageIcon className="w-4 h-4 text-primary" /> Photo
            </button>
            <button className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors">
              <Camera className="w-4 h-4 text-success" /> Camera
            </button>
            <button
              onClick={() => { fileInputRef.current?.click(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
            >
              <File className="w-4 h-4 text-warning" /> Document
            </button>
          </div>
        )}
      </div>

      <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => handleFileUpload(e.target.files)} />
      <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e.target.files)} />

      {/* Text input */}
      <div className="flex-1 relative">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          rows={1}
          className="w-full px-4 py-2.5 bg-secondary rounded-2xl text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none transition-all focus:ring-2 focus:ring-primary/30 focus:bg-accent max-h-40 leading-relaxed border border-transparent focus:border-primary/20"
          aria-label="Message input"
        />
      </div>

      <button className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" aria-label="Emoji">
        <Smile className="w-5 h-5" />
      </button>

      {text.trim() ? (
        <button
          onClick={handleSend}
          className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/20 hover:bg-primary/90 transition-colors animate-appear"
          aria-label="Send message"
        >
          <Send className="w-4 h-4" />
        </button>
      ) : (
        <button className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" aria-label="Voice message">
          <Mic className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}


/* ─── Message Context Menu ─── */
function MessageContextMenu({
  x, y, message, isMine, onClose,
}: {
  x: number; y: number; message: Message; isMine: boolean; onClose: () => void;
}) {
  const { toggleStarMessage, starredMessages } = useChatStore();
  const isStarred = starredMessages.has(message.id);

  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(x, window.innerWidth - 200),
    top: Math.min(y, window.innerHeight - 300),
    zIndex: 80,
  };

  return (
    <div
      style={style}
      className="bg-card/95 backdrop-blur-xl rounded-xl border border-border shadow-xl py-1.5 w-48 animate-appear"
      onClick={(e) => e.stopPropagation()}
    >
      <ContextMenuItem icon={Reply} label="Reply" onClick={() => { onClose(); }} />
      <ContextMenuItem icon={Copy} label="Copy" onClick={() => { navigator.clipboard.writeText(message.content || ''); onClose(); }} />
      <ContextMenuItem icon={Forward} label="Forward" onClick={() => { onClose(); }} />
      <ContextMenuItem icon={Star} label={isStarred ? 'Unstar' : 'Star'} onClick={() => { toggleStarMessage(message.id); onClose(); }} />
      {isMine && (
        <>
          <div className="h-px bg-border my-1" />
          <ContextMenuItem icon={Edit3} label="Edit" onClick={() => { onClose(); }} />
          <ContextMenuItem icon={Trash2} label="Delete" onClick={() => { onClose(); }} danger />
        </>
      )}
    </div>
  );
}

function ContextMenuItem({ icon: Icon, label, onClick, danger }: {
  icon: typeof Reply; label: string; onClick: () => void; danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors',
        danger
          ? 'text-destructive hover:bg-destructive/10'
          : 'text-foreground hover:bg-accent',
      )}
    >
      <Icon className="w-4 h-4" />
      <span>{label}</span>
    </button>
  );
}


/* ─── Helpers ─── */
function isEncryptedPlaceholder(content: string): boolean {
  if (!content) return false;
  try {
    const parsed = JSON.parse(content);
    return !!(parsed.v && parsed.ct) || !!parsed.ciphertext;
  } catch {
    return false;
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
