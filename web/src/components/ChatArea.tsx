'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore, Message } from '@/stores/chatStore';
import { useCallStore } from '@/stores/callStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { getSocket, SOCKET_EVENTS } from '@/lib/socket';
import { formatMessageTime, getInitials, cn } from '@/lib/utils';
import {
  Send, Paperclip, Phone, Video, Lock,
  Check, CheckCheck, Image, File as FileIcon, Smile,
  ArrowLeft, Search, Loader2, Reply, Trash2, X,
  Download, RefreshCw, AlertCircle, Clock,
} from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';

const QUICK_EMOJIS = ['😀', '😂', '❤️', '👍', '🔥', '🎉', '😢', '🤔', '👋', '🙏', '💯', '✨', '😎', '🥳', '😡', '💀'];
const EMOJI_CATEGORIES: Record<string, string[]> = {
  '😀 Smileys': ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '🥲', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥'],
  '❤️ Hearts': ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❤️‍🔥', '💕', '💞', '💓', '💗', '💖', '💝', '💘'],
  '👋 Hands': ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏'],
  '🎉 Objects': ['🎉', '🎊', '🎈', '🔥', '⭐', '🌟', '✨', '💫', '🎯', '🏆', '🥇', '🎮', '🎵', '🎶', '💡', '📱', '💻', '📷', '🔒', '🔑', '🛡️', '⚡', '💯'],
};

interface SearchResult {
  message_id: string;
  sender_display_name?: string;
  sender_username: string;
  snippet: string;
  created_at: string;
}

interface FileData {
  file_id: string;
  filename: string;
  file_size?: number;
  mime_type?: string;
}

export default function ChatArea() {
  const { user } = useAuthStore();
  const {
    activeConversation, conversations, messages, typingUsers,
    sendMessageOptimistic, retryMessage, onlineUsers,
    setActiveConversation, markConversationRead, sendTyping
  } = useChatStore();
  const connectionStatus = useConnectionStore(state => state.status);
  const { initiateCall } = useCallStore();
  const [input, setInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ message: Message; x: number; y: number } | null>(null);
  const [imagePreview, setImagePreview] = useState<{ url: string; name: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const emojiRef = useRef<HTMLDivElement>(null);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  const conversation = conversations.find(c => c.id === activeConversation);
  const conversationMessages = useMemo(() => activeConversation ? (messages[activeConversation] || []) : [], [activeConversation, messages]);
  const conversationMessagesLength = conversationMessages.length;
  const lastMessageId = conversationMessagesLength > 0 ? conversationMessages[conversationMessagesLength - 1].id : null;
  const typing = activeConversation ? (typingUsers[activeConversation] || []) : [];

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [lastMessageId]);

  useEffect(() => {
    if (!activeConversation || !conversationMessages.length) return;

    // Check if there are any unread messages from others
    const hasUnread = conversationMessages.some(
      (m) => m.sender_id !== user?.id && m.status !== 'read'
    );

    if (hasUnread) {
      markConversationRead(activeConversation);
    }
  }, [activeConversation, conversationMessages, user?.id, markConversationRead]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) setShowEmojiPicker(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => {
    const h = () => setContextMenu(null);
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  }, []);

  const handleSend = () => {
    if (!input.trim() || !activeConversation) return;

    // Use optimistic sending
    sendMessageOptimistic(activeConversation, input.trim(), 'text', replyTo?.id);
    setInput('');
    setReplyTo(null);

    // Stop typing indicator
    sendTyping(activeConversation, false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    if (e.key === 'Escape') { setReplyTo(null); setShowEmojiPicker(false); }
  };

  const handleTyping = () => {
    if (!activeConversation) return;
    sendTyping(activeConversation, true);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      sendTyping(activeConversation, false);
    }, 3000);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeConversation) return;
    if (file.size > 100 * 1024 * 1024) { toast.error('File size must be under 100MB'); return; }
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('conversation_id', activeConversation);
      const res = await api.post('/files/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const messageType = file.type.startsWith('image/') ? 'image' : 'file';
      const content = JSON.stringify({ file_id: res.data.file_id, filename: res.data.filename, file_size: res.data.file_size, mime_type: res.data.mime_type });
      sendMessageOptimistic(activeConversation, content, messageType);
      toast.success('File uploaded');
    } catch { toast.error('Failed to upload file'); }
    finally { setIsUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const handleCall = (type: 'audio' | 'video') => {
    if (!conversation?.other_user) return;
    initiateCall(conversation.other_user.user_id, type, conversation.other_user.display_name || conversation.other_user.username);
  };

  const handleDeleteMessage = async (messageId: string, forEveryone: boolean) => {
    try {
      await api.delete(`/messages/${messageId}?for_everyone=${forEveryone}`);
      if (activeConversation) useChatStore.getState().fetchMessages(activeConversation);
      toast.success('Message deleted');
    } catch { toast.error('Failed to delete message'); }
    setContextMenu(null);
  };

  const handleContextMenu = (e: React.MouseEvent, message: Message) => { e.preventDefault(); setContextMenu({ message, x: e.clientX, y: e.clientY }); };

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (value.trim().length < 2) { setSearchResults([]); return; }
    searchDebounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await api.post('/messages/search', { conversation_id: activeConversation, query: value.trim(), limit: 20 });
        setSearchResults(res.data.results || []);
      } catch { toast.error('Search failed'); }
      finally { setIsSearching(false); }
    }, 300);
  };

  const handleEmojiSelect = (emoji: string) => { setInput(prev => prev + emoji); setShowEmojiPicker(false); };

  const handleFilePreview = (fileData: FileData) => {
    if (fileData?.mime_type?.startsWith('image/')) {
      const token = localStorage.getItem('session_token');
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
      const url = `${baseUrl}/files/${fileData.file_id}/download${token ? `?token=${token}` : ''}`;
      setImagePreview({ url, name: fileData.filename });
    }
  };

  const handleFileDownload = async (fileData: FileData) => {
    try {
      const res = await api.get(`/files/${fileData.file_id}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a'); a.href = url; a.download = fileData.filename; a.click();
      window.URL.revokeObjectURL(url);
    } catch { toast.error('Download failed'); }
  };

  const convName = conversation?.type === 'one_to_one' ? (conversation.other_user?.display_name || conversation.other_user?.username || 'Unknown') : (conversation?.group_info?.name || 'Group');
  const isOnline = conversation?.other_user ? onlineUsers.has(conversation.other_user.user_id) : false;

  if (!activeConversation) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="text-center text-[var(--text-muted)]">
          <Lock className="w-16 h-16 mx-auto mb-4 opacity-20" />
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Zynk Messenger</h2>
          <p className="text-sm">Select a conversation or start a new chat</p>
          <p className="text-xs mt-2 text-[var(--text-muted)]">End-to-end encrypted</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[var(--bg-primary)] min-w-0">
      {/* Header */}
      <div className="h-16 px-4 flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => setActiveConversation(null)} className="lg:hidden p-1 rounded hover:bg-[var(--bg-tertiary)] flex-shrink-0">
            <ArrowLeft className="w-5 h-5 text-[var(--text-secondary)]" />
          </button>
          <div className="relative flex-shrink-0">
            <div className={cn('w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-medium', conversation?.type === 'group' ? 'bg-purple-600' : 'bg-zynk-600')}>{getInitials(convName)}</div>
            {conversation?.type === 'one_to_one' && isOnline && <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-[var(--bg-secondary)]" />}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate">{convName}</h3>
            <p className="text-xs text-[var(--text-muted)]">
              {typing.length > 0 ? <span className="text-zynk-400">typing...</span> : isOnline ? <span className="text-green-500">online</span> : 'offline'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => setShowSearch(!showSearch)} className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)]" title="Search"><Search className="w-5 h-5" /></button>
          {conversation?.type === 'one_to_one' && (
            <>
              <button onClick={() => handleCall('audio')} className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)]" title="Voice call"><Phone className="w-5 h-5" /></button>
              <button onClick={() => handleCall('video')} className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)]" title="Video call"><Video className="w-5 h-5" /></button>
            </>
          )}
        </div>
      </div>

      {/* Search bar */}
      {showSearch && (
        <div className="px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-secondary)] flex items-center gap-2">
          <Search className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
          <input type="text" value={searchQuery} onChange={(e) => handleSearch(e.target.value)} className="flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder-[var(--text-muted)]" placeholder="Search in conversation..." autoFocus />
          {isSearching && <Loader2 className="w-4 h-4 animate-spin text-zynk-500" />}
          {searchResults.length > 0 && <span className="text-xs text-[var(--text-muted)]">{searchResults.length} results</span>}
          <button onClick={() => { setShowSearch(false); setSearchQuery(''); setSearchResults([]); }} className="p-1 rounded hover:bg-[var(--bg-tertiary)]"><X className="w-4 h-4 text-[var(--text-secondary)]" /></button>
        </div>
      )}
      {showSearch && searchResults.length > 0 && (
        <div className="max-h-40 overflow-y-auto border-b border-[var(--border)] bg-[var(--bg-secondary)]">
          {searchResults.map((r) => (
            <button key={r.message_id} className="w-full text-left px-4 py-2 hover:bg-[var(--bg-tertiary)] flex items-center gap-2" onClick={() => { setShowSearch(false); setSearchQuery(''); setSearchResults([]); }}>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-zynk-400 font-medium">{r.sender_display_name || r.sender_username}</p>
                <p className="text-sm text-[var(--text-primary)] truncate">{r.snippet}</p>
              </div>
              <span className="text-xs text-[var(--text-muted)] flex-shrink-0">{formatMessageTime(r.created_at)}</span>
            </button>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        <div className="flex justify-center mb-4">
          <span className="text-xs text-[var(--text-muted)] bg-[var(--bg-secondary)] px-3 py-1 rounded-full flex items-center gap-1"><Lock className="w-3 h-3" />Messages are end-to-end encrypted</span>
        </div>
        {conversationMessages.map((msg: Message, i: number) => (
          <MessageBubble key={msg.id} message={msg} isOwn={msg.sender_id === user?.id} showAvatar={i === 0 || conversationMessages[i - 1]?.sender_id !== msg.sender_id}
            onReply={() => setReplyTo(msg)} onContextMenu={(e) => handleContextMenu(e, msg)} onPreview={handleFilePreview} onDownload={handleFileDownload} allMessages={conversationMessages} onRetry={retryMessage} />
        ))}
        {typing.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2">
            <div className="flex space-x-1">
              <div className="w-2 h-2 bg-[var(--text-muted)] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 bg-[var(--text-muted)] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-2 h-2 bg-[var(--text-muted)] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply banner */}
      {replyTo && (
        <div className="px-4 py-2 border-t border-[var(--border)] bg-[var(--bg-secondary)] flex items-center gap-2">
          <Reply className="w-4 h-4 text-zynk-500 flex-shrink-0" />
          <div className="flex-1 min-w-0 border-l-2 border-zynk-500 pl-2">
            <p className="text-xs font-medium text-zynk-400">{replyTo.sender_display_name || replyTo.sender_username || 'You'}</p>
            <p className="text-xs text-[var(--text-secondary)] truncate">{replyTo.encrypted_content}</p>
          </div>
          <button onClick={() => setReplyTo(null)} className="p-1 rounded hover:bg-[var(--bg-tertiary)]"><X className="w-4 h-4 text-[var(--text-muted)]" /></button>
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-[var(--border)] bg-[var(--bg-secondary)] flex-shrink-0">
        <div className="flex items-end gap-2">
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />
          <button onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="p-2.5 rounded-lg hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] transition-colors flex-shrink-0" title="Attach file">
            {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
          </button>
          <div className="relative" ref={emojiRef}>
            <button onClick={() => setShowEmojiPicker(!showEmojiPicker)} className="p-2.5 rounded-lg hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] transition-colors flex-shrink-0" title="Emoji"><Smile className="w-5 h-5" /></button>
            {showEmojiPicker && (
              <div className="absolute bottom-12 left-0 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl shadow-2xl w-72 max-h-80 overflow-hidden z-30">
                <div className="p-2 border-b border-[var(--border)]">
                  <div className="grid grid-cols-8 gap-1">
                    {QUICK_EMOJIS.map(e => <button key={e} onClick={() => handleEmojiSelect(e)} className="w-8 h-8 flex items-center justify-center text-lg hover:bg-[var(--bg-tertiary)] rounded">{e}</button>)}
                  </div>
                </div>
                <div className="max-h-52 overflow-y-auto p-2">
                  {Object.entries(EMOJI_CATEGORIES).map(([cat, emojis]) => (
                    <div key={cat} className="mb-3">
                      <p className="text-xs text-[var(--text-muted)] mb-1 font-medium">{cat}</p>
                      <div className="grid grid-cols-8 gap-1">
                        {emojis.map(e => <button key={e} onClick={() => handleEmojiSelect(e)} className="w-8 h-8 flex items-center justify-center text-lg hover:bg-[var(--bg-tertiary)] rounded">{e}</button>)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="flex-1 relative min-w-0">
            <textarea value={input} onChange={(e) => { setInput(e.target.value); handleTyping(); }} onKeyDown={handleKeyDown}
              className="input-field resize-none py-2.5 pr-4 min-h-[44px] max-h-32 w-full" placeholder="Type a message..." rows={1}
              style={{ height: `${Math.min(Math.max(44, input.split('\n').length * 24 + 20), 128)}px` }} />
          </div>
          <button onClick={handleSend} disabled={!input.trim() || connectionStatus === 'error'}
            className={cn('p-2.5 rounded-lg transition-colors flex-shrink-0', input.trim() && connectionStatus !== 'error' ? 'bg-zynk-600 hover:bg-zynk-700 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]')}
            title={connectionStatus !== 'connected' ? 'Connecting...' : 'Send message'}>
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div className="fixed z-50 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg shadow-2xl py-1 min-w-[160px]" style={{ top: contextMenu.y, left: contextMenu.x }}>
          <button onClick={() => { setReplyTo(contextMenu.message); setContextMenu(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"><Reply className="w-4 h-4" /> Reply</button>
          <button onClick={() => { navigator.clipboard.writeText(contextMenu.message.encrypted_content); toast.success('Copied'); setContextMenu(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg> Copy
          </button>
          {contextMenu.message.sender_id === user?.id && (
            <>
              <div className="border-t border-[var(--border)] my-1" />
              <button onClick={() => handleDeleteMessage(contextMenu.message.id, false)} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"><Trash2 className="w-4 h-4" /> Delete for me</button>
              <button onClick={() => handleDeleteMessage(contextMenu.message.id, true)} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="w-4 h-4" /> Delete for everyone</button>
            </>
          )}
        </div>
      )}

      {/* Image Preview */}
      {imagePreview && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setImagePreview(null)}>
          <button onClick={() => setImagePreview(null)} className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"><X className="w-6 h-6" /></button>
          <div className="max-w-4xl max-h-[80vh]">
            <img src={imagePreview.url} alt={imagePreview.name || 'Preview'} className="max-w-full max-h-[80vh] object-contain rounded-lg" />
            <p className="text-center text-white/60 text-sm mt-2">{imagePreview.name}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message, isOwn, showAvatar, onReply, onContextMenu, onPreview, onDownload, allMessages, onRetry }: {
  message: Message; isOwn: boolean; showAvatar: boolean; onReply: () => void; onContextMenu: (e: React.MouseEvent) => void; onPreview: (d: FileData) => void; onDownload: (d: FileData) => void; allMessages: Message[]; onRetry: (tempId: string) => void;
}) {
  const [showActions, setShowActions] = useState(false);
  const isFileMessage = message.message_type === 'file' || message.message_type === 'image';
  let fileData: FileData | null = null;
  if (isFileMessage) { try { fileData = JSON.parse(message.encrypted_content); } catch { } }
  const replyToId = message.metadata?.reply_to_id;
  const repliedMessage = replyToId ? allMessages.find(m => m.id === replyToId) : null;
  const formatSize = (b: number) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;

  const isPending = message.status === 'pending';
  const isFailed = message.status === 'failed';

  // Render message status indicator
  const renderStatus = () => {
    if (!isOwn) return null;

    if (isFailed) {
      return (
        <button
          onClick={() => message.tempId && onRetry(message.tempId)}
          className="flex items-center gap-1 text-red-400 hover:text-red-300"
          title="Failed to send. Click to retry."
        >
          <AlertCircle className="w-3.5 h-3.5" />
          <RefreshCw className="w-3 h-3" />
        </button>
      );
    }

    if (isPending) {
      return <Clock className="w-3.5 h-3.5 text-white/50 animate-pulse" />;
    }

    switch (message.status) {
      case 'read':
        return <CheckCheck className="w-3.5 h-3.5 text-blue-400 fill-blue-400/20" />;
      case 'delivered':
        return <CheckCheck className="w-3.5 h-3.5 text-white/70" />;
      case 'sent':
      default:
        return <Check className="w-3.5 h-3.5 text-white/50" />;
    }
  };

  return (
    <div className={cn('flex group', isOwn ? 'justify-end' : 'justify-start', !showAvatar && 'mt-0.5')} onContextMenu={onContextMenu} onMouseEnter={() => setShowActions(true)} onMouseLeave={() => setShowActions(false)}>
      <div className={cn('max-w-[70%] flex', isOwn ? 'flex-row-reverse' : 'flex-row', 'items-end gap-2')}>
        {!isOwn && showAvatar && <div className="w-7 h-7 bg-zynk-600 rounded-full flex items-center justify-center text-white text-xs font-medium flex-shrink-0">{getInitials(message.sender_display_name || message.sender_username || '?')}</div>}
        {!isOwn && !showAvatar && <div className="w-7" />}
        <div className="relative">
          {showActions && !isFailed && (
            <div className={cn('absolute -top-6 flex items-center gap-0.5 z-10', isOwn ? 'right-0' : 'left-0')}>
              <button onClick={onReply} className="p-1 bg-[var(--bg-secondary)] rounded shadow text-[var(--text-muted)] hover:text-[var(--text-primary)]" title="Reply"><Reply className="w-3.5 h-3.5" /></button>
            </div>
          )}
          <div className={cn(
            'px-3.5 py-2 rounded-2xl',
            isOwn ? 'rounded-br-md' : 'rounded-bl-md',
            isFailed ? 'bg-red-600/80 text-white' : isPending ? 'bg-zynk-600/70 text-white' : isOwn ? 'bg-zynk-600 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
          )}>
            {!isOwn && showAvatar && message.sender_username && <p className="text-xs font-medium text-zynk-400 mb-0.5">{message.sender_display_name || message.sender_username}</p>}
            {repliedMessage && (
              <div className={cn('mb-1.5 border-l-2 pl-2 py-0.5 rounded-sm text-xs', isOwn ? 'border-white/40 text-white/70' : 'border-zynk-500 text-[var(--text-muted)]')}>
                <p className="font-medium">{repliedMessage.sender_display_name || repliedMessage.sender_username}</p>
                <p className="truncate">{repliedMessage.encrypted_content}</p>
              </div>
            )}
            {isFileMessage && fileData ? (
              <div className={cn('rounded-lg p-2', isOwn ? 'bg-zynk-700' : 'bg-[var(--bg-primary)]')}>
                {message.message_type === 'image' ? (
                  <div className="cursor-pointer" onClick={() => onPreview(fileData!)}>
                    <div className="flex items-center gap-2 mb-1"><Image className="w-4 h-4" /><span className="text-sm font-medium truncate">{fileData!.filename || 'Image'}</span></div>
                    <div className="text-xs opacity-70">{fileData!.file_size && formatSize(fileData!.file_size)} · Click to preview</div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center gap-2 mb-1"><FileIcon className="w-4 h-4 flex-shrink-0" /><span className="text-sm font-medium truncate">{fileData.filename || 'File'}</span></div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs opacity-70">{fileData.file_size && formatSize(fileData.file_size)}</span>
                      <button onClick={() => onDownload(fileData)} className={cn('p-1 rounded hover:opacity-80', isOwn ? 'text-white' : 'text-zynk-500')} title="Download"><Download className="w-4 h-4" /></button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm whitespace-pre-wrap break-words">{message.encrypted_content}</p>
            )}
            <div className={cn('flex items-center gap-1 mt-1', isOwn ? 'justify-end' : 'justify-start')}>
              {message.edited_at && <span className={cn('text-[10px]', isOwn ? 'text-white/50' : 'text-[var(--text-muted)]')}>edited</span>}
              <span className={cn('text-[10px]', isOwn ? 'text-white/60' : 'text-[var(--text-muted)]')}>{formatMessageTime(message.created_at)}</span>
              {isOwn && <span className="text-white/60">{renderStatus()}</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}