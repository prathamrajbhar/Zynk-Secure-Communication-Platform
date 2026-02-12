// ═══════════════════════════════════════════════════════
// ZYNK UI — Chat Area (Discord-style) v2.0
// Full features: reply, edit, delete, forward, reactions,
// emoji picker, message search, poll rendering, bubble styles
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
  MessageCircle, ChevronDown, Search, BarChart3,
  ThumbsUp, Heart, Laugh, Frown, AlertTriangle, Flame,
  CornerUpRight,
} from 'lucide-react';
import api from '@/lib/api';

// Quick-reaction emoji set
const QUICK_REACTIONS = [
  { emoji: '👍', icon: ThumbsUp, label: 'Like' },
  { emoji: '❤️', icon: Heart, label: 'Love' },
  { emoji: '😂', icon: Laugh, label: 'Laugh' },
  { emoji: '😢', icon: Frown, label: 'Sad' },
  { emoji: '😮', icon: AlertTriangle, label: 'Wow' },
  { emoji: '🔥', icon: Flame, label: 'Fire' },
];

export default function ChatArea() {
  const { activeConversation, conversations, messages, typingUsers,
    isLoadingMessages, sendMessageOptimistic, sendTyping, markConversationRead,
    fetchMessages, fetchOlderMessages, hasMoreMessages, drafts, setDraft,
    editMessage: editMessageAction, starredMessages,
  } = useChatStore();
  const user = useAuthStore((s) => s.user);
  const { chatBackground, bubbleStyle, setShowUserInfo, setSidebarOpen } = useUIStore();
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

  // Reply state
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  // Edit state
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  // Forward state
  const [forwardMessage, setForwardMessage] = useState<Message | null>(null);
  // Message search
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Message[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (activeConversation) {
      fetchMessages(activeConversation);
      markConversationRead(activeConversation);
      setReplyTo(null);
      setEditingMessage(null);
      setSearchQuery('');
      setSearchResults([]);
      setShowSearch(false);
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

  // Message search
  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (!query.trim() || !activeConversation) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const res = await api.post('/messages/search', {
        query: query.trim(),
        conversation_id: activeConversation,
      });
      setSearchResults(res.data.messages || []);
    } catch {
      // Fallback: local search
      const q = query.toLowerCase();
      const local = msgs.filter(m =>
        (m.content || '').toLowerCase().includes(q)
      );
      setSearchResults(local);
    } finally {
      setIsSearching(false);
    }
  }, [activeConversation, msgs]);

  // Handle reactions
  const handleReaction = useCallback(async (messageId: string, emoji: string) => {
    try {
      await api.post(`/messages/${messageId}/react`, { emoji });
    } catch (err) {
      console.error('Reaction failed:', err);
    }
  }, []);

  // Handle delete
  const handleDelete = useCallback(async (messageId: string) => {
    try {
      await api.delete(`/messages/${messageId}`);
      // Remove from local state
      useChatStore.setState(state => {
        const convId = activeConversation;
        if (!convId) return state;
        const existing = state.messages[convId] || [];
        return {
          messages: {
            ...state.messages,
            [convId]: existing.filter(m => m.id !== messageId),
          },
        };
      });
    } catch (err) {
      console.error('Delete failed:', err);
    }
  }, [activeConversation]);

  // Handle edit
  const handleStartEdit = useCallback((msg: Message) => {
    setEditingMessage(msg);
    setReplyTo(null);
  }, []);

  // Handle reply
  const handleStartReply = useCallback((msg: Message) => {
    setReplyTo(msg);
    setEditingMessage(null);
  }, []);

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

  // Build a message lookup for reply-to rendering
  const messageMap = useMemo(() => {
    const map = new Map<string, Message>();
    msgs.forEach(m => map.set(m.id, m));
    return map;
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
          <button
            onClick={() => setShowSearch(!showSearch)}
            className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
              showSearch ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
            aria-label="Search messages"
          >
            <Search className="w-[18px] h-[18px]" />
          </button>
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

      {/* ─── Search Bar ─── */}
      {showSearch && (
        <div className="px-4 py-2 bg-card/80 backdrop-blur-xl border-b border-border animate-appear">
          <div className="relative max-w-md mx-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search in conversation..."
              className="w-full h-9 pl-9 pr-8 bg-secondary border-0 rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              autoFocus
            />
            {searchQuery && (
              <button onClick={() => { setSearchQuery(''); setSearchResults([]); }} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                <X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>
          {searchResults.length > 0 && (
            <div className="mt-2 max-h-48 overflow-y-auto space-y-1 chat-scrollbar">
              {searchResults.map(msg => (
                <button
                  key={msg.id}
                  onClick={() => {
                    const el = document.getElementById(`msg-${msg.id}`);
                    if (el) {
                      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      el.classList.add('ring-2', 'ring-primary/50');
                      setTimeout(() => el.classList.remove('ring-2', 'ring-primary/50'), 2000);
                    }
                    setShowSearch(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-accent transition-colors"
                >
                  <p className="text-xs text-muted-foreground">{formatMessageTime(msg.created_at)}</p>
                  <p className="text-sm text-foreground truncate">{msg.content || msg.encrypted_content}</p>
                </button>
              ))}
            </div>
          )}
          {isSearching && <p className="text-xs text-muted-foreground text-center mt-2">Searching...</p>}
          {searchQuery && !isSearching && searchResults.length === 0 && (
            <p className="text-xs text-muted-foreground text-center mt-2">No results found</p>
          )}
        </div>
      )}

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
                      bubbleStyle={bubbleStyle}
                      messageMap={messageMap}
                      isStarred={starredMessages.has(msg.id)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setContextMenu({ x: e.clientX, y: e.clientY, message: msg });
                      }}
                      onReply={() => handleStartReply(msg)}
                      onReaction={(emoji) => handleReaction(msg.id, emoji)}
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
        onSend={(text, replyToId) => {
          sendMessageOptimistic(activeConversation, text, 'text', replyToId);
          setReplyTo(null);
          setEditingMessage(null);
        }}
        onTyping={(isTyping) => sendTyping(activeConversation, isTyping)}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        editingMessage={editingMessage}
        onCancelEdit={() => setEditingMessage(null)}
        onEditMessage={async (messageId, newContent) => {
          await editMessageAction(messageId, newContent);
          setEditingMessage(null);
        }}
      />

      {/* ─── Context Menu ─── */}
      {contextMenu && (
        <MessageContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          message={contextMenu.message}
          isMine={contextMenu.message.sender_id === user?.id}
          onClose={() => setContextMenu(null)}
          onReply={() => { handleStartReply(contextMenu.message); setContextMenu(null); }}
          onEdit={() => { handleStartEdit(contextMenu.message); setContextMenu(null); }}
          onDelete={() => { handleDelete(contextMenu.message.id); setContextMenu(null); }}
          onForward={() => { setForwardMessage(contextMenu.message); setContextMenu(null); }}
        />
      )}

      {/* ─── Forward Modal ─── */}
      {forwardMessage && (
        <ForwardModal
          message={forwardMessage}
          conversations={conversations}
          onForward={async (targetConvId) => {
            const content = forwardMessage.content || forwardMessage.encrypted_content || '';
            sendMessageOptimistic(targetConvId, `↩️ Forwarded: ${content}`);
            setForwardMessage(null);
          }}
          onClose={() => setForwardMessage(null)}
        />
      )}
    </div>
  );
}


/* ─── Message Bubble ─── */
function MessageBubble({
  message: msg, isMine, isGroup, showAvatar, showName, isConsecutive,
  bubbleStyle, messageMap, isStarred, onContextMenu, onReply, onReaction,
}: {
  message: Message; isMine: boolean; isGroup: boolean;
  showAvatar: boolean; showName: boolean; isConsecutive: boolean;
  bubbleStyle: string; messageMap: Map<string, Message>; isStarred: boolean;
  onContextMenu: (e: React.MouseEvent) => void;
  onReply: () => void;
  onReaction: (emoji: string) => void;
}) {
  const [showReactions, setShowReactions] = useState(false);
  const content = msg.content || msg.encrypted_content || '';
  const isSystem = msg.message_type === 'system';
  const isImage = msg.message_type === 'image';
  const isFile = msg.message_type === 'file';
  const isPoll = msg.message_type === 'poll';

  // Check for reply-to
  const replyToId = (msg.metadata as { reply_to_id?: string })?.reply_to_id;
  const replyToMsg = replyToId ? messageMap.get(replyToId) : null;

  // Check for reactions
  const reactions = (msg.metadata as { reactions?: Record<string, string[]> })?.reactions;

  // Check for poll data
  let pollData: { question?: string; options?: { text: string; votes?: number }[]; type?: string } | null = null;
  if (isPoll && content) {
    try { pollData = JSON.parse(content); } catch { /* not JSON */ }
  }

  // Check for GIF
  let gifData: { type?: string; url?: string; title?: string } | null = null;
  if (content) {
    try {
      const parsed = JSON.parse(content);
      if (parsed.type === 'gif') gifData = parsed;
    } catch { /* not JSON */ }
  }

  // Check for location
  let locationData: { type?: string; lat?: number; lng?: number; name?: string } | null = null;
  if (content) {
    try {
      const parsed = JSON.parse(content);
      if (parsed.type === 'location') locationData = parsed;
    } catch { /* not JSON */ }
  }

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

  const bubbleClass = isMine ? (
    bubbleStyle === 'gradient' ? 'bubble-gradient' :
    bubbleStyle === 'minimal' ? 'bubble-minimal' :
    'bg-chat-sent text-chat-sent-foreground'
  ) : (
    bubbleStyle === 'minimal' ? 'bg-transparent border border-border text-foreground' :
    'bg-chat-received text-foreground'
  );

  return (
    <div
      id={`msg-${msg.id}`}
      className={cn(
        'flex group transition-all duration-300 rounded-lg',
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

        {/* Reply preview */}
        {replyToMsg && (
          <div className="reply-preview ml-1 mb-1 max-w-[90%]">
            <p className="text-[10px] font-semibold text-primary truncate">
              {replyToMsg.sender_display_name || replyToMsg.sender_username || 'User'}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">
              {replyToMsg.content || '🔒 Encrypted'}
            </p>
          </div>
        )}

        <div className={cn(
          'px-3 py-2 relative rounded-2xl',
          isMine ? 'rounded-br-md' : 'rounded-bl-md',
          bubbleClass,
          isMine && bubbleStyle !== 'gradient' && bubbleStyle !== 'minimal' && 'text-chat-sent-foreground',
        )}>
          {/* GIF message */}
          {gifData?.url && (
            <div className="mb-1.5 -mx-1 -mt-0.5 rounded-lg overflow-hidden">
              <img src={gifData.url} alt={gifData.title || 'GIF'} className="max-w-full max-h-64 rounded-lg" loading="lazy" />
            </div>
          )}

          {/* Location message */}
          {locationData && (
            <div className="mb-1.5 p-2.5 rounded-lg bg-accent/50">
              <p className="text-sm font-medium">📍 {locationData.name || 'Shared Location'}</p>
              {locationData.lat && locationData.lng && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {locationData.lat.toFixed(4)}, {locationData.lng.toFixed(4)}
                </p>
              )}
            </div>
          )}

          {/* Poll message */}
          {isPoll && pollData && (
            <PollCard poll={pollData} messageId={msg.id} />
          )}

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

          {/* Text content (skip if special type rendered above) */}
          {!isImage && !isFile && !isPoll && !gifData && !locationData && (
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

          {/* Timestamp + status + star */}
          <div className={cn('flex items-center gap-1 mt-1', isMine ? 'justify-end' : 'justify-start')}>
            {isStarred && <Star className="w-3 h-3 text-warning fill-warning" />}
            <span className={cn('text-[10px] tabular-nums', isMine ? 'text-white/60' : 'text-muted-foreground')}>
              {formatMessageTime(msg.created_at)}
            </span>
            {msg.edited_at && <span className={cn('text-[10px]', isMine ? 'text-white/60' : 'text-muted-foreground')}>edited</span>}
            {statusIcon}
          </div>
        </div>

        {/* Reactions display */}
        {reactions && Object.keys(reactions).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1 ml-1">
            {Object.entries(reactions).map(([emoji, userIds]) => (
              <button
                key={emoji}
                onClick={() => onReaction(emoji)}
                className="reaction-badge"
                title={`${(userIds as string[]).length} reaction(s)`}
              >
                <span>{emoji}</span>
                <span className="text-[10px]">{(userIds as string[]).length}</span>
              </button>
            ))}
          </div>
        )}

        {/* Hover actions */}
        <div className={cn(
          'absolute top-0 flex items-center gap-0.5 bg-card rounded-lg shadow-md border border-border p-0.5',
          'opacity-0 group-hover:opacity-100 transition-opacity z-10',
          isMine ? '-left-2 -translate-x-full' : '-right-2 translate-x-full',
        )}>
          <button onClick={onReply} className="w-7 h-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" aria-label="Reply">
            <Reply className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setShowReactions(!showReactions)}
            className="w-7 h-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="React"
          >
            <Smile className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Quick reaction picker */}
        {showReactions && (
          <div className={cn(
            'absolute -top-10 z-20 flex items-center gap-1 bg-card rounded-full shadow-lg border border-border px-2 py-1 animate-appear',
            isMine ? 'right-0' : 'left-0',
          )}>
            {QUICK_REACTIONS.map(r => (
              <button
                key={r.emoji}
                onClick={() => { onReaction(r.emoji); setShowReactions(false); }}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-accent transition-colors text-base"
                title={r.label}
              >
                {r.emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


/* ─── Poll Card ─── */
function PollCard({ poll, messageId }: {
  poll: { question?: string; options?: { text: string; votes?: number }[] };
  messageId: string;
}) {
  const [votedIndex, setVotedIndex] = useState<number | null>(null);
  const totalVotes = poll.options?.reduce((sum, opt) => sum + (opt.votes || 0), 0) || 0;

  const handleVote = async (index: number) => {
    if (votedIndex !== null) return;
    setVotedIndex(index);
    try {
      // Extract poll_id from message metadata or use messageId
      await api.post(`/polls/${messageId}/vote`, { option_index: index });
    } catch { /* ignore */ }
  };

  return (
    <div className="poll-option-card p-3 rounded-xl bg-accent/50 border border-border">
      <div className="flex items-center gap-2 mb-2">
        <BarChart3 className="w-4 h-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">{poll.question || 'Poll'}</p>
      </div>
      <div className="space-y-1.5">
        {poll.options?.map((opt, i) => {
          const pct = totalVotes > 0 ? Math.round(((opt.votes || 0) / totalVotes) * 100) : 0;
          const isVoted = votedIndex === i;
          return (
            <button
              key={i}
              onClick={() => handleVote(i)}
              disabled={votedIndex !== null}
              className={cn(
                'poll-option w-full text-left relative overflow-hidden',
                isVoted && 'ring-2 ring-primary',
              )}
            >
              <div
                className="absolute inset-0 bg-primary/15 rounded-lg transition-all"
                style={{ width: `${pct}%` }}
              />
              <div className="relative flex items-center justify-between px-3 py-2">
                <span className="text-sm text-foreground">{opt.text}</span>
                {(votedIndex !== null || (opt.votes || 0) > 0) && (
                  <span className="text-xs font-medium text-muted-foreground">{pct}%</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
      {totalVotes > 0 && (
        <p className="text-[10px] text-muted-foreground mt-2">{totalVotes} vote{totalVotes !== 1 ? 's' : ''}</p>
      )}
    </div>
  );
}


/* ─── Chat Input ─── */
function ChatInput({
  conversationId, draft, onDraftChange, onSend, onTyping,
  replyTo, onCancelReply, editingMessage, onCancelEdit, onEditMessage,
}: {
  conversationId: string; draft: string; onDraftChange: (text: string) => void;
  onSend: (text: string, replyToId?: string) => void; onTyping: (isTyping: boolean) => void;
  replyTo: Message | null; onCancelReply: () => void;
  editingMessage: Message | null; onCancelEdit: () => void;
  onEditMessage: (messageId: string, newContent: string) => Promise<void>;
}) {
  const [text, setText] = useState(draft);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setText(draft); }, [conversationId, draft]);

  // When editing, populate text
  useEffect(() => {
    if (editingMessage) {
      setText(editingMessage.content || '');
      textareaRef.current?.focus();
    }
  }, [editingMessage]);

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

  // Close emoji picker on outside click
  useEffect(() => {
    if (!showEmojiPicker) return;
    const handler = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) setShowEmojiPicker(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showEmojiPicker]);

  const handleChange = (value: string) => {
    setText(value);
    if (!editingMessage) {
      onDraftChange(value);
      onTyping(true);
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => onTyping(false), 2000);
  };

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;

    if (editingMessage) {
      await onEditMessage(editingMessage.id, trimmed);
      setText('');
      return;
    }

    onSend(trimmed, replyTo?.id);
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
    if (e.key === 'Escape') {
      if (editingMessage) onCancelEdit();
      if (replyTo) onCancelReply();
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

  const handleEmojiSelect = (emoji: string) => {
    const el = textareaRef.current;
    if (el) {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const before = text.slice(0, start);
      const after = text.slice(end);
      const newText = before + emoji + after;
      setText(newText);
      onDraftChange(newText);
      // Restore cursor position after emoji
      setTimeout(() => {
        el.selectionStart = el.selectionEnd = start + emoji.length;
        el.focus();
      }, 0);
    } else {
      setText(text + emoji);
    }
    setShowEmojiPicker(false);
  };

  // Common emoji list for the built-in picker
  const EMOJI_LIST = [
    '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😉',
    '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '🥲',
    '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🫢', '🤫',
    '🤔', '🫡', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄',
    '😬', '😮‍💨', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒',
    '👍', '👎', '👏', '🙌', '🤝', '🙏', '💪', '❤️', '🔥', '💯',
    '⭐', '🎉', '🎊', '💐', '🌹', '🌈', '☀️', '🌙', '✨', '💫',
  ];

  return (
    <div className="flex-shrink-0 bg-card/80 backdrop-blur-xl border-t border-border relative">
      {/* Reply preview bar */}
      {replyTo && (
        <div className="flex items-center gap-3 px-4 py-2 bg-accent/50 border-b border-border animate-appear">
          <Reply className="w-4 h-4 text-primary flex-shrink-0" />
          <div className="flex-1 min-w-0 reply-preview">
            <p className="text-[11px] font-semibold text-primary truncate">
              {replyTo.sender_display_name || replyTo.sender_username || 'User'}
            </p>
            <p className="text-xs text-muted-foreground truncate">{replyTo.content || '🔒 Encrypted'}</p>
          </div>
          <button onClick={onCancelReply} className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Cancel reply">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Edit preview bar */}
      {editingMessage && (
        <div className="flex items-center gap-3 px-4 py-2 bg-warning/10 border-b border-warning/20 animate-appear">
          <Edit3 className="w-4 h-4 text-warning flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-warning">Editing message</p>
            <p className="text-xs text-muted-foreground truncate">{editingMessage.content}</p>
          </div>
          <button onClick={onCancelEdit} className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Cancel edit">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-2 px-4 py-3 relative">
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
            placeholder={editingMessage ? 'Edit message...' : replyTo ? 'Reply...' : 'Type a message...'}
            rows={1}
            className={cn(
              'w-full px-4 py-2.5 bg-secondary rounded-2xl text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none transition-all focus:ring-2 focus:ring-primary/30 focus:bg-accent max-h-40 leading-relaxed border border-transparent focus:border-primary/20',
              editingMessage && 'border-warning/30 focus:border-warning/50 focus:ring-warning/30',
            )}
            aria-label="Message input"
          />
        </div>

        {/* Emoji picker button */}
        <div className="relative" ref={emojiPickerRef}>
          <button
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className={cn(
              'w-9 h-9 rounded-lg flex items-center justify-center transition-colors',
              showEmojiPicker ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
            aria-label="Emoji"
          >
            <Smile className="w-5 h-5" />
          </button>

          {/* Built-in emoji picker */}
          {showEmojiPicker && (
            <div className="absolute bottom-full right-0 mb-2 w-80 max-h-64 bg-card border border-border rounded-xl shadow-xl p-3 z-50 animate-appear overflow-y-auto chat-scrollbar">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Emojis</p>
              <div className="grid grid-cols-8 gap-1">
                {EMOJI_LIST.map(emoji => (
                  <button
                    key={emoji}
                    onClick={() => handleEmojiSelect(emoji)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-accent transition-colors text-lg"
                    aria-label={emoji}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {text.trim() ? (
          <button
            onClick={handleSend}
            className={cn(
              'w-9 h-9 rounded-full flex items-center justify-center shadow-lg animate-appear transition-colors',
              editingMessage
                ? 'bg-warning text-white hover:bg-warning/90 shadow-warning/20'
                : 'bg-primary text-white hover:bg-primary/90 shadow-primary/20',
            )}
            aria-label={editingMessage ? 'Save edit' : 'Send message'}
          >
            {editingMessage ? <Check className="w-4 h-4" /> : <Send className="w-4 h-4" />}
          </button>
        ) : (
          <button className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" aria-label="Voice message">
            <Mic className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
}


/* ─── Message Context Menu ─── */
function MessageContextMenu({
  x, y, message, isMine, onClose, onReply, onEdit, onDelete, onForward,
}: {
  x: number; y: number; message: Message; isMine: boolean; onClose: () => void;
  onReply: () => void; onEdit: () => void; onDelete: () => void; onForward: () => void;
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
      <ContextMenuItem icon={Reply} label="Reply" onClick={onReply} />
      <ContextMenuItem icon={Copy} label="Copy" onClick={() => { navigator.clipboard.writeText(message.content || ''); onClose(); }} />
      <ContextMenuItem icon={Forward} label="Forward" onClick={onForward} />
      <ContextMenuItem icon={Star} label={isStarred ? 'Unstar' : 'Star'} onClick={() => { toggleStarMessage(message.id); onClose(); }} />
      {isMine && (
        <>
          <div className="h-px bg-border my-1" />
          <ContextMenuItem icon={Edit3} label="Edit" onClick={onEdit} />
          <ContextMenuItem icon={Trash2} label="Delete" onClick={onDelete} danger />
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


/* ─── Forward Modal ─── */
function ForwardModal({
  message, conversations, onForward, onClose,
}: {
  message: Message;
  conversations: { id: string; type: string; other_user?: { display_name?: string; username?: string; avatar_url?: string }; group_info?: { name: string; avatar_url?: string } }[];
  onForward: (conversationId: string) => void;
  onClose: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = conversations.filter(c => {
    const name = c.type === 'group'
      ? c.group_info?.name || ''
      : (c.other_user?.display_name || c.other_user?.username || '');
    return name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl animate-appear overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <CornerUpRight className="w-4 h-4 text-primary" /> Forward Message
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-3 border-b border-border">
          <div className="px-3 py-2 bg-accent/50 rounded-lg">
            <p className="text-xs text-muted-foreground truncate">{message.content || '🔒 Encrypted'}</p>
          </div>
        </div>

        <div className="p-3">
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search conversations..."
            className="w-full h-9 px-3 bg-secondary rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 mb-2"
            autoFocus
          />
        </div>

        <div className="max-h-64 overflow-y-auto chat-scrollbar">
          {filtered.map(c => {
            const name = c.type === 'group'
              ? c.group_info?.name || 'Group'
              : c.other_user?.display_name || c.other_user?.username || 'User';
            return (
              <button
                key={c.id}
                onClick={() => onForward(c.id)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-accent transition-colors"
              >
                <Avatar
                  name={name}
                  src={c.type === 'group' ? c.group_info?.avatar_url : c.other_user?.avatar_url}
                  size="sm"
                />
                <span className="text-sm font-medium text-foreground truncate">{name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}


/* ─── Helpers ─── */
function isEncryptedPlaceholder(content: string): boolean {
  if (!content) return false;
  try {
    const parsed = JSON.parse(content);
    return Boolean(parsed.v && parsed.ct) || Boolean(parsed.ciphertext);
  } catch {
    return false;
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
