'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore, Message } from '@/stores/chatStore';
import { useCallStore } from '@/stores/callStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { useUIStore } from '@/stores/uiStore';
import { formatMessageTime, getInitials, cn, getAvatarColor } from '@/lib/utils';
import {
  Send, Paperclip, Phone, Video, Lock, Shield,
  Check, CheckCheck, Image as ImageIcon, Smile,
  ArrowLeft, Search, Loader2, Reply, X,
  Download, RefreshCw, AlertCircle, Clock, Mic, Users,
  Star, Pin, MoreHorizontal, Info, ChevronDown,
  Upload, BarChart3, Camera, MapPin, FileText, Music,
  Play, Pause,
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
import VoiceRecorder from './VoiceRecorder';
import { SkeletonMessageList } from './Skeletons';
import GifPanel from './GifPanel';
import PollCreateModal from './PollCreateModal';
import PollBubble from './PollBubble';
import MentionAutocomplete from './MentionAutocomplete';

const QUICK_EMOJIS = ['😀', '😂', '❤️', '👍', '🔥', '🎉', '😢', '🤔', '👋', '🙏', '💯', '✨', '😎', '🥳', '😡', '💀'];
const EMOJI_CATEGORIES: Record<string, string[]> = {
  '😀 Smileys': ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '🥲', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥'],
  '❤️ Hearts': ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❤️‍🔥', '💕', '💞', '💓', '💗', '💖', '💝', '💘'],
  '👋 Hands': ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏'],
  '🎉 Objects': ['🎉', '🎊', '🎈', '🔥', '⭐', '🌟', '✨', '💫', '🎯', '🏆', '🥇', '🎮', '🎵', '🎶', '💡', '📱', '💻', '📷', '🔒', '🔑', '🛡️', '⚡', '💯'],
};

interface SearchResult { message_id: string; sender_display_name?: string; sender_username: string; snippet: string; created_at: string; }
interface FileData { file_id: string; filename: string; file_size?: number; mime_type?: string; thumbnail_path?: string; }

/* ── Authenticated image loading ── */
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

  if (loading) return (
    <div className={cn('animate-pulse bg-[var(--bg-wash)] rounded-xl flex items-center justify-center min-h-[120px]', className)}>
      <Loader2 className="w-5 h-5 animate-spin opacity-30" />
    </div>
  );
  if (error || !src) return (
    <div className={cn('bg-[var(--bg-wash)] rounded-xl flex flex-col items-center justify-center gap-1 min-h-[120px]', className)}>
      <ImageIcon className="w-5 h-5 opacity-30" />
      <span className="text-[10px] opacity-40">Failed to load</span>
    </div>
  );
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img src={src} className={cn('rounded-xl cursor-pointer object-cover', className)} onClick={onClick} alt="Shared image" loading="lazy" />
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
    clearChatHistory, isLoadingMessages,
    hasMoreMessages, fetchOlderMessages, setDraft, getDraft,
  } = useChatStore();
  const connectionStatus = useConnectionStore(state => state.status);
  const { initiateCall } = useCallStore();
  const { chatBackground, showUserInfo, setShowUserInfo } = useUIStore();
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
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [forwardMessages, setForwardMessages] = useState<Message[]>([]);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [messageInfoTarget, setMessageInfoTarget] = useState<Message | null>(null);
  const [backgroundMenu, setBackgroundMenu] = useState<{ x: number; y: number } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ messageId: string; forEveryone: boolean } | null>(null);
  const [showPinnedOverlay, setShowPinnedOverlay] = useState(false);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [showGifPanel, setShowGifPanel] = useState(false);
  const [showPollModal, setShowPollModal] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionPosition, setMentionPosition] = useState({ top: 0, left: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const emojiRef = useRef<HTMLDivElement>(null);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const dragCounterRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const conversation = conversations.find(c => c.id === activeConversation);
  const conversationMessages = useMemo(() => activeConversation ? (messages[activeConversation] || []) : [], [activeConversation, messages]);
  const conversationMessagesLength = conversationMessages.length;
  const lastMessageId = conversationMessagesLength > 0 ? conversationMessages[conversationMessagesLength - 1].id : null;
  const typing = activeConversation ? (typingUsers[activeConversation] || []) : [];
  const [groupMembers, setGroupMembers] = useState<{ id: string; username: string; display_name?: string }[]>([]);

  // Fetch group members for @mention
  useEffect(() => {
    if (conversation?.type !== 'group' || !conversation.group_info?.group_id) { setGroupMembers([]); return; }
    let cancelled = false;
    api.get(`/groups/${conversation.group_info.group_id}`)
      .then(res => {
        if (cancelled) return;
        setGroupMembers((res.data.members || []).map((m: { user_id: string; username: string; display_name?: string }) => ({
          id: m.user_id, username: m.username, display_name: m.display_name || m.username,
        })));
      })
      .catch(() => { if (!cancelled) setGroupMembers([]); });
    return () => { cancelled = true; };
  }, [conversation?.type, conversation?.group_info?.group_id]);

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

  useEffect(() => {
    setSelectionMode(false); setSelectedMessages(new Set()); setShowVoiceRecorder(false);
    if (activeConversation) setInput(getDraft(activeConversation)); else setInput('');
  }, [activeConversation, getDraft]);

  useEffect(() => {
    if (!activeConversation) return;
    const timer = setTimeout(() => setDraft(activeConversation, input), 500);
    return () => clearTimeout(timer);
  }, [input, activeConversation, setDraft]);

  // Infinite scroll
  useEffect(() => {
    const sentinel = topSentinelRef.current;
    if (!sentinel || !activeConversation) return;
    const observer = new IntersectionObserver(async (entries) => {
      if (entries[0].isIntersecting && hasMoreMessages[activeConversation] && !isLoadingOlder) {
        setIsLoadingOlder(true);
        const container = messagesContainerRef.current;
        const prevScrollHeight = container?.scrollHeight || 0;
        await fetchOlderMessages(activeConversation);
        requestAnimationFrame(() => { if (container) container.scrollTop = container.scrollHeight - prevScrollHeight; });
        setIsLoadingOlder(false);
      }
    }, { root: messagesContainerRef.current, threshold: 0.1 });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [activeConversation, hasMoreMessages, isLoadingOlder, fetchOlderMessages]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const handleScroll = () => setShowScrollBottom(container.scrollHeight - container.scrollTop - container.clientHeight > 200);
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [activeConversation]);

  // Drag & drop
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) setIsDragging(true);
  }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); dragCounterRef.current--;
    if (dragCounterRef.current === 0) setIsDragging(false);
  }, []);
  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false); dragCounterRef.current = 0;
    const files = e.dataTransfer.files;
    if (files.length > 0 && fileInputRef.current) {
      const dt = new DataTransfer(); dt.items.add(files[0]);
      fileInputRef.current.files = dt.files;
      fileInputRef.current.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, []);

  const handleSend = () => {
    if (!input.trim() || !activeConversation) return;
    sendMessageOptimistic(activeConversation, input.trim(), 'text', replyTo?.id);
    setInput(''); setReplyTo(null); setDraft(activeConversation, '');
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
    typingTimeoutRef.current = setTimeout(() => sendTyping(activeConversation, false), 3000);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeConversation) return;
    if (file.size > 50 * 1024 * 1024) { toast.error('File size must be under 50MB'); return; }
    const BLOCKED = ['.exe', '.bat', '.cmd', '.com', '.msi', '.scr', '.pif', '.js', '.vbs', '.ps1', '.sh', '.php'];
    const ext = '.' + (file.name.split('.').pop()?.toLowerCase() || '');
    if (BLOCKED.includes(ext)) { toast.error('This file type is not allowed'); return; }
    setIsUploading(true); setUploadProgress(0);
    try {
      const formData = new FormData();
      formData.append('file', file); formData.append('conversation_id', activeConversation);
      const res = await api.post('/files/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000,
        onUploadProgress: (p) => { if (p.total) setUploadProgress(Math.round((p.loaded * 100) / p.total)); },
      });
      const messageType = file.type.startsWith('image/') ? 'image' : file.type.startsWith('audio/') ? 'audio' : 'file';
      const content = JSON.stringify({ file_id: res.data.file_id, filename: res.data.filename, file_size: res.data.file_size, mime_type: res.data.mime_type, thumbnail_path: res.data.thumbnail_path || null });
      sendMessageOptimistic(activeConversation, content, messageType);
      toast.success('File uploaded');
    } catch (err: unknown) {
      toast.error((axios.isAxiosError(err) && (err.response?.data as { error?: string } | undefined)?.error) || 'Failed to upload file');
    } finally { setIsUploading(false); setUploadProgress(0); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const handleCall = (type: 'audio' | 'video') => {
    if (!conversation?.other_user) return;
    initiateCall(conversation.other_user.user_id, type, conversation.other_user.display_name || conversation.other_user.username);
  };

  const handleDeleteMessage = async (messageId: string, forEveryone: boolean) => {
    try {
      if (activeConversation) {
        const chatStore = useChatStore.getState();
        const existing = chatStore.messages[activeConversation] || [];
        const updated = forEveryone
          ? existing.map(m => m.id === messageId ? { ...m, content: 'This message was deleted', encrypted_content: '[deleted]', message_type: 'text' as const } : m)
          : existing.filter(m => m.id !== messageId);
        useChatStore.setState(state => ({ messages: { ...state.messages, [activeConversation!]: updated } }));
      }
      await api.delete(`/messages/${messageId}?for_everyone=${forEveryone}`);
      toast.success(forEveryone ? 'Deleted for everyone' : 'Deleted for you');
    } catch {
      if (activeConversation) useChatStore.getState().fetchMessages(activeConversation);
      toast.error('Failed to delete message');
    }
    setContextMenu(null); setDeleteConfirm(null);
  };

  const handleDeleteWithConfirm = (messageId: string, forEveryone: boolean) => {
    setDeleteConfirm({ messageId, forEveryone }); setContextMenu(null);
  };

  const handleContextMenu = (e: React.MouseEvent, message: Message) => {
    e.preventDefault(); e.stopPropagation(); setBackgroundMenu(null);
    setContextMenu({ message, x: e.clientX, y: e.clientY });
  };

  const handleBackgroundContextMenu = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.message-bubble-wrapper')) return;
    e.preventDefault(); setContextMenu(null); setBackgroundMenu({ x: e.clientX, y: e.clientY });
  };

  const handleClearChatFromMenu = async () => {
    if (!activeConversation) return;
    try { await clearChatHistory(activeConversation); toast.success('Chat cleared'); }
    catch { toast.error('Failed to clear chat'); }
    setBackgroundMenu(null);
  };

  const handleScrollToBottom = () => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); setBackgroundMenu(null); };

  const handleToggleSelect = (messageId: string) => {
    setSelectedMessages(prev => { const s = new Set(prev); if (s.has(messageId)) { s.delete(messageId); } else { s.add(messageId); } return s; });
  };
  const handleExitSelectionMode = () => { setSelectionMode(false); setSelectedMessages(new Set()); };
  const handleBulkDelete = async () => { await Promise.all(Array.from(selectedMessages).map(id => handleDeleteMessage(id, false))); handleExitSelectionMode(); };
  const handleBulkForward = () => { setForwardMessages(conversationMessages.filter(m => selectedMessages.has(m.id))); setShowForwardModal(true); handleExitSelectionMode(); };
  const handleBulkStar = () => { Array.from(selectedMessages).forEach(id => toggleStarMessage(id)); handleExitSelectionMode(); toast.success('Messages starred'); };
  const handleBulkCopy = () => { navigator.clipboard.writeText(conversationMessages.filter(m => selectedMessages.has(m.id)).map(m => m.content || m.encrypted_content || '').join('\n\n')); toast.success('Copied'); handleExitSelectionMode(); };
  const handleForwardSingle = (message: Message) => { setForwardMessages([message]); setShowForwardModal(true); };

  const handleEditMessage = async (newContent: string) => {
    if (!editingMessage) return;
    try { await editMessage(editingMessage.id, newContent); toast.success('Message edited'); }
    catch { toast.error('Failed to edit message'); }
    setEditingMessage(null);
  };

  const handleCopyMessage = (message: Message) => { navigator.clipboard.writeText(message.content || message.encrypted_content); toast.success('Copied'); };

  const handleReaction = async (emoji: string) => {
    if (!contextMenu?.message) return;
    try {
      const res = await api.post(`/messages/${contextMenu.message.id}/react`, { emoji });
      if (activeConversation) {
        const currentMessages = useChatStore.getState().messages[activeConversation] || [];
        const updated = currentMessages.map(m => m.id === contextMenu.message.id ? { ...m, metadata: { ...(m.metadata as Record<string, unknown> || {}), reactions: res.data.reactions } } : m);
        useChatStore.setState(state => ({ messages: { ...state.messages, [activeConversation]: updated } }));
      }
      toast.success(res.data.action === 'added' ? `Reacted ${emoji}` : `Removed ${emoji}`);
    } catch { toast.error('Failed to react'); }
  };

  const handleSendVoice = async (audioBlob: Blob, duration?: number) => {
    if (!activeConversation) return;
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', audioBlob, `voice-${Date.now()}.webm`);
      formData.append('conversation_id', activeConversation);
      const res = await api.post('/files/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60000 });
      sendMessageOptimistic(activeConversation, JSON.stringify({ file_id: res.data.file_id, filename: res.data.filename || 'voice-message.webm', file_size: res.data.file_size, mime_type: 'audio/webm', ...(duration != null && { duration }) }), 'audio');
      toast.success('Voice message sent');
    } catch { toast.error('Failed to send voice message'); }
    finally { setIsUploading(false); setShowVoiceRecorder(false); }
  };

  const handleGifSelect = (gif: { url: string; previewUrl: string; title: string; width: number; height: number }) => {
    if (!activeConversation) return;
    sendMessageOptimistic(activeConversation, JSON.stringify({ type: 'gif', url: gif.url, previewUrl: gif.previewUrl, title: gif.title, width: gif.width, height: gif.height }), 'text');
    setShowGifPanel(false); toast.success('GIF sent');
  };

  const handleShareLocation = () => {
    setShowAttachMenu(false);
    if (!activeConversation) return;
    if (!navigator.geolocation) { toast.error('Geolocation is not supported'); return; }
    const toastId = toast.loading('Getting your location...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        toast.dismiss(toastId);
        const content = JSON.stringify({ type: 'location', lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) });
        sendMessageOptimistic(activeConversation!, content, 'text');
        toast.success('Location shared');
      },
      (err) => { toast.dismiss(toastId); toast.error(err.code === 1 ? 'Location access denied' : 'Could not get location'); },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value; setInput(val); handleTyping();
    if (conversation?.type === 'group') {
      const cursorPos = e.target.selectionStart;
      const mentionMatch = val.substring(0, cursorPos).match(/@(\w*)$/);
      if (mentionMatch) { setMentionQuery(mentionMatch[1]); const rect = e.target.getBoundingClientRect(); setMentionPosition({ top: rect.top - 10, left: rect.left + 20 }); }
      else setMentionQuery(null);
    }
  };

  const handleMentionSelect = (member: { id: string; username: string; display_name?: string }) => {
    const cursorPos = textareaRef.current?.selectionStart || input.length;
    const textBefore = input.substring(0, cursorPos);
    const textAfter = input.substring(cursorPos);
    setInput(`${textBefore.replace(/@\w*$/, '')}@${member.username} ${textAfter}`);
    setMentionQuery(null); textareaRef.current?.focus();
  };

  const handleJumpToMessage = (messageId: string) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); setHighlightMessageId(messageId); setTimeout(() => setHighlightMessageId(null), 2000); }
  };

  const currentPinnedMessageIds = activeConversation ? (pinnedMessages[activeConversation] || []) : [];
  const currentPinnedMessages = conversationMessages.filter(m => currentPinnedMessageIds.includes(m.id));

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (value.trim().length < 2) { setSearchResults([]); return; }
    searchDebounceRef.current = setTimeout(() => {
      setIsSearching(true);
      try {
        const query = value.trim().toLowerCase();
        setSearchResults(conversationMessages.filter(m => (m.content || '').toLowerCase().includes(query)).map(m => ({
          message_id: m.id, sender_display_name: m.sender_display_name, sender_username: m.sender_username || '',
          snippet: (m.content || '').slice(0, 100), created_at: m.created_at,
        })));
      } catch { toast.error('Search failed'); }
      finally { setIsSearching(false); }
    }, 300);
  };

  const handleEmojiSelect = (emoji: string) => { setInput(prev => prev + emoji); setShowEmojiPicker(false); };

  const handleFilePreview = async (fileData: FileData) => {
    if (fileData?.mime_type?.startsWith('image/')) {
      try { setImagePreview({ url: await getAuthBlobUrl(`/files/${fileData.file_id}/download`), name: fileData.filename }); }
      catch { toast.error('Failed to load image'); }
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
      <div className="flex-1 hidden lg:flex items-center justify-center bg-[var(--bg-app)]">
        <div className="text-center px-8">
          <div className="w-20 h-20 rounded-2xl bg-[var(--accent-subtle)] flex items-center justify-center mx-auto mb-6">
            <Lock className="w-9 h-9 text-[var(--accent)]" />
          </div>
          <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">Zynk</h2>
          <p className="text-sm text-[var(--text-muted)] max-w-[260px] mx-auto leading-relaxed">
            Select a conversation to start messaging securely.
          </p>
          <div className="flex items-center justify-center gap-1.5 mt-5 text-xs text-[var(--text-muted)]">
            <Shield className="w-3.5 h-3.5" />
            <span>End-to-end encrypted</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[var(--bg-app)] min-w-0">
      {/* Header */}
      {selectionMode ? (
        <MessageSelectionBar
          selectedCount={selectedMessages.size} totalCount={conversationMessages.length}
          onClose={handleExitSelectionMode} onDelete={handleBulkDelete} onForward={handleBulkForward}
          onStar={handleBulkStar} onCopy={handleBulkCopy}
          onSelectAll={() => { if (selectedMessages.size === conversationMessages.length) { setSelectedMessages(new Set()); } else { setSelectedMessages(new Set(conversationMessages.map(m => m.id))); } }}
        />
      ) : (
        <div className="h-14 px-3 flex items-center justify-between chat-header flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => setActiveConversation(null)} className="lg:hidden p-1.5 rounded-full hover:bg-[var(--hover)] flex-shrink-0">
              <ArrowLeft className="w-5 h-5 text-[var(--text-secondary)]" />
            </button>
            <div className="relative">
              <div className={cn('w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0', color)}>
                {getInitials(convName)}
              </div>
              {isOnline && <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-[var(--success)] rounded-full border-2 border-[var(--header-bg)]" />}
            </div>
            <div className="min-w-0">
              <h3 className="text-[15px] font-semibold text-[var(--text-primary)] truncate leading-tight">{convName}</h3>
              <p className="text-[12px] text-[var(--text-muted)] leading-tight mt-0.5">
                {typing.length > 0
                  ? <span className="text-[var(--accent)] font-medium flex items-center gap-1"><span className="flex gap-0.5"><span className="typing-dot" style={{ width: '4px', height: '4px' }} /><span className="typing-dot" style={{ width: '4px', height: '4px' }} /><span className="typing-dot" style={{ width: '4px', height: '4px' }} /></span>typing</span>
                  : isOnline ? <span className="text-[var(--success)]">online</span> : 'offline'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {conversation?.type === 'one_to_one' && (
              <>
                <button onClick={() => setShowSafetyNumber(true)} className="btn-icon" title="Verify encryption"><Shield className="w-[18px] h-[18px]" /></button>
                <button onClick={() => handleCall('video')} className="btn-icon"><Video className="w-[18px] h-[18px]" /></button>
                <button onClick={() => handleCall('audio')} className="btn-icon"><Phone className="w-[18px] h-[18px]" /></button>
              </>
            )}
            {conversation?.type === 'group' && conversation.group_info && (
              <button onClick={() => setShowGroupInfo(true)} className="btn-icon" title="Group info"><Users className="w-[18px] h-[18px]" /></button>
            )}
            {conversation?.type === 'one_to_one' && (
              <button onClick={() => setShowUserInfo(!showUserInfo)} className={cn('btn-icon', showUserInfo && 'text-[var(--accent)]')} title="Contact info"><Info className="w-[18px] h-[18px]" /></button>
            )}
            <button onClick={() => setShowSearch(!showSearch)} className="btn-icon"><Search className="w-[18px] h-[18px]" /></button>
          </div>
        </div>
      )}

      {/* Pinned banner */}
      {!selectionMode && currentPinnedMessages.length > 0 && (
        <button onClick={() => setShowPinnedOverlay(true)}
          className="w-full px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-surface)] hover:bg-[var(--hover)] transition-colors text-left">
          <div className="flex items-center gap-2">
            <Pin className="w-3.5 h-3.5 text-[var(--accent)] flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-[var(--accent)]">{currentPinnedMessages.length} Pinned</p>
              <p className="text-xs text-[var(--text-muted)] truncate">{currentPinnedMessages[currentPinnedMessages.length - 1]?.content || '🔒 Encrypted'}</p>
            </div>
          </div>
        </button>
      )}

      {/* Search bar */}
      {showSearch && (
        <div className="px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-surface)] flex items-center gap-3">
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
              onClick={() => { handleJumpToMessage(r.message_id); setShowSearch(false); setSearchQuery(''); setSearchResults([]); }}>
              <p className="text-xs text-[var(--accent)] font-medium">{r.sender_display_name || r.sender_username}</p>
              <p className="text-sm text-[var(--text-primary)] truncate">{r.snippet}</p>
            </button>
          ))}
        </div>
      )}

      {/* Messages area */}
      <div ref={messagesContainerRef}
        className={cn('flex-1 overflow-y-auto px-4 lg:px-16 py-4 scroll-thin relative', `chat-bg-${chatBackground}`)}
        onContextMenu={handleBackgroundContextMenu}
        onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop}>

        {isDragging && (
          <div className="absolute inset-0 z-20 bg-[var(--accent)]/10 border-2 border-dashed border-[var(--accent)] rounded-xl backdrop-blur-sm flex items-center justify-center">
            <div className="text-center">
              <Upload className="w-10 h-10 text-[var(--accent)] mx-auto mb-2" />
              <p className="text-base font-semibold text-[var(--accent)]">Drop file to send</p>
              <p className="text-xs text-[var(--text-muted)]">Max 50MB</p>
            </div>
          </div>
        )}

        <div ref={topSentinelRef} className="h-1" />
        {isLoadingOlder && <div className="flex justify-center py-3"><Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" /></div>}

        {isLoadingMessages && conversationMessages.length === 0 ? <SkeletonMessageList /> : (
          <>
            <div className="flex justify-center mb-6">
              <span className="text-[11px] text-[var(--text-muted)] bg-[var(--bg-wash)] px-4 py-1.5 rounded-md flex items-center gap-1.5 border border-[var(--border)]">
                <Lock className="w-3 h-3" /> End-to-end encrypted
              </span>
            </div>
            {conversationMessages.map((msg: Message, i: number) => {
              const showUnreadDivider = i > 0 && msg.sender_id !== user?.id && msg.status !== 'read'
                && (i === 0 || conversationMessages[i - 1]?.status === 'read' || conversationMessages[i - 1]?.sender_id === user?.id);
              return (
                <div key={msg.id} id={`msg-${msg.id}`} className="message-bubble-wrapper">
                  {showUnreadDivider && (
                    <div className="flex items-center gap-3 my-4">
                      <div className="flex-1 h-px bg-[var(--accent)]" />
                      <span className="text-xs font-semibold text-[var(--accent)] px-2">New messages</span>
                      <div className="flex-1 h-px bg-[var(--accent)]" />
                    </div>
                  )}
                  <MessageBubble message={msg} isOwn={msg.sender_id === user?.id}
                    showName={i === 0 || conversationMessages[i - 1]?.sender_id !== msg.sender_id}
                    onReply={() => setReplyTo(msg)} onContextMenu={(e) => handleContextMenu(e, msg)}
                    onPreview={handleFilePreview} onDownload={handleFileDownload}
                    allMessages={conversationMessages} onRetry={retryMessage}
                    isStarred={starredMessages.has(msg.id)} isPinned={currentPinnedMessageIds.includes(msg.id)}
                    selectionMode={selectionMode} isSelected={selectedMessages.has(msg.id)}
                    onToggleSelect={() => handleToggleSelect(msg.id)} isHighlighted={highlightMessageId === msg.id} />
                </div>
              );
            })}
          </>
        )}
        {typing.length > 0 && (
          <div className="flex items-start gap-2 mt-2">
            <div className="bg-[var(--bg-wash)] rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex items-center gap-1"><div className="typing-dot" /><div className="typing-dot" /><div className="typing-dot" /></div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />

        {showScrollBottom && (
          <button onClick={handleScrollToBottom}
            className="sticky bottom-4 left-1/2 -translate-x-1/2 z-10 w-10 h-10 rounded-full bg-[var(--bg-surface)] border border-[var(--border)] shadow-lg flex items-center justify-center hover:bg-[var(--hover)] transition-all">
            <ChevronDown className="w-5 h-5 text-[var(--text-secondary)]" />
          </button>
        )}
      </div>

      {/* Reply banner */}
      {replyTo && (
        <div className="mx-4 px-3 py-2 rounded-t-lg bg-[var(--bg-wash)] flex items-center gap-3 border-l-[3px] border-[var(--accent)]">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-[var(--accent)]">{replyTo.sender_display_name || replyTo.sender_username || 'You'}</p>
            <p className="text-xs text-[var(--text-muted)] truncate">
              {replyTo.content && !isValidEncryptedMessage(replyTo.content) ? replyTo.content : '🔒 Encrypted message'}
            </p>
          </div>
          <button onClick={() => setReplyTo(null)} className="p-1 rounded hover:bg-[var(--hover)]"><X className="w-3.5 h-3.5 text-[var(--text-muted)]" /></button>
        </div>
      )}

      {/* Upload progress */}
      {isUploading && (
        <div className="px-4 py-2 border-t border-[var(--border)] bg-[var(--bg-surface)]">
          <div className="flex items-center gap-3">
            <Paperclip className="w-4 h-4 text-[var(--accent)] flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-[var(--text-secondary)]">Uploading...</span>
                <span className="text-xs font-bold text-[var(--accent)]">{uploadProgress}%</span>
              </div>
              <div className="w-full h-1 bg-[var(--bg-wash)] rounded-full overflow-hidden">
                <div className="h-full bg-[var(--accent)] rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Voice Recorder */}
      {showVoiceRecorder && (
        <div className="px-4 py-3 border-t border-[var(--border)] bg-[var(--bg-surface)]">
          <VoiceRecorder onSend={handleSendVoice} onCancel={() => setShowVoiceRecorder(false)} />
        </div>
      )}

      {/* Input area */}
      {!showVoiceRecorder && (
        <div className="px-3 pb-3 pt-2 flex-shrink-0 chat-input-bar">
          <div className="flex items-end gap-2">
            <div className="flex items-center gap-0.5 pb-0.5">
              <div className="relative" ref={emojiRef}>
                <button onClick={() => setShowEmojiPicker(!showEmojiPicker)} className="btn-icon"><Smile className="w-5 h-5" /></button>
                {showEmojiPicker && (
                  <div className="absolute bottom-11 left-0 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl shadow-lg w-72 max-h-72 overflow-hidden z-30">
                    <div className="p-2 border-b border-[var(--border)]">
                      <div className="grid grid-cols-8 gap-0.5">
                        {QUICK_EMOJIS.map(e => (
                          <button key={e} onClick={() => handleEmojiSelect(e)} className="w-8 h-8 flex items-center justify-center text-lg hover:bg-[var(--hover)] rounded-lg transition-colors">{e}</button>
                        ))}
                      </div>
                    </div>
                    <div className="max-h-48 overflow-y-auto p-2">
                      {Object.entries(EMOJI_CATEGORIES).map(([cat, emojis]) => (
                        <div key={cat} className="mb-2">
                          <p className="text-xs text-[var(--text-muted)] mb-1 px-1">{cat}</p>
                          <div className="grid grid-cols-8 gap-0.5">
                            {emojis.map(e => (<button key={e} onClick={() => handleEmojiSelect(e)} className="w-8 h-8 flex items-center justify-center text-lg hover:bg-[var(--hover)] rounded transition-colors">{e}</button>))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />
              <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
              <input ref={docInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.7z,.tar,.gz" className="hidden" onChange={handleFileUpload} />
              <input ref={audioInputRef} type="file" accept="audio/*" className="hidden" onChange={handleFileUpload} />
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileUpload} />
              {/* Attachment menu */}
              <div className="relative">
                <button onClick={() => { setShowAttachMenu(!showAttachMenu); setShowEmojiPicker(false); }} className="btn-icon">
                  {isUploading ? <Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" /> : <Paperclip className={cn('w-5 h-5 transition-transform duration-200', showAttachMenu && 'rotate-[135deg] text-[var(--accent)]')} />}
                </button>
                {showAttachMenu && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setShowAttachMenu(false)} />
                    <div className="absolute bottom-12 left-0 bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl shadow-lg z-30 p-3 w-[252px]">
                      <div className="grid grid-cols-3 gap-1">
                        {[
                          { Icon: ImageIcon, label: 'Gallery', color: 'bg-violet-500', onClick: () => { imageInputRef.current?.click(); setShowAttachMenu(false); } },
                          { Icon: Camera, label: 'Camera', color: 'bg-pink-500', onClick: () => { cameraInputRef.current?.click(); setShowAttachMenu(false); } },
                          { Icon: FileText, label: 'Document', color: 'bg-blue-500', onClick: () => { docInputRef.current?.click(); setShowAttachMenu(false); } },
                          { Icon: Music, label: 'Audio', color: 'bg-orange-500', onClick: () => { audioInputRef.current?.click(); setShowAttachMenu(false); } },
                          { Icon: MapPin, label: 'Location', color: 'bg-green-500', onClick: () => handleShareLocation() },
                        ].map(({ Icon, label, color, onClick }) => (
                          <button key={label} onClick={onClick}
                            className="flex flex-col items-center gap-1.5 py-2.5 px-1 rounded-xl hover:bg-[var(--hover)] transition-colors">
                            <div className={cn('w-10 h-10 rounded-full flex items-center justify-center text-white shadow-sm', color)}>
                              <Icon className="w-5 h-5" />
                            </div>
                            <span className="text-[10px] font-medium text-[var(--text-secondary)]">{label}</span>
                          </button>
                        ))}
                        {conversation?.type === 'group' && (
                          <button onClick={() => { setShowPollModal(true); setShowAttachMenu(false); }}
                            className="flex flex-col items-center gap-1.5 py-2.5 px-1 rounded-xl hover:bg-[var(--hover)] transition-colors">
                            <div className={cn('w-10 h-10 rounded-full flex items-center justify-center text-white shadow-sm bg-amber-500')}>
                              <BarChart3 className="w-5 h-5" />
                            </div>
                            <span className="text-[10px] font-medium text-[var(--text-secondary)]">Poll</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
              <button onClick={() => setShowGifPanel(!showGifPanel)} className="btn-icon" title="GIF"><span className="text-xs font-bold">GIF</span></button>
            </div>
            <div className="flex-1 min-w-0">
              <textarea ref={textareaRef} value={input} onChange={handleInputChange} onKeyDown={handleKeyDown}
                className="input-field resize-none !rounded-2xl !py-2.5 !border-[var(--border)]"
                placeholder="Type a message..." rows={1}
                style={{ height: `${Math.min(Math.max(40, input.split('\n').length * 22 + 18), 120)}px` }} />
            </div>
            <div className="pb-0.5">
              {input.trim() ? (
                <button onClick={handleSend} disabled={connectionStatus === 'error'}
                  className="w-10 h-10 rounded-full bg-[var(--accent)] text-white flex items-center justify-center transition-all hover:bg-[var(--accent-hover)] active:scale-90 shadow-md">
                  <Send className="w-[18px] h-[18px] ml-0.5" />
                </button>
              ) : (
                <button onClick={() => setShowVoiceRecorder(true)} className="btn-icon" title="Record voice message"><Mic className="w-5 h-5" /></button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modals & overlays */}
      {contextMenu && (
        <MessageContextMenu message={contextMenu.message} x={contextMenu.x} y={contextMenu.y}
          isOwn={contextMenu.message.sender_id === user?.id} isStarred={starredMessages.has(contextMenu.message.id)}
          isPinned={currentPinnedMessageIds.includes(contextMenu.message.id)}
          onClose={() => setContextMenu(null)}
          onReply={() => { setReplyTo(contextMenu.message); setContextMenu(null); }}
          onCopy={() => { handleCopyMessage(contextMenu.message); setContextMenu(null); }}
          onForward={() => { handleForwardSingle(contextMenu.message); setContextMenu(null); }}
          onStar={() => { toggleStarMessage(contextMenu.message.id); setContextMenu(null); toast.success(starredMessages.has(contextMenu.message.id) ? 'Unstarred' : 'Starred'); }}
          onPin={() => { if (activeConversation) togglePinMessage(activeConversation, contextMenu.message.id); setContextMenu(null); toast.success(currentPinnedMessageIds.includes(contextMenu.message.id) ? 'Unpinned' : 'Pinned'); }}
          onEdit={() => { setEditingMessage(contextMenu.message); setContextMenu(null); }}
          onSelect={() => { setSelectionMode(true); setSelectedMessages(new Set([contextMenu.message.id])); setContextMenu(null); }}
          onDeleteForMe={() => handleDeleteWithConfirm(contextMenu.message.id, false)}
          onDeleteForEveryone={() => handleDeleteWithConfirm(contextMenu.message.id, true)}
          onInfo={() => { setMessageInfoTarget(contextMenu.message); setContextMenu(null); }}
          onReaction={handleReaction} />
      )}
      {backgroundMenu && (
        <ChatAreaBackgroundMenu x={backgroundMenu.x} y={backgroundMenu.y}
          hasPinnedMessages={currentPinnedMessages.length > 0} onClose={() => setBackgroundMenu(null)}
          onSelectAll={() => { setSelectionMode(true); setSelectedMessages(new Set(conversationMessages.map(m => m.id))); setBackgroundMenu(null); }}
          onClearChat={handleClearChatFromMenu} onScrollToBottom={handleScrollToBottom}
          onSearchInChat={() => { setShowSearch(true); setBackgroundMenu(null); }}
          onViewPinned={() => { setShowPinnedOverlay(true); setBackgroundMenu(null); }} />
      )}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-[var(--bg-surface)] rounded-xl w-full max-w-sm p-5 shadow-lg border border-[var(--border)] mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-[var(--text-primary)] mb-2">{deleteConfirm.forEveryone ? 'Delete for everyone?' : 'Delete message?'}</h3>
            <p className="text-sm text-[var(--text-muted)] mb-4">{deleteConfirm.forEveryone ? 'This message will be deleted for all participants.' : 'This message will only be deleted for you.'}</p>
            <div className="flex items-center gap-2 justify-end">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm font-medium text-[var(--text-secondary)] rounded-lg hover:bg-[var(--hover)]">Cancel</button>
              <button onClick={() => handleDeleteMessage(deleteConfirm.messageId, deleteConfirm.forEveryone)}
                className="px-4 py-2 text-sm font-semibold text-white bg-[var(--danger)] rounded-lg hover:brightness-110 active:scale-[0.98]">Delete</button>
            </div>
          </div>
        </div>
      )}
      {imagePreview && (
        <div className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-4" onClick={() => setImagePreview(null)}>
          <div className="absolute top-6 right-6 flex items-center gap-2 z-10">
            <a href={imagePreview.url} download={imagePreview.name} onClick={e => e.stopPropagation()}
              className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all" title="Download"><Download className="w-5 h-5" /></a>
            <button onClick={() => setImagePreview(null)} className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all"><X className="w-5 h-5" /></button>
          </div>
          <div className="max-w-4xl max-h-[85vh]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imagePreview.url} alt={imagePreview.name || 'Image'} className="max-w-full max-h-[85vh] object-contain rounded-xl" />
            <p className="text-center text-white/50 text-sm mt-3">{imagePreview.name}</p>
          </div>
        </div>
      )}
      {showGroupInfo && conversation?.type === 'group' && conversation.group_info && (
        <GroupInfoPanel groupId={conversation.group_info.group_id} onClose={() => setShowGroupInfo(false)} />
      )}
      {conversation?.type === 'one_to_one' && (
        <SafetyNumberModal isOpen={showSafetyNumber} onClose={() => setShowSafetyNumber(false)} userId={conversation.other_user?.user_id || ''} userName={convName} />
      )}
      <ForwardMessageModal isOpen={showForwardModal} messages={forwardMessages} onClose={() => { setShowForwardModal(false); setForwardMessages([]); }} />
      <EditMessageModal isOpen={!!editingMessage} originalContent={editingMessage?.content || editingMessage?.encrypted_content || ''} onClose={() => setEditingMessage(null)} onSave={handleEditMessage} />
      {messageInfoTarget && <MessageInfoModal isOpen={!!messageInfoTarget} message={messageInfoTarget} onClose={() => setMessageInfoTarget(null)} />}
      {showPinnedOverlay && currentPinnedMessages.length > 0 && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50" onClick={() => setShowPinnedOverlay(false)}>
          <div className="bg-[var(--bg-surface)] rounded-xl w-full max-w-md max-h-[70vh] flex flex-col shadow-lg border border-[var(--border)] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-[var(--border)] flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <Pin className="w-4 h-4 text-[var(--accent)]" />
                <h3 className="text-sm font-bold text-[var(--text-primary)]">Pinned Messages</h3>
                <span className="text-xs text-[var(--text-muted)] bg-[var(--bg-wash)] px-2 py-0.5 rounded-full">{currentPinnedMessages.length}</span>
              </div>
              <button onClick={() => setShowPinnedOverlay(false)} className="p-1 rounded-full hover:bg-[var(--hover)]"><X className="w-4 h-4 text-[var(--text-muted)]" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {currentPinnedMessages.map(msg => (
                <div key={msg.id} className="bg-[var(--bg-wash)] rounded-lg p-3 border border-[var(--border)]">
                  <p className="text-xs text-[var(--accent)] font-medium mb-1">{msg.sender_display_name || msg.sender_username || 'You'}</p>
                  <p className="text-sm text-[var(--text-primary)] line-clamp-3">{msg.content || '🔒 Encrypted'}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[10px] text-[var(--text-muted)]">{formatMessageTime(msg.created_at)}</span>
                    <button onClick={() => { if (activeConversation) togglePinMessage(activeConversation, msg.id); }} className="text-xs text-[var(--danger)] hover:underline">Unpin</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {showGifPanel && <div className="absolute bottom-20 left-4 z-30"><GifPanel onSelect={handleGifSelect} onClose={() => setShowGifPanel(false)} /></div>}
      {mentionQuery !== null && groupMembers.length > 0 && (
        <MentionAutocomplete members={groupMembers} query={mentionQuery} position={mentionPosition} onSelect={handleMentionSelect} onClose={() => setMentionQuery(null)} />
      )}
      {showPollModal && activeConversation && <PollCreateModal conversationId={activeConversation} onClose={() => setShowPollModal(false)} onCreated={() => setShowPollModal(false)} />}
    </div>
  );
}

/* ── Audio Player Bubble ── */
function AudioPlayerBubble({ fileData, isOwn }: { fileData: FileData & { duration?: number }; isOwn: boolean }) {
  const [src, setSrc] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [curTime, setCurTime] = useState(0);
  const [dur, setDur] = useState(fileData.duration || 0);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    let cancelled = false;
    getAuthBlobUrl(`/files/${fileData.file_id}/download`)
      .then(url => { if (!cancelled) setSrc(url); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [fileData.file_id]);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); } else { audioRef.current.play(); }
    setPlaying(!playing);
  };

  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const bars = [3, 5, 8, 4, 7, 10, 6, 9, 4, 7, 5, 8, 3, 6, 9, 5, 7, 4, 8, 6, 5, 3, 7, 9, 4];

  return (
    <div className="flex items-center gap-3 min-w-[200px]">
      {src && (
        <audio ref={audioRef} src={src}
          onTimeUpdate={() => { if (audioRef.current) { setCurTime(audioRef.current.currentTime); setProgress(audioRef.current.currentTime / (audioRef.current.duration || 1)); } }}
          onLoadedMetadata={() => { if (audioRef.current && audioRef.current.duration !== Infinity) setDur(audioRef.current.duration); }}
          onEnded={() => { setPlaying(false); setProgress(0); setCurTime(0); }} />
      )}
      <button onClick={toggle} disabled={!src}
        className={cn('w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all active:scale-90',
          isOwn ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]')}>
        {!src ? <Loader2 className="w-4 h-4 animate-spin" /> : playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-end gap-[2px] h-[28px]">
          {bars.map((h, i) => (
            <div key={i} className={cn('w-[3px] rounded-full transition-colors duration-150',
              i / bars.length <= progress
                ? (isOwn ? 'bg-white/80' : 'bg-[var(--accent)]')
                : (isOwn ? 'bg-white/25' : 'bg-[var(--border)]')
            )} style={{ height: `${h * 2.5}px` }} />
          ))}
        </div>
        <p className={cn('text-[10px] mt-0.5', isOwn ? 'text-white/50' : 'text-[var(--text-muted)]')}>
          {playing ? fmtTime(curTime) : fmtTime(dur)}
        </p>
      </div>
    </div>
  );
}

/* ── Location Bubble ── */
function LocationBubble({ lat, lng, isOwn }: { lat: number; lng: number; isOwn: boolean }) {
  const mapsLink = `https://www.google.com/maps?q=${lat},${lng}`;
  return (
    <div className="rounded-xl overflow-hidden -mx-1 -mt-0.5 mb-0.5 w-[260px]">
      <div className={cn('relative w-full h-[130px] flex items-center justify-center',
        isOwn ? 'bg-white/5' : 'bg-[var(--bg-wash)]')}>
        <div className="absolute inset-0 opacity-[0.12]"
          style={{ backgroundImage: 'linear-gradient(var(--text-muted) 1px, transparent 1px), linear-gradient(90deg, var(--text-muted) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
        <div className="relative flex flex-col items-center">
          <div className={cn('w-11 h-11 rounded-full flex items-center justify-center shadow-md',
            isOwn ? 'bg-white/20' : 'bg-[var(--accent)]')}>
            <MapPin className="w-5 h-5 text-white" />
          </div>
          <div className={cn('mt-2 px-2.5 py-1 rounded-md text-[10px] font-mono',
            isOwn ? 'bg-white/10 text-white/70' : 'bg-[var(--bg-surface)] text-[var(--text-muted)] shadow-sm')}>
            {lat.toFixed(4)}&deg;, {lng.toFixed(4)}&deg;
          </div>
        </div>
      </div>
      <a href={mapsLink} target="_blank" rel="noopener noreferrer"
        className={cn('flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors',
          isOwn ? 'text-white/80 bg-white/5 hover:bg-white/10' : 'text-[var(--accent)] bg-[var(--accent-subtle)] hover:bg-[var(--accent-muted)]')}
        onClick={e => e.stopPropagation()}>
        Open in Google Maps
      </a>
    </div>
  );
}

/* ── Message Bubble ── */
function MessageBubble({ message, isOwn, showName, onReply, onContextMenu, onPreview, onDownload, allMessages, onRetry, isStarred, isPinned, selectionMode, isSelected, onToggleSelect, isHighlighted }: {
  message: Message; isOwn: boolean; showName: boolean;
  onReply: () => void; onContextMenu: (e: React.MouseEvent) => void;
  onPreview: (d: FileData) => void; onDownload: (d: FileData) => void;
  allMessages: Message[]; onRetry: (tempId: string) => void;
  isStarred: boolean; isPinned: boolean;
  selectionMode: boolean; isSelected: boolean; onToggleSelect: () => void;
  isHighlighted?: boolean;
}) {
  const [showActions, setShowActions] = useState(false);
  const isFileMessage = message.message_type === 'file' || message.message_type === 'image';
  const isAudioMessage = message.message_type === 'audio';

  let fileData: FileData | null = null;
  if (isFileMessage || isAudioMessage) {
    for (const raw of [message.content, message.encrypted_content].filter(Boolean)) {
      try { const p = JSON.parse(raw!); if (p.file_id) { fileData = p; break; } } catch { /* skip */ }
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
    if (isFailed) return <button onClick={() => message.tempId && onRetry(message.tempId)} className="flex items-center gap-0.5 text-red-400" title="Retry"><AlertCircle className="w-3 h-3" /><RefreshCw className="w-2.5 h-2.5" /></button>;
    if (isPending) return <Clock className="w-3 h-3 opacity-50 animate-pulse" />;
    switch (message.status) {
      case 'read': return <CheckCheck className="w-3.5 h-3.5 text-blue-400" />;
      case 'delivered': return <CheckCheck className="w-3.5 h-3.5 opacity-50" />;
      default: return <Check className="w-3 h-3 opacity-50" />;
    }
  };

  const ReplyPreview = () => repliedMessage ? (
    <div className={cn('mb-1.5 border-l-2 pl-2 py-0.5 rounded-sm text-xs', isOwn ? 'border-white/40 bg-white/10' : 'border-[var(--accent)] bg-[var(--accent)]/5')}>
      <p className={cn('font-medium text-[11px]', isOwn ? 'text-white/80' : 'text-[var(--accent)]')}>{repliedMessage.sender_display_name || repliedMessage.sender_username}</p>
      <p className={cn('truncate text-[11px]', isOwn ? 'text-white/60' : 'text-[var(--text-muted)]')}>{repliedMessage.content && !isValidEncryptedMessage(repliedMessage.content) ? repliedMessage.content : '🔒 Encrypted'}</p>
    </div>
  ) : null;

  const StatusFooter = ({ className: cls }: { className?: string }) => (
    <div className={cn('flex items-center gap-1 justify-end', cls)}>
      {isPinned && <Pin className={cn('w-3 h-3', isOwn ? 'text-white/50' : 'text-[var(--accent)]')} />}
      {isStarred && <Star className={cn('w-3 h-3 fill-current', isOwn ? 'text-yellow-300' : 'text-yellow-500')} />}
      {message.edited_at && <span className={cn('text-[10px] italic', isOwn ? 'text-white/50' : 'text-[var(--text-muted)]')}>edited</span>}
      <span className={cn('text-[10px] leading-none', isOwn ? 'text-white/50' : 'text-[var(--text-muted)]')}>{formatMessageTime(message.created_at)}</span>
      {renderStatus()}
    </div>
  );

  return (
    <div className={cn('flex group', isOwn ? 'justify-end' : 'justify-start', showName ? 'mt-3' : 'mt-0.5',
      selectionMode && 'cursor-pointer',
      isSelected && 'bg-[var(--accent-subtle)] rounded-lg -mx-2 px-2 py-0.5',
      isHighlighted && 'bg-[var(--accent-subtle)] rounded-lg -mx-2 px-2 py-1 transition-all duration-1000',
    )}
      onContextMenu={selectionMode ? undefined : onContextMenu}
      onMouseEnter={() => setShowActions(true)} onMouseLeave={() => setShowActions(false)}
      onDoubleClick={selectionMode ? undefined : onReply}
      onClick={selectionMode ? onToggleSelect : undefined}>

      {selectionMode && (
        <div className={cn('flex items-center mr-2 flex-shrink-0', isOwn && 'order-last ml-2 mr-0')}>
          <div className={cn('w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all',
            isSelected ? 'bg-[var(--accent)] border-[var(--accent)]' : 'border-[var(--text-muted)] bg-transparent')}>
            {isSelected && <Check className="w-3 h-3 text-white" />}
          </div>
        </div>
      )}

      <div className="max-w-[70%] lg:max-w-[55%] relative">
        {showActions && !isFailed && !selectionMode && (
          <div className={cn('absolute -top-7 z-10 flex items-center gap-0.5', isOwn ? 'right-0' : 'left-0')}>
            <button onClick={onReply} className="p-1.5 bg-[var(--bg-surface)] border border-[var(--border)] rounded-full shadow-sm text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors" title="Reply"><Reply className="w-3 h-3" /></button>
            <button onClick={(e) => { e.stopPropagation(); onContextMenu(e); }} className="p-1.5 bg-[var(--bg-surface)] border border-[var(--border)] rounded-full shadow-sm text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors" title="More"><MoreHorizontal className="w-3 h-3" /></button>
          </div>
        )}

        {/* Image message */}
        {isImage && fileData ? (
          <div className={cn('rounded-2xl overflow-hidden', isOwn ? 'rounded-br-sm' : 'rounded-bl-sm', isFailed && 'opacity-80', isPending && 'opacity-60')}>
            {!isOwn && showName && message.sender_username && (
              <div className={cn('px-3 pt-2 pb-1', isOwn ? 'bubble-own' : 'bubble-other')}>
                <p className="text-xs font-semibold text-[var(--accent)]">{message.sender_display_name || message.sender_username}</p>
              </div>
            )}
            {repliedMessage && <div className={cn('px-3 pt-2', isOwn ? 'bubble-own' : 'bubble-other')}><ReplyPreview /></div>}
            <div className="relative cursor-pointer" onClick={() => onPreview(fileData!)}>
              <AuthImage fileId={fileData.file_id} useThumbnail className="w-full max-w-[320px] min-h-[100px] max-h-[320px]" />
              <div className="absolute bottom-0 right-0 left-0 bg-gradient-to-t from-black/60 to-transparent px-3 py-1.5">
                <div className="flex items-center gap-1 justify-end">
                  <span className="text-[10px] leading-none text-white/80">{formatMessageTime(message.created_at)}</span>
                  {renderStatus()}
                </div>
              </div>
            </div>
          </div>

        ) : isAudioMessage && fileData ? (
          /* Audio message */
          <div className={cn('rounded-2xl text-sm overflow-hidden', isOwn ? 'rounded-br-sm bubble-own' : 'rounded-bl-sm bubble-other', isPending && 'opacity-60')}>
            {!isOwn && showName && message.sender_username && (
              <p className="text-xs font-semibold text-[var(--accent)] px-3.5 pt-2.5 mb-0.5">{message.sender_display_name || message.sender_username}</p>
            )}
            {repliedMessage && <div className="mx-3.5 mt-2 mb-1"><ReplyPreview /></div>}
            <div className="px-3.5 py-2.5">
              <AudioPlayerBubble fileData={fileData as FileData & { duration?: number }} isOwn={isOwn} />
            </div>
            <StatusFooter className="px-3.5 pb-2" />
          </div>

        ) : isFileMessage && fileData ? (
          /* File message */
          <div className={cn('rounded-2xl text-sm overflow-hidden', isOwn ? 'rounded-br-sm bubble-own' : 'rounded-bl-sm bubble-other', isFailed && '!bg-red-600 text-white opacity-80', isPending && 'opacity-60')}>
            {!isOwn && showName && message.sender_username && (
              <p className="text-xs font-semibold text-[var(--accent)] px-3.5 pt-2.5 mb-0.5">{message.sender_display_name || message.sender_username}</p>
            )}
            {repliedMessage && <div className="mx-3.5 mt-2 mb-1"><ReplyPreview /></div>}
            <div className="px-3 py-2.5">
              {(() => {
                const info = getFileTypeInfo(fileData.mime_type, fileData.filename);
                return (
                  <div className={cn('flex items-center gap-3 p-2.5 rounded-xl', isOwn ? 'bg-white/10' : 'bg-[var(--bg-wash)]')}>
                    <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center text-white text-lg flex-shrink-0', info.color)}><span>{info.icon}</span></div>
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-sm font-medium truncate', isOwn ? 'text-white' : 'text-[var(--text-primary)]')}>{fileData.filename || 'File'}</p>
                      <p className={cn('text-xs mt-0.5', isOwn ? 'text-white/60' : 'text-[var(--text-muted)]')}>{info.label}{fileData.file_size ? ` · ${formatSize(fileData.file_size)}` : ''}</p>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); onDownload(fileData!); }}
                      className={cn('w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all active:scale-90',
                        isOwn ? 'bg-white/20 hover:bg-white/30 text-white' : 'bg-[var(--accent-subtle)] hover:bg-[var(--accent-muted)] text-[var(--accent)]')}>
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                );
              })()}
            </div>
            <StatusFooter className="px-3.5 pb-2" />
          </div>

        ) : (
          /* Text message */
          <div className={cn('px-3.5 py-2 rounded-2xl text-sm', isOwn ? 'rounded-br-sm bubble-own' : 'rounded-bl-sm bubble-other', isFailed && '!bg-red-600 text-white opacity-80', isPending && 'opacity-60')}>
            {!isOwn && showName && message.sender_username && (
              <p className="text-xs font-semibold text-[var(--accent)] mb-0.5">{message.sender_display_name || message.sender_username}</p>
            )}
            <ReplyPreview />
            <div className="leading-relaxed whitespace-pre-wrap break-words">
              {message.content && !isValidEncryptedMessage(message.content)
                ? (() => {
                    try {
                      const parsed = JSON.parse(message.content.trim());
                      if (parsed.type === 'location' && parsed.lat != null && parsed.lng != null) {
                        return <LocationBubble lat={parsed.lat} lng={parsed.lng} isOwn={isOwn} />;
                      }
                      if (parsed.type === 'gif' && parsed.url) {
                        return (
                          <div className="rounded-lg overflow-hidden max-w-[280px]">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={parsed.previewUrl || parsed.url} alt={parsed.title || 'GIF'} className="w-full rounded-lg" loading="lazy" />
                            <span className="text-[9px] opacity-40 mt-0.5 block">via GIPHY</span>
                          </div>
                        );
                      }
                      if (parsed.type === 'poll' && parsed.pollId) {
                        return <PollBubble pollId={parsed.pollId} isOwn={isOwn} />;
                      }
                      // If JSON is valid but not a special type, fall through to regular text processing
                    } catch (error) { 
                      console.log('JSON parse failed for message:', message.content, error);
                      // Not valid JSON, fall through to regular text processing
                    }
                    // Regular text processing for mentions
                    const mentionRegex = /@(\w+)/g;
                    const parts = message.content.split(mentionRegex);
                    if (parts.length > 1) return parts.map((part: string, i: number) => i % 2 === 1 ? <span key={i} className="text-[var(--accent)] font-semibold">@{part}</span> : <span key={i}>{part}</span>);
                    return message.content;
                  })()
                : <span className="italic opacity-70 flex items-center gap-1"><Lock className="w-3 h-3 inline" /> Encrypted message</span>}
            </div>
            <StatusFooter className="mt-0.5" />
          </div>
        )}
      </div>
    </div>
  );
}