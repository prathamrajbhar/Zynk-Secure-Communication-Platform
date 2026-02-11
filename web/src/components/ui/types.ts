// ═══════════════════════════════════════════════════════
// ZYNK UI — Design System Type Definitions
// Production-grade TypeScript interfaces for all UI components
// ═══════════════════════════════════════════════════════

import type { ReactNode, MouseEvent, KeyboardEvent, HTMLAttributes } from 'react';

// ─── Message Types ───
export type MessageVariant = 'text' | 'image' | 'video' | 'file' | 'audio' | 'poll' | 'voice' | 'gif' | 'location' | 'sticker' | 'contact' | 'system';
export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
export type BubblePosition = 'first' | 'middle' | 'last' | 'single';

export interface MessageReaction {
  emoji: string;
  count: number;
  users: string[];
  isOwn: boolean;
}

export interface FileAttachment {
  file_id: string;
  filename: string;
  file_size?: number;
  mime_type?: string;
  thumbnail_path?: string;
  duration?: number;
  width?: number;
  height?: number;
}

export interface LinkPreview {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  favicon?: string;
}

export interface MessageBubbleProps {
  id: string;
  content: string;
  variant: MessageVariant;
  status: MessageStatus;
  isOwn: boolean;
  senderName?: string;
  senderAvatar?: string;
  senderColor?: string;
  timestamp: string;
  editedAt?: string;
  position: BubblePosition;
  reactions?: MessageReaction[];
  fileData?: FileAttachment;
  linkPreview?: LinkPreview;
  replyTo?: {
    id: string;
    senderName: string;
    content: string;
    variant: MessageVariant;
  };
  isStarred?: boolean;
  isPinned?: boolean;
  isForwarded?: boolean;
  isHighlighted?: boolean;
  isSelected?: boolean;
  selectionMode?: boolean;
  onReply?: () => void;
  onReact?: (emoji: string) => void;
  onContextMenu?: (e: MouseEvent) => void;
  onSelect?: () => void;
  onRetry?: () => void;
  onPreview?: (file: FileAttachment) => void;
  onDownload?: (file: FileAttachment) => void;
  onJumpToReply?: (messageId: string) => void;
}

// ─── Conversation Types ───
export interface ConversationItemProps {
  id: string;
  type: 'one_to_one' | 'group';
  name: string;
  avatarUrl?: string;
  avatarColor: string;
  lastMessage?: string;
  lastMessageType?: MessageVariant;
  lastMessageSenderId?: string;
  timestamp?: string;
  unreadCount: number;
  isOnline: boolean;
  isTyping?: boolean;
  typingUsers?: string[];
  isPinned?: boolean;
  isMuted?: boolean;
  isArchived?: boolean;
  draft?: string;
  isActive?: boolean;
  memberCount?: number;
  onClick?: () => void;
  onContextMenu?: (e: MouseEvent) => void;
  onSwipeAction?: (action: 'pin' | 'mute' | 'archive' | 'delete') => void;
}

// ─── Media Gallery Types ───
export interface MediaItem {
  id: string;
  type: 'image' | 'video' | 'gif';
  url: string;
  thumbnailUrl?: string;
  caption?: string;
  width?: number;
  height?: number;
  duration?: number;
  senderName?: string;
  timestamp?: string;
}

export interface MediaGalleryProps {
  items: MediaItem[];
  initialIndex?: number;
  isOpen: boolean;
  onClose: () => void;
  onDownload?: (item: MediaItem) => void;
  onForward?: (item: MediaItem) => void;
}

// ─── Voice Message Types ───
export interface VoiceMessagePlayerProps {
  src: string | null;
  duration: number;
  isOwn: boolean;
  isPlaying?: boolean;
  onPlay?: () => void;
  onPause?: () => void;
  waveformData?: number[];
}

// ─── Loading State Types ───
export type SkeletonVariant = 'conversation' | 'message' | 'profile' | 'media' | 'contact' | 'settings' | 'call-log';

export interface SkeletonProps {
  variant: SkeletonVariant;
  count?: number;
  className?: string;
  animate?: boolean;
}

// ─── Toast Types ───
export type ToastVariant = 'success' | 'error' | 'warning' | 'info' | 'action' | 'undo';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastProps {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ToastAction;
  duration?: number;
  dismissible?: boolean;
  onDismiss?: () => void;
}

// ─── Bottom Sheet Types ───
export interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  snapPoints?: number[];
  className?: string;
}

// ─── Context Menu Types ───
export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  shortcut?: string;
  variant?: 'default' | 'danger';
  disabled?: boolean;
  separator?: boolean;
  onClick?: () => void;
}

export interface ContextMenuProps {
  items: ContextMenuItem[];
  x: number;
  y: number;
  onClose: () => void;
}

// ─── Common Props ───
export interface AnimatedPresenceProps {
  children: ReactNode;
  show: boolean;
  animation?: 'fade' | 'slide-up' | 'slide-down' | 'slide-left' | 'slide-right' | 'scale' | 'bounce';
  duration?: number;
  className?: string;
}

export interface AvatarProps {
  name: string;
  src?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  color?: string;
  isOnline?: boolean;
  showStatus?: boolean;
  statusColor?: string;
  className?: string;
  onClick?: () => void;
}

export interface BadgeProps {
  count: number;
  max?: number;
  variant?: 'default' | 'accent' | 'danger' | 'success';
  size?: 'sm' | 'md';
  dot?: boolean;
  className?: string;
}

export interface ProgressBarProps {
  value: number;
  max?: number;
  variant?: 'default' | 'accent' | 'success' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  animated?: boolean;
  showLabel?: boolean;
  className?: string;
}

export interface SearchInputProps extends Omit<HTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  isLoading?: boolean;
  resultCount?: number;
  autoFocus?: boolean;
  size?: 'sm' | 'md';
}

// ─── Rich Input Types ───
export interface RichInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onTyping?: () => void;
  placeholder?: string;
  replyTo?: { senderName: string; content: string } | null;
  onCancelReply?: () => void;
  onEmojiSelect?: (emoji: string) => void;
  onFileSelect?: (file: File) => void;
  onVoiceRecord?: () => void;
  onGifSelect?: () => void;
  disabled?: boolean;
  maxLength?: number;
  mentionSuggestions?: { id: string; name: string; username: string; avatar?: string }[];
  onMentionSelect?: (user: { id: string; username: string }) => void;
}

// ─── Accessibility Types ───
export interface A11yProps {
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-expanded'?: boolean;
  'aria-haspopup'?: boolean | 'dialog' | 'menu' | 'listbox';
  'aria-controls'?: string;
  'aria-live'?: 'polite' | 'assertive' | 'off';
  'aria-busy'?: boolean;
  role?: string;
  tabIndex?: number;
  onKeyDown?: (e: KeyboardEvent) => void;
}
