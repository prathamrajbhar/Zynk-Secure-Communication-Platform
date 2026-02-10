'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore, Message } from '@/stores/chatStore';
import { useCallStore } from '@/stores/callStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { formatMessageTime, getInitials, cn, getAvatarColor } from '@/lib/utils';
import {
  Send, Paperclip, Phone, Video, Lock, Shield,
  Check, CheckCheck, Image as ImageIcon, Smile,
  ArrowLeft, Search, Loader2, Reply, Trash2, X,
  Download, RefreshCw, AlertCircle, Clock, Mic, Users,
  Star, Pin, Forward, MoreHorizontal,
} from 'lucide-react';
import { isValidEncryptedMessage } from '@/lib/crypto';
import api from '@/lib/api';
import axios from 'axios';
import toast from 'react-hot-toast';
import GroupInfoPanel from './GroupInfoPanel';
import SafetyNumberModal from './SafetyNumberModal';
import MessageContextMenu from './MessageContextMenu';
import ForwardMessageModal from './ForwardMessageModal';
import EditMessageModal from './EditMessageModal';
import MessageInfoModal from './MessageInfoModal';
import MessageSelectionBar from './MessageSelectionBar';
import ChatAreaBackgroundMenu from './ChatAreaBackgroundMenu';

const QUICK_EMOJIS = ['😀', '😂', '❤️', '👍', '🔥', '🎉', '😢', '🤔', '👋', '🙏', '💯', '✨', '😎', '🥳', '😡', '💀'];
const EMOJI_CATEGORIES: Record<string, string[]> = {
  '😀 Smileys': ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '🥲', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥'],
  '❤️ Hearts': ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❤️‍🔥', '💕', '💞', '💓', '💗', '💖', '💝', '💘'],
  '👋 Hands': ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏'],
  '🎉 Objects': ['🎉', '🎊', '🎈', '🔥', '⭐', '🌟', '✨', '💫', '🎯', '🏆', '🥇', '🎮', '🎵', '🎶', '💡', '📱', '💻', '📷', '🔒', '🔑', '🛡️', '⚡', '💯'],
};

interface SearchResult { message_id: string; sender_display_name?: string; sender_username: string; snippet: string; created_at: string; }
interface FileData { file_id: string; filename: string; file_size?: number; mime_type?: string; thumbnail_path?: string; }

// ── Authenticated image loading (server requires Bearer token) ──
const blobUrlCache = new Map<string, string>();

async function getAuthBlobUrl(endpoint: string): Promise<string> {
  const cached = blobUrlCache.get(endpoint);
  if (cached) return cached;
  const res = await api.get(endpoint, { responseType: 'blob', timeout: 60000 });
  const url = URL.createObjectURL(res.data);
  blobUrlCache.set(endpoint, url);
  return url;
}

function AuthImage({ fileId, className, onClick, useThumbnail = false }: {
  fileId: string; className?: string; onClick?: () => void; useThumbnail?: boolean;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const endpoint = useThumbnail ? `/files/${fileId}/thumbnail` : `/files/${fileId}/download`;
    getAuthBlobUrl(endpoint)
      .then(url => { if (!cancelled) setSrc(url); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [fileId, useThumbnail]);

  if (loading) {
    return (
      <div className={cn('animate-pulse bg-white/10 rounded-xl flex items-center justify-center min-h-[120px]', className)}>
        <Loader2 className="w-6 h-6 animate-spin opacity-40" />
      </div>
    );
  }
  if (error || !src) {
    return (
      <div className={cn('bg-white/10 rounded-xl flex flex-col items-center justify-center gap-1 min-h-[120px]', className)}>
        <ImageIcon className="w-6 h-6 opacity-40" />
        <span className="text-[10px] opacity-40">Failed to load</span>
      </div>
    );
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={src}
      className={cn('rounded-xl cursor-pointer object-cover', className)}
      onClick={onClick}
      alt="Shared image"
      loading="lazy"
    />
  );
}

function getFileTypeInfo(mimeType?: string, filename?: string) {
  const ext = filename?.split('.').pop()?.toLowerCase() || '';
  if (mimeType?.startsWith('audio/')) return { color: 'bg-purple-500', label: 'Audio', icon: '🎵' };
  if (mimeType?.startsWith('video/')) return { color: 'bg-pink-500', label: 'Video', icon: '🎬' };
  if (mimeType === 'application/pdf' || ext === 'pdf') return { color: 'bg-red-500', label: 'PDF', icon: '📄' };
  if (['doc', 'docx'].includes(ext)) return { color: 'bg-blue-500', label: 'DOC', icon: '📝' };
  if (['xls', 'xlsx'].includes(ext)) return { color: 'bg-green-600', label: 'XLS', icon: '📊' };
  if (['ppt', 'pptx'].includes(ext)) return { color: 'bg-orange-500', label: 'PPT', icon: '📑' };
  if (['zip', 'gz', 'rar', '7z', 'tar'].includes(ext)) return { color: 'bg-yellow-600', label: 'ZIP', icon: '📦' };
  if (['mp3', 'wav', 'ogg', 'aac', 'flac'].includes(ext)) return { color: 'bg-purple-500', label: ext.toUpperCase(), icon: '🎵' };
  if (['mp4', 'mkv', 'avi', 'mov', 'webm'].includes(ext)) return { color: 'bg-pink-500', label: ext.toUpperCase(), icon: '🎬' };
  if (['txt', 'md', 'csv', 'json', 'xml'].includes(ext)) return { color: 'bg-gray-500', label: ext.toUpperCase(), icon: '📃' };
  return { color: 'bg-slate-500', label: ext.toUpperCase() || 'FILE', icon: '📎' };
}

export default function ChatArea() {
  const { user } = useAuthStore();
  const {
    activeConversation, conversations, messages, typingUsers,
    sendMessageOptimistic, retryMessage, onlineUsers,
    setActiveConversation, markConversationRead, sendTyping,
    starredMessages, pinnedMessages, toggleStarMessage, togglePinMessage, editMessage,
    clearChatHistory, deleteConversation,
  } = useChatStore();
  const connectionStatus = useConnectionStore(state => state.status);
  const { initiateCall } = useCallStore();
  const [input, setInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ message: Message; x: number; y: number } | null>(null);
  const [imagePreview, setImagePreview] = useState<{ url: string; name: string } | null>(null);
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [showSafetyNumber, setShowSafetyNumber] = useState(false);

  // New feature states
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [forwardMessages, setForwardMessages] = useState<Message[]>([]);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [messageInfoTarget, setMessageInfoTarget] = useState<Message | null>(null);
  const [backgroundMenu, setBackgroundMenu] = useState<{ x: number; y: number } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ messageId: string; forEveryone: boolean } | null>(null);
  const [showPinnedOverlay, setShowPinnedOverlay] = useState(false);

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
    const hasUnread = conversationMessages.some((m) => m.sender_id !== user?.id && m.status !== 'read');
    if (hasUnread) markConversationRead(activeConversation);
  }, [activeConversation, conversationMessages, user?.id, markConversationRead]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) setShowEmojiPicker(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Exit selection mode when conversation changes
  useEffect(() => {
    setSelectionMode(false);
    setSelectedMessages(new Set());
  }, [activeConversation]);

  const handleSend = () => {
    if (!input.trim() || !activeConversation) return;
    sendMessageOptimistic(activeConversation, input.trim(), 'text', replyTo?.id);
    setInput(''); setReplyTo(null);
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
    typingTimeoutRef.current = setTimeout(() => { sendTyping(activeConversation, false); }, 3000);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeConversation) return;
    if (file.size > 50 * 1024 * 1024) { toast.error('File size must be under 50MB'); return; }

    // Validate file type client-side before uploading
    const BLOCKED_EXTENSIONS = ['.exe', '.bat', '.cmd', '.com', '.msi', '.scr', '.pif', '.js', '.vbs', '.ps1', '.sh', '.php'];
    const ext = '.' + (file.name.split('.').pop()?.toLowerCase() || '');
    if (BLOCKED_EXTENSIONS.includes(ext)) {
      toast.error('This file type is not allowed');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('conversation_id', activeConversation);
      const res = await api.post('/files/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000, // 2 min timeout for large files
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const pct = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(pct);
          }
        },
      });
      const messageType = file.type.startsWith('image/') ? 'image' : 'file';
      const content = JSON.stringify({
        file_id: res.data.file_id,
        filename: res.data.filename,
        file_size: res.data.file_size,
        mime_type: res.data.mime_type,
        thumbnail_path: res.data.thumbnail_path || null,
      });
      sendMessageOptimistic(activeConversation, content, messageType);
      toast.success('File uploaded');
    } catch (err: unknown) {
      const errorMsg =
        (axios.isAxiosError(err) && (err.response?.data as { error?: string } | undefined)?.error)
        || 'Failed to upload file';
      toast.error(errorMsg);
    }
    finally { setIsUploading(false); setUploadProgress(0); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const handleCall = (type: 'audio' | 'video') => {
    if (!conversation?.other_user) return;
    initiateCall(conversation.other_user.user_id, type, conversation.other_user.display_name || conversation.other_user.username);
  };

  const handleDeleteMessage = async (messageId: string, forEveryone: boolean) => {
    try {
      await api.delete(`/messages/${messageId}?for_everyone=${forEveryone}`);
      if (activeConversation) useChatStore.getState().fetchMessages(activeConversation);
      toast.success(forEveryone ? 'Deleted for everyone' : 'Deleted for you');
    } catch { toast.error('Failed to delete message'); }
    setContextMenu(null);
    setDeleteConfirm(null);
  };

  const handleDeleteWithConfirm = (messageId: string, forEveryone: boolean) => {
    setDeleteConfirm({ messageId, forEveryone });
    setContextMenu(null);
  };

  const handleContextMenu = (e: React.MouseEvent, message: Message) => {
    e.preventDefault();
    e.stopPropagation();
    setBackgroundMenu(null);
    setContextMenu({ message, x: e.clientX, y: e.clientY });
  };

  const handleBackgroundContextMenu = (e: React.MouseEvent) => {
    // Only show if not clicking on a message bubble
    const target = e.target as HTMLElement;
    if (target.closest('.message-bubble-wrapper')) return;
    e.preventDefault();
    setContextMenu(null);
    setBackgroundMenu({ x: e.clientX, y: e.clientY });
  };

  const handleClearChatFromMenu = async () => {
    if (!activeConversation) return;
    try {
      await clearChatHistory(activeConversation);
      toast.success('Chat cleared');
    } catch { toast.error('Failed to clear chat'); }
    setBackgroundMenu(null);
  };

  const handleScrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setBackgroundMenu(null);
  };

  // ── New feature handlers ──

  const handleToggleSelect = (messageId: string) => {
    setSelectedMessages(prev => {
      const updated = new Set(prev);
      if (updated.has(messageId)) updated.delete(messageId);
      else updated.add(messageId);
      return updated;
    });
  };

  const handleExitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedMessages(new Set());
  };

  const handleBulkDelete = async () => {
    const ids = [...selectedMessages];
    for (const id of ids) {
      await handleDeleteMessage(id, false);
    }
    handleExitSelectionMode();
  };

  const handleBulkForward = () => {
    const msgs = conversationMessages.filter(m => selectedMessages.has(m.id));
    setForwardMessages(msgs);
    setShowForwardModal(true);
    handleExitSelectionMode();
  };

  const handleBulkStar = () => {
    [...selectedMessages].forEach(id => toggleStarMessage(id));
    handleExitSelectionMode();
    toast.success('Messages starred');
  };

  const handleBulkCopy = () => {
    const msgs = conversationMessages
      .filter(m => selectedMessages.has(m.id))
      .map(m => m.content || m.encrypted_content || '')
      .join('\n\n');
    navigator.clipboard.writeText(msgs);
    toast.success('Copied to clipboard');
    handleExitSelectionMode();
  };

  const handleForwardSingle = (message: Message) => {
    setForwardMessages([message]);
    setShowForwardModal(true);
  };

  const handleEditMessage = async (newContent: string) => {
    if (!editingMessage) return;
    try {
      await editMessage(editingMessage.id, newContent);
      toast.success('Message edited');
    } catch {
      toast.error('Failed to edit message');
    }
    setEditingMessage(null);
  };

  const handleCopyMessage = (message: Message) => {
    navigator.clipboard.writeText(message.content || message.encrypted_content);
    toast.success('Copied');
  };

  const handleReaction = (emoji: string) => {
    // For now, reactions are shown as a toast since the server doesn't support reactions yet
    toast.success(`Reacted ${emoji}`);
  };

  // Get pinned messages for current conversation
  const currentPinnedMessageIds = activeConversation ? (pinnedMessages[activeConversation] || []) : [];
  const currentPinnedMessages = conversationMessages.filter(m => currentPinnedMessageIds.includes(m.id));

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

  const handleFilePreview = async (fileData: FileData) => {
    if (fileData?.mime_type?.startsWith('image/')) {
      try {
        const url = await getAuthBlobUrl(`/files/${fileData.file_id}/download`);
        setImagePreview({ url, name: fileData.filename });
      } catch {
        toast.error('Failed to load image');
      }
    }
  };

  const handleFileDownload = async (fileData: FileData) => {
    try {
      const res = await api.get(`/files/${fileData.file_id}/download`, { responseType: 'blob', timeout: 120000 });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a'); a.href = url; a.download = fileData.filename; a.click();
      window.URL.revokeObjectURL(url);
    } catch { toast.error('Download failed'); }
  };

  const convName = conversation?.type === 'one_to_one'
    ? (conversation.other_user?.display_name || conversation.other_user?.username || 'Unknown')
    : (conversation?.group_info?.name || 'Group');
  const isOnline = conversation?.other_user ? onlineUsers.has(conversation.other_user.user_id) : false;
  const color = conversation?.type === 'group' ? 'bg-violet-500' : getAvatarColor(convName);

  /* ── Empty state ── */
  if (!activeConversation) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[var(--bg-app)] relative">
        <div className="absolute inset-0 bg-[var(--gradient-surface)] pointer-events-none" />
        <div className="text-center relative z-10 animate-appear px-8">
          <div className="relative inline-block mb-8">
            <div className="w-24 h-24 rounded-3xl bg-[var(--accent-subtle)] flex items-center justify-center mx-auto">
              <Lock className="w-10 h-10 text-[var(--accent)]" />
            </div>
            <div className="absolute -inset-3 rounded-[28px] border-2 border-dashed border-[var(--accent-muted)] animate-pulse opacity-40" />
          </div>
          <h2 className="text-2xl font-extrabold text-[var(--text-primary)] mb-3 tracking-tight">Zynk</h2>
          <p className="text-sm text-[var(--text-muted)] max-w-xs mx-auto leading-relaxed">
            Select a conversation to start messaging securely.
          </p>
          <div className="flex items-center justify-center gap-1.5 mt-6 text-xs text-[var(--text-muted)]">
            <Shield className="w-3.5 h-3.5" />
            <span>End-to-end encrypted</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[var(--bg-app)] min-w-0">
      {/* Header — selection mode or normal */}
      {selectionMode ? (
        <MessageSelectionBar
          selectedCount={selectedMessages.size}
          totalCount={conversationMessages.length}
          onClose={handleExitSelectionMode}
          onDelete={handleBulkDelete}
          onForward={handleBulkForward}
          onStar={handleBulkStar}
          onCopy={handleBulkCopy}
          onSelectAll={() => {
            if (selectedMessages.size === conversationMessages.length) {
              setSelectedMessages(new Set());
            } else {
              setSelectedMessages(new Set(conversationMessages.map(m => m.id)));
            }
          }}
        />
      ) : (
      <div className="h-[64px] px-4 flex items-center justify-between chat-header flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => setActiveConversation(null)} className="lg:hidden p-1.5 rounded-full hover:bg-[var(--hover)] flex-shrink-0 transition-all active:scale-90">
            <ArrowLeft className="w-5 h-5 text-[var(--text-secondary)]" />
          </button>
          <div className="relative">
            <div className={cn('w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0 cursor-pointer shadow-sm transition-transform hover:scale-105', color)}>
              {getInitials(convName)}
            </div>
            {isOnline && (
              <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-[var(--success)] rounded-full border-[2.5px] border-[var(--bg-surface)] online-pulse" />
            )}
          </div>
          <div className="min-w-0">
            <h3 className="text-[15px] font-bold text-[var(--text-primary)] truncate">{convName}</h3>
            <p className="text-xs text-[var(--text-muted)] leading-tight">
              {typing.length > 0
                ? <span className="text-[var(--accent)] font-medium flex items-center gap-1">
                  <span className="flex gap-0.5"><span className="typing-dot" style={{ width: '4px', height: '4px' }} /><span className="typing-dot" style={{ width: '4px', height: '4px' }} /><span className="typing-dot" style={{ width: '4px', height: '4px' }} /></span>
                  typing
                </span>
                : isOnline
                  ? <span className="text-[var(--success)] flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[var(--success)]" /> online</span>
                  : 'offline'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {conversation?.type === 'one_to_one' && (
            <>
              <button onClick={() => setShowSafetyNumber(true)} className="btn-icon" title="Verify encryption">
                <Shield className="w-[18px] h-[18px]" />
              </button>
              <button onClick={() => handleCall('video')} className="btn-icon">
                <Video className="w-[18px] h-[18px]" />
              </button>
              <button onClick={() => handleCall('audio')} className="btn-icon">
                <Phone className="w-[18px] h-[18px]" />
              </button>
            </>
          )}
          {conversation?.type === 'group' && conversation.group_info && (
            <button onClick={() => setShowGroupInfo(true)} className="btn-icon" title="Group info">
              <Users className="w-[18px] h-[18px]" />
            </button>
          )}
          <button onClick={() => setShowSearch(!showSearch)} className="btn-icon">
            <Search className="w-[18px] h-[18px]" />
          </button>
        </div>
      </div>
      )}

      {/* Pinned message banner */}
      {!selectionMode && currentPinnedMessages.length > 0 && (
        <button onClick={() => setShowPinnedOverlay(true)}
          className="w-full px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-surface)] animate-fade-in hover:bg-[var(--hover)] transition-colors text-left">
          <div className="flex items-center gap-2">
            <Pin className="w-3.5 h-3.5 text-[var(--accent)] flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-[var(--accent)]">
                {currentPinnedMessages.length} Pinned Message{currentPinnedMessages.length > 1 ? 's' : ''}
              </p>
              <p className="text-xs text-[var(--text-muted)] truncate">
                {currentPinnedMessages[currentPinnedMessages.length - 1]?.content || '🔒 Encrypted message'}
              </p>
            </div>
          </div>
        </button>
      )}

      {/* Search bar */}
      {showSearch && (
        <div className="px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-surface)] flex items-center gap-3 animate-fade-in">
          <Search className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
          <input type="text" value={searchQuery} onChange={(e) => handleSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder-[var(--text-muted)]"
            placeholder="Search in conversation..." autoFocus />
          {isSearching && <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)]" />}
          {searchResults.length > 0 && <span className="text-xs text-[var(--text-muted)]">{searchResults.length} found</span>}
          <button onClick={() => { setShowSearch(false); setSearchQuery(''); setSearchResults([]); }} className="p-1 rounded hover:bg-[var(--hover)]">
            <X className="w-4 h-4 text-[var(--text-muted)]" />
          </button>
        </div>
      )}
      {showSearch && searchResults.length > 0 && (
        <div className="max-h-40 overflow-y-auto border-b border-[var(--border)] bg-[var(--bg-surface)]">
          {searchResults.map((r) => (
            <button key={r.message_id} className="w-full text-left px-4 py-2.5 hover:bg-[var(--hover)] transition-colors"
              onClick={() => { setShowSearch(false); setSearchQuery(''); setSearchResults([]); }}>
              <p className="text-xs text-[var(--accent)] font-medium">{r.sender_display_name || r.sender_username}</p>
              <p className="text-sm text-[var(--text-primary)] truncate">{r.snippet}</p>
            </button>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 lg:px-16 py-4 bg-[var(--bg-app)] chat-messages-bg scroll-thin"
        onContextMenu={handleBackgroundContextMenu}>
        <div className="flex justify-center mb-8">
          <span className="text-[11px] text-[var(--text-muted)] bg-[var(--bg-wash)] px-5 py-2 rounded-full flex items-center gap-2 border border-[var(--border)] shadow-soft">
            <Lock className="w-3 h-3" /> Messages are end-to-end encrypted
          </span>
        </div>
        {conversationMessages.map((msg: Message, i: number) => (
          <div key={msg.id} className="message-bubble-wrapper">
            <MessageBubble message={msg} isOwn={msg.sender_id === user?.id}
              showName={i === 0 || conversationMessages[i - 1]?.sender_id !== msg.sender_id}
              onReply={() => setReplyTo(msg)} onContextMenu={(e) => handleContextMenu(e, msg)}
              onPreview={handleFilePreview} onDownload={handleFileDownload}
              allMessages={conversationMessages} onRetry={retryMessage}
              isStarred={starredMessages.has(msg.id)}
              isPinned={currentPinnedMessageIds.includes(msg.id)}
              selectionMode={selectionMode}
              isSelected={selectedMessages.has(msg.id)}
              onToggleSelect={() => handleToggleSelect(msg.id)} />
          </div>
        ))}
        {typing.length > 0 && (
          <div className="flex items-start gap-2 mt-2">
            <div className="bg-[var(--bg-wash)] rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex items-center gap-1">
                <div className="typing-dot" />
                <div className="typing-dot" />
                <div className="typing-dot" />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply banner */}
      {replyTo && (
        <div className="mx-4 px-3 py-2 rounded-t-lg bg-[var(--bg-wash)] flex items-center gap-3 border-l-[3px] border-[var(--accent)] animate-fade-in">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-[var(--accent)]">{replyTo.sender_display_name || replyTo.sender_username || 'You'}</p>
            <p className="text-xs text-[var(--text-muted)] truncate">
              {replyTo.content && !isValidEncryptedMessage(replyTo.content)
                ? replyTo.content
                : '🔒 Encrypted message'}
            </p>
          </div>
          <button onClick={() => setReplyTo(null)} className="p-1 rounded hover:bg-[var(--hover)]">
            <X className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          </button>
        </div>
      )}

      {/* Upload progress bar */}
      {isUploading && (
        <div className="px-4 py-2 border-t border-[var(--border)] bg-[var(--bg-surface)]">
          <div className="flex items-center gap-3">
            <Paperclip className="w-4 h-4 text-[var(--accent)] flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-[var(--text-secondary)]">Uploading file...</span>
                <span className="text-xs font-bold text-[var(--accent)]">{uploadProgress}%</span>
              </div>
              <div className="w-full h-1.5 bg-[var(--bg-wash)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[var(--accent)] rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="px-4 pb-4 pt-2.5 flex-shrink-0 chat-input-bar">
        <div className="flex items-end gap-2.5">
          <div className="flex items-center gap-0.5 pb-0.5">
            <div className="relative" ref={emojiRef}>
              <button onClick={() => setShowEmojiPicker(!showEmojiPicker)} className="btn-icon">
                <Smile className="w-5 h-5" />
              </button>
              {showEmojiPicker && (
                <div className="absolute bottom-11 left-0 bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl shadow-overlay w-72 max-h-72 overflow-hidden z-30 animate-scale-in">
                  <div className="p-2.5 border-b border-[var(--border)]">
                    <div className="grid grid-cols-8 gap-0.5">
                      {QUICK_EMOJIS.map(e => (
                        <button key={e} onClick={() => handleEmojiSelect(e)} className="w-8 h-8 flex items-center justify-center text-lg hover:bg-[var(--hover)] rounded-lg transition-colors">{e}</button>
                      ))}
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto p-2.5">
                    {Object.entries(EMOJI_CATEGORIES).map(([cat, emojis]) => (
                      <div key={cat} className="mb-2">
                        <p className="text-xs text-[var(--text-muted)] mb-1 px-1">{cat}</p>
                        <div className="grid grid-cols-8 gap-0.5">
                          {emojis.map(e => (
                            <button key={e} onClick={() => handleEmojiSelect(e)} className="w-8 h-8 flex items-center justify-center text-lg hover:bg-[var(--hover)] rounded transition-colors">{e}</button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />
            <button onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="btn-icon">
              {isUploading ? <Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" /> : <Paperclip className="w-5 h-5" />}
            </button>
          </div>

          <div className="flex-1 min-w-0">
            <textarea value={input} onChange={(e) => { setInput(e.target.value); handleTyping(); }} onKeyDown={handleKeyDown}
              className="input-field resize-none !rounded-2xl !py-2.5 !border-[var(--border)]"
              placeholder="Type a message..." rows={1}
              style={{ height: `${Math.min(Math.max(40, input.split('\n').length * 22 + 18), 120)}px` }} />
          </div>

          <div className="pb-0.5">
            {input.trim() ? (
              <button onClick={handleSend} disabled={connectionStatus === 'error'}
                className="w-10 h-10 rounded-full bg-[var(--accent)] text-white flex items-center justify-center transition-all duration-200 hover:bg-[var(--accent-hover)] active:scale-90 shadow-md shadow-[var(--accent-muted)] hover:shadow-lg hover:shadow-[var(--accent-muted)]">
                <Send className="w-[18px] h-[18px] ml-0.5" />
              </button>
            ) : (
              <button className="btn-icon">
                <Mic className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Enhanced Context menu */}
      {contextMenu && (
        <MessageContextMenu
          message={contextMenu.message}
          x={contextMenu.x}
          y={contextMenu.y}
          isOwn={contextMenu.message.sender_id === user?.id}
          isStarred={starredMessages.has(contextMenu.message.id)}
          isPinned={currentPinnedMessageIds.includes(contextMenu.message.id)}
          onClose={() => setContextMenu(null)}
          onReply={() => { setReplyTo(contextMenu.message); setContextMenu(null); }}
          onCopy={() => { handleCopyMessage(contextMenu.message); setContextMenu(null); }}
          onForward={() => { handleForwardSingle(contextMenu.message); setContextMenu(null); }}
          onStar={() => { toggleStarMessage(contextMenu.message.id); setContextMenu(null); toast.success(starredMessages.has(contextMenu.message.id) ? 'Unstarred' : 'Starred'); }}
          onPin={() => { activeConversation && togglePinMessage(activeConversation, contextMenu.message.id); setContextMenu(null); toast.success(currentPinnedMessageIds.includes(contextMenu.message.id) ? 'Unpinned' : 'Pinned'); }}
          onEdit={() => { setEditingMessage(contextMenu.message); setContextMenu(null); }}
          onSelect={() => { setSelectionMode(true); setSelectedMessages(new Set([contextMenu.message.id])); setContextMenu(null); }}
          onDeleteForMe={() => handleDeleteWithConfirm(contextMenu.message.id, false)}
          onDeleteForEveryone={() => handleDeleteWithConfirm(contextMenu.message.id, true)}
          onInfo={() => { setMessageInfoTarget(contextMenu.message); setContextMenu(null); }}
          onReaction={handleReaction}
        />
      )}

      {/* Background Context Menu (right-click on empty chat area) */}
      {backgroundMenu && (
        <ChatAreaBackgroundMenu
          x={backgroundMenu.x}
          y={backgroundMenu.y}
          hasPinnedMessages={currentPinnedMessages.length > 0}
          onClose={() => setBackgroundMenu(null)}
          onSelectAll={() => { setSelectionMode(true); setSelectedMessages(new Set(conversationMessages.map(m => m.id))); setBackgroundMenu(null); }}
          onClearChat={handleClearChatFromMenu}
          onScrollToBottom={handleScrollToBottom}
          onSearchInChat={() => { setShowSearch(true); setBackgroundMenu(null); }}
          onViewPinned={() => { setShowPinnedOverlay(true); setBackgroundMenu(null); }}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 animate-fade-in" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-[var(--bg-surface)] rounded-2xl w-full max-w-sm p-6 shadow-overlay border border-[var(--border)] animate-scale-in"
            onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-[var(--text-primary)] mb-2">
              {deleteConfirm.forEveryone ? 'Delete for everyone?' : 'Delete message?'}
            </h3>
            <p className="text-sm text-[var(--text-muted)] mb-5">
              {deleteConfirm.forEveryone
                ? 'This message will be deleted for all participants in this chat.'
                : 'This message will only be deleted for you. Others can still see it.'}
            </p>
            <div className="flex items-center gap-2 justify-end">
              <button onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-sm font-medium text-[var(--text-secondary)] rounded-xl hover:bg-[var(--hover)] transition-colors">
                Cancel
              </button>
              <button
                onClick={() => handleDeleteMessage(deleteConfirm.messageId, deleteConfirm.forEveryone)}
                className="px-4 py-2 text-sm font-semibold text-white bg-[var(--danger)] rounded-xl hover:brightness-110 transition-all active:scale-[0.98]">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Preview — fullscreen lightbox */}
      {imagePreview && (
        <div className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-4 animate-fade-in" onClick={() => setImagePreview(null)}>
          <div className="absolute top-6 right-6 flex items-center gap-2 z-10">
            <a
              href={imagePreview.url}
              download={imagePreview.name}
              onClick={(e) => e.stopPropagation()}
              className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all active:scale-90"
              title="Download"
            >
              <Download className="w-5 h-5" />
            </a>
            <button onClick={() => setImagePreview(null)} className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all active:scale-90">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="max-w-4xl max-h-[85vh] animate-scale-in">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imagePreview.url} alt={imagePreview.name || 'Image preview'} className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl" />
            <p className="text-center text-white/50 text-sm mt-4 font-medium">{imagePreview.name}</p>
          </div>
        </div>
      )}

      {/* Group Info Panel */}
      {showGroupInfo && conversation?.type === 'group' && conversation.group_info && (
        <GroupInfoPanel
          groupId={conversation.group_info.group_id}
          onClose={() => setShowGroupInfo(false)}
        />
      )}

      {/* Safety Number Modal */}
      {conversation?.type === 'one_to_one' && (
        <SafetyNumberModal
          isOpen={showSafetyNumber}
          onClose={() => setShowSafetyNumber(false)}
          userId={conversation.other_user?.user_id || ''}
          userName={convName}
        />
      )}

      {/* Forward Message Modal */}
      <ForwardMessageModal
        isOpen={showForwardModal}
        messages={forwardMessages}
        onClose={() => { setShowForwardModal(false); setForwardMessages([]); }}
      />

      {/* Edit Message Modal */}
      <EditMessageModal
        isOpen={!!editingMessage}
        originalContent={editingMessage?.content || editingMessage?.encrypted_content || ''}
        onClose={() => setEditingMessage(null)}
        onSave={handleEditMessage}
      />

      {/* Message Info Modal */}
      {messageInfoTarget && (
        <MessageInfoModal
          isOpen={!!messageInfoTarget}
          message={messageInfoTarget}
          onClose={() => setMessageInfoTarget(null)}
        />
      )}

      {/* Pinned Messages Overlay */}
      {showPinnedOverlay && currentPinnedMessages.length > 0 && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 animate-fade-in" onClick={() => setShowPinnedOverlay(false)}>
          <div className="bg-[var(--bg-surface)] rounded-2xl w-full max-w-md max-h-[70vh] flex flex-col shadow-overlay border border-[var(--border)] animate-scale-in overflow-hidden"
            onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <Pin className="w-4 h-4 text-[var(--accent)]" />
                <h3 className="text-base font-bold text-[var(--text-primary)]">Pinned Messages</h3>
                <span className="text-xs text-[var(--text-muted)] bg-[var(--bg-wash)] px-2 py-0.5 rounded-full">{currentPinnedMessages.length}</span>
              </div>
              <button onClick={() => setShowPinnedOverlay(false)} className="p-1.5 rounded-full hover:bg-[var(--hover)] transition-colors">
                <X className="w-5 h-5 text-[var(--text-muted)]" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {currentPinnedMessages.map(msg => (
                <div key={msg.id} className="bg-[var(--bg-wash)] rounded-xl p-3 border border-[var(--border)]">
                  <p className="text-xs text-[var(--accent)] font-medium mb-1">{msg.sender_display_name || msg.sender_username || 'You'}</p>
                  <p className="text-sm text-[var(--text-primary)] line-clamp-3">{msg.content || '🔒 Encrypted message'}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[10px] text-[var(--text-muted)]">{formatMessageTime(msg.created_at)}</span>
                    <button onClick={() => { activeConversation && togglePinMessage(activeConversation, msg.id); }}
                      className="text-xs text-[var(--danger)] hover:underline">Unpin</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Message Bubble ── */

function MessageBubble({ message, isOwn, showName, onReply, onContextMenu, onPreview, onDownload, allMessages, onRetry, isStarred, isPinned, selectionMode, isSelected, onToggleSelect }: {
  message: Message; isOwn: boolean; showName: boolean;
  onReply: () => void; onContextMenu: (e: React.MouseEvent) => void;
  onPreview: (d: FileData) => void; onDownload: (d: FileData) => void;
  allMessages: Message[]; onRetry: (tempId: string) => void;
  isStarred: boolean; isPinned: boolean;
  selectionMode: boolean; isSelected: boolean; onToggleSelect: () => void;
}) {
  const [showActions, setShowActions] = useState(false);
  const isFileMessage = message.message_type === 'file' || message.message_type === 'image';

  // Parse file data from decrypted content first, fall back to encrypted_content
  let fileData: FileData | null = null;
  if (isFileMessage) {
    // Try decrypted content first, then raw encrypted_content
    const candidates = [message.content, message.encrypted_content].filter(Boolean);
    for (const raw of candidates) {
      try {
        const parsed = JSON.parse(raw!);
        if (parsed.file_id) { fileData = parsed; break; }
      } catch { /* not valid JSON or not file data */ }
    }
  }

  const replyToId = message.metadata?.reply_to_id;
  const repliedMessage = replyToId ? allMessages.find(m => m.id === replyToId) : null;
  const formatSize = (b: number) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;
  const isPending = message.status === 'pending';
  const isFailed = message.status === 'failed';
  const isImage = message.message_type === 'image' && fileData?.file_id;

  const renderStatus = () => {
    if (!isOwn) return null;
    if (isFailed) return (
      <button onClick={() => message.tempId && onRetry(message.tempId)} className="flex items-center gap-0.5 text-red-400" title="Retry">
        <AlertCircle className="w-3 h-3" /><RefreshCw className="w-2.5 h-2.5" />
      </button>
    );
    if (isPending) return <Clock className="w-3 h-3 opacity-50 animate-pulse" />;
    switch (message.status) {
      case 'read': return <CheckCheck className="w-3.5 h-3.5 text-blue-400" />;
      case 'delivered': return <CheckCheck className="w-3.5 h-3.5 opacity-50" />;
      default: return <Check className="w-3 h-3 opacity-50" />;
    }
  };

  return (
    <div className={cn('flex group', isOwn ? 'justify-end' : 'justify-start', showName ? 'mt-3' : 'mt-0.5',
      isOwn ? 'animate-msg-in-right' : 'animate-msg-in-left',
      selectionMode && 'cursor-pointer',
      isSelected && 'bg-[var(--accent-subtle)] rounded-lg -mx-2 px-2 py-0.5',
    )}
      onContextMenu={selectionMode ? undefined : onContextMenu}
      onMouseEnter={() => setShowActions(true)} onMouseLeave={() => setShowActions(false)}
      onDoubleClick={selectionMode ? undefined : onReply}
      onClick={selectionMode ? onToggleSelect : undefined}>

      {/* Selection checkbox */}
      {selectionMode && (
        <div className={cn('flex items-center mr-2 flex-shrink-0', isOwn && 'order-last ml-2 mr-0')}>
          <div className={cn(
            'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all',
            isSelected
              ? 'bg-[var(--accent)] border-[var(--accent)]'
              : 'border-[var(--text-muted)] bg-transparent'
          )}>
            {isSelected && <Check className="w-3 h-3 text-white" />}
          </div>
        </div>
      )}

      <div className="max-w-[70%] lg:max-w-[55%] relative">
        {showActions && !isFailed && !selectionMode && (
          <div className={cn('absolute -top-7 z-10 flex items-center gap-0.5', isOwn ? 'right-0' : 'left-0')}>
            <button onClick={onReply} className="p-1.5 bg-[var(--bg-surface)] border border-[var(--border)] rounded-full shadow-sm text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors animate-scale-in" title="Reply">
              <Reply className="w-3 h-3" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onContextMenu(e); }} className="p-1.5 bg-[var(--bg-surface)] border border-[var(--border)] rounded-full shadow-sm text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors animate-scale-in" title="More">
              <MoreHorizontal className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* ── Image message: WhatsApp-style inline preview ── */}
        {isImage && fileData ? (
          <div className={cn(
            'rounded-2xl overflow-hidden',
            isOwn ? 'rounded-br-sm' : 'rounded-bl-sm',
            isFailed && 'opacity-80',
            isPending && 'opacity-60',
          )}>
            {!isOwn && showName && message.sender_username && (
              <div className={cn('px-3 pt-2 pb-1', isOwn ? 'bubble-own' : 'bubble-other')}>
                <p className="text-xs font-semibold text-[var(--accent)]">{message.sender_display_name || message.sender_username}</p>
              </div>
            )}

            {repliedMessage && (
              <div className={cn('px-3 pt-2', isOwn ? 'bubble-own' : 'bubble-other')}>
                <div className={cn('border-l-2 pl-2 py-0.5 rounded-sm text-xs', isOwn ? 'border-white/40 bg-white/10' : 'border-[var(--accent)] bg-[var(--accent)]/5')}>
                  <p className={cn('font-medium text-[11px]', isOwn ? 'text-white/80' : 'text-[var(--accent)]')}>{repliedMessage.sender_display_name || repliedMessage.sender_username}</p>
                  <p className={cn('truncate text-[11px]', isOwn ? 'text-white/60' : 'text-[var(--text-muted)]')}>
                    {repliedMessage.content && !isValidEncryptedMessage(repliedMessage.content) ? repliedMessage.content : '🔒 Encrypted message'}
                  </p>
                </div>
              </div>
            )}

            {/* Inline image */}
            <div className="relative cursor-pointer" onClick={() => onPreview(fileData!)}>
              <AuthImage
                fileId={fileData.file_id}
                useThumbnail
                className="w-full max-w-[320px] min-h-[100px] max-h-[320px]"
              />
              {/* Time overlay on image */}
              <div className="absolute bottom-0 right-0 left-0 bg-gradient-to-t from-black/60 to-transparent px-3 py-1.5 rounded-b-xl">
                <div className="flex items-center gap-1 justify-end">
                  <span className="text-[10px] leading-none text-white/80">{formatMessageTime(message.created_at)}</span>
                  {renderStatus()}
                </div>
              </div>
            </div>
          </div>
        ) : isFileMessage && fileData ? (
          /* ── File message: Modern card design ── */
          <div className={cn(
            'rounded-2xl text-sm overflow-hidden',
            isOwn ? 'rounded-br-sm bubble-own' : 'rounded-bl-sm bubble-other',
            isFailed && '!bg-red-600 text-white opacity-80',
            isPending && 'opacity-60',
          )}>
            {!isOwn && showName && message.sender_username && (
              <p className="text-xs font-semibold text-[var(--accent)] px-3.5 pt-2.5 mb-0.5">{message.sender_display_name || message.sender_username}</p>
            )}

            {repliedMessage && (
              <div className={cn('mx-3.5 mt-2 mb-1 border-l-2 pl-2 py-0.5 rounded-sm text-xs', isOwn ? 'border-white/40 bg-white/10' : 'border-[var(--accent)] bg-[var(--accent)]/5')}>
                <p className={cn('font-medium text-[11px]', isOwn ? 'text-white/80' : 'text-[var(--accent)]')}>{repliedMessage.sender_display_name || repliedMessage.sender_username}</p>
                <p className={cn('truncate text-[11px]', isOwn ? 'text-white/60' : 'text-[var(--text-muted)]')}>
                  {repliedMessage.content && !isValidEncryptedMessage(repliedMessage.content) ? repliedMessage.content : '🔒 Encrypted message'}
                </p>
              </div>
            )}

            <div className="px-3 py-2.5">
              {(() => {
                const info = getFileTypeInfo(fileData.mime_type, fileData.filename);
                return (
                  <div className={cn(
                    'flex items-center gap-3 p-2.5 rounded-xl',
                    isOwn ? 'bg-white/10' : 'bg-[var(--bg-wash)]'
                  )}>
                    {/* File type icon */}
                    <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center text-white text-lg flex-shrink-0 shadow-sm', info.color)}>
                      <span>{info.icon}</span>
                    </div>
                    {/* File info */}
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-sm font-medium truncate', isOwn ? 'text-white' : 'text-[var(--text-primary)]')}>
                        {fileData.filename || 'File'}
                      </p>
                      <p className={cn('text-xs mt-0.5', isOwn ? 'text-white/60' : 'text-[var(--text-muted)]')}>
                        {info.label}{fileData.file_size ? ` · ${formatSize(fileData.file_size)}` : ''}
                      </p>
                    </div>
                    {/* Download button */}
                    <button
                      onClick={(e) => { e.stopPropagation(); onDownload(fileData!); }}
                      className={cn(
                        'w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all active:scale-90',
                        isOwn ? 'bg-white/20 hover:bg-white/30 text-white' : 'bg-[var(--accent-subtle)] hover:bg-[var(--accent-muted)] text-[var(--accent)]'
                      )}
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                );
              })()}
            </div>

            <div className={cn('flex items-center gap-1 px-3.5 pb-2 justify-end')}>
              {isPinned && <Pin className={cn('w-3 h-3', isOwn ? 'text-white/50' : 'text-[var(--accent)]')} />}
              {isStarred && <Star className={cn('w-3 h-3 fill-current', isOwn ? 'text-yellow-300' : 'text-yellow-500')} />}
              {message.edited_at && <span className={cn('text-[10px] italic', isOwn ? 'text-white/50' : 'text-[var(--text-muted)]')}>edited</span>}
              <span className={cn('text-[10px] leading-none', isOwn ? 'text-white/50' : 'text-[var(--text-muted)]')}>{formatMessageTime(message.created_at)}</span>
              {renderStatus()}
            </div>
          </div>
        ) : (
          /* ── Text message ── */
          <div className={cn(
            'px-3.5 py-2.5 rounded-2xl text-sm',
            isOwn ? 'rounded-br-sm bubble-own' : 'rounded-bl-sm bubble-other',
            isFailed && '!bg-red-600 text-white opacity-80',
            isPending && 'opacity-60',
          )}>
            {!isOwn && showName && message.sender_username && (
              <p className="text-xs font-semibold text-[var(--accent)] mb-0.5">{message.sender_display_name || message.sender_username}</p>
            )}

            {repliedMessage && (
              <div className={cn('mb-1.5 border-l-2 pl-2 py-0.5 rounded-sm text-xs', isOwn ? 'border-white/40 bg-white/10' : 'border-[var(--accent)] bg-[var(--accent)]/5')}>
                <p className={cn('font-medium text-[11px]', isOwn ? 'text-white/80' : 'text-[var(--accent)]')}>{repliedMessage.sender_display_name || repliedMessage.sender_username}</p>
                <p className={cn('truncate text-[11px]', isOwn ? 'text-white/60' : 'text-[var(--text-muted)]')}>
                  {repliedMessage.content && !isValidEncryptedMessage(repliedMessage.content) ? repliedMessage.content : '🔒 Encrypted message'}
                </p>
              </div>
            )}

            <p className="leading-relaxed whitespace-pre-wrap break-words">
              {message.content && !isValidEncryptedMessage(message.content)
                ? message.content
                : <span className="italic opacity-70 flex items-center gap-1"><Lock className="w-3 h-3 inline" /> Encrypted message</span>
              }
            </p>

            <div className={cn('flex items-center gap-1 mt-0.5 justify-end')}>
              {isPinned && <Pin className={cn('w-3 h-3', isOwn ? 'text-white/50' : 'text-[var(--accent)]')} />}
              {isStarred && <Star className={cn('w-3 h-3 fill-current', isOwn ? 'text-yellow-300' : 'text-yellow-500')} />}
              {message.edited_at && <span className={cn('text-[10px] italic', isOwn ? 'text-white/50' : 'text-[var(--text-muted)]')}>edited</span>}
              <span className={cn('text-[10px] leading-none', isOwn ? 'text-white/50' : 'text-[var(--text-muted)]')}>{formatMessageTime(message.created_at)}</span>
              {renderStatus()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
