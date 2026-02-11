// ═══════════════════════════════════════════════════════
// ZYNK — MessageBubble Component
// Production-grade message bubble with all variants
// Telegram-style grouping, WhatsApp-style status indicators
// ═══════════════════════════════════════════════════════

'use client';

import { useState, useRef, useEffect, memo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { formatMessageTime } from '@/lib/utils';
import {
  Check, AlertCircle, RefreshCw,
  Download, Play, Pause, Lock, Star, Pin,
  Reply, MoreHorizontal, MapPin,
  Loader2, Image as ImageIcon,
} from 'lucide-react';
import { StatusIndicator } from '@/components/ui/primitives';
import type { MessageBubbleProps, FileAttachment, BubblePosition } from '@/components/ui/types';
import api from '@/lib/api';

// ─── Authenticated image with blur-up progressive loading ───
const blobCache = new Map<string, string>();

async function fetchBlobUrl(endpoint: string): Promise<string> {
  const cached = blobCache.get(endpoint);
  if (cached) return cached;
  const res = await api.get(endpoint, { responseType: 'blob', timeout: 60000 });
  const url = URL.createObjectURL(res.data);
  blobCache.set(endpoint, url);
  return url;
}

function ProgressiveImage({ fileId, className, onClick, useThumbnail = false }: {
  fileId: string;
  className?: string;
  onClick?: () => void;
  useThumbnail?: boolean;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [thumbSrc, setThumbSrc] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // Load thumbnail first for blur-up effect
    fetchBlobUrl(`/files/${fileId}/thumbnail`)
      .then(url => { if (!cancelled) setThumbSrc(url); })
      .catch(() => { });

    // Then load full image
    const endpoint = useThumbnail ? `/files/${fileId}/thumbnail` : `/files/${fileId}/download`;
    fetchBlobUrl(endpoint)
      .then(url => { if (!cancelled) setSrc(url); })
      .catch(() => { if (!cancelled) setError(true); });

    return () => { cancelled = true; };
  }, [fileId, useThumbnail]);

  if (error) {
    return (
      <div className={cn(
        'bg-[var(--bg-wash)] rounded-xl flex flex-col items-center justify-center gap-1 min-h-[120px]',
        className
      )}>
        <ImageIcon className="w-5 h-5 opacity-30" />
        <span className="text-[10px] opacity-40">Failed to load</span>
      </div>
    );
  }

  return (
    <div className={cn('relative overflow-hidden rounded-xl min-h-[100px]', className)} onClick={onClick}>
      {/* Blur-up thumbnail */}
      {thumbSrc && !loaded && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbSrc}
          className="absolute inset-0 w-full h-full object-cover filter blur-lg scale-110"
          alt=""
          aria-hidden="true"
        />
      )}

      {/* Skeleton while loading */}
      {!src && !error && (
        <div className="absolute inset-0 bg-[var(--bg-wash)] animate-pulse flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin opacity-20" />
        </div>
      )}

      {/* Full image */}
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          className={cn(
            'w-full h-full object-cover cursor-pointer transition-opacity duration-500',
            loaded ? 'opacity-100' : 'opacity-0'
          )}
          onLoad={() => setLoaded(true)}
          alt="Shared image"
          loading="lazy"
        />
      )}
    </div>
  );
}

// ─── File type info helper ───
function getFileInfo(mimeType?: string, filename?: string) {
  const ext = filename?.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, { color: string; label: string; icon: string }> = {
    'audio': { color: 'bg-purple-500', label: 'Audio', icon: '🎵' },
    'video': { color: 'bg-pink-500', label: 'Video', icon: '🎬' },
    'pdf': { color: 'bg-red-500', label: 'PDF', icon: '📄' },
    'doc': { color: 'bg-blue-500', label: 'DOC', icon: '📝' },
    'docx': { color: 'bg-blue-500', label: 'DOC', icon: '📝' },
    'xls': { color: 'bg-green-600', label: 'XLS', icon: '📊' },
    'xlsx': { color: 'bg-green-600', label: 'XLS', icon: '📊' },
    'ppt': { color: 'bg-orange-500', label: 'PPT', icon: '📑' },
    'pptx': { color: 'bg-orange-500', label: 'PPT', icon: '📑' },
    'zip': { color: 'bg-yellow-600', label: 'ZIP', icon: '📦' },
    'rar': { color: 'bg-yellow-600', label: 'RAR', icon: '📦' },
    '7z': { color: 'bg-yellow-600', label: '7Z', icon: '📦' },
    'tar': { color: 'bg-yellow-600', label: 'TAR', icon: '📦' },
    'gz': { color: 'bg-yellow-600', label: 'GZ', icon: '📦' },
  };

  if (mimeType?.startsWith('audio/')) return map['audio'];
  if (mimeType?.startsWith('video/')) return map['video'];
  if (map[ext]) return map[ext];
  return { color: 'bg-slate-500', label: ext.toUpperCase() || 'FILE', icon: '📎' };
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

// ─── Bubble radius based on position in group ───
function getBubbleRadius(position: BubblePosition, isOwn: boolean): string {
  const base = 'rounded-2xl';
  if (isOwn) {
    switch (position) {
      case 'first': return `${base} rounded-br-md`;
      case 'middle': return `${base} rounded-r-md`;
      case 'last': return `${base} rounded-tr-md`;
      case 'single': return `${base} rounded-br-sm`;
    }
  } else {
    switch (position) {
      case 'first': return `${base} rounded-bl-md`;
      case 'middle': return `${base} rounded-l-md`;
      case 'last': return `${base} rounded-tl-md`;
      case 'single': return `${base} rounded-bl-sm`;
    }
  }
}

// ─── Waveform Bars for voice messages ───
function WaveformBars({ progress, isOwn, barCount = 30 }: { progress: number; isOwn: boolean; barCount?: number }) {
  // Deterministic pseudo-random bars
  const bars = Array.from({ length: barCount }, (_, i) => {
    const v = Math.sin(i * 0.7) * 0.3 + Math.cos(i * 1.3) * 0.2 + 0.5;
    return Math.max(0.15, Math.min(1, v));
  });

  return (
    <div className="flex items-end gap-[2px] h-[28px]" role="img" aria-label="Audio waveform">
      {bars.map((h, i) => (
        <div
          key={i}
          className={cn(
            'w-[3px] rounded-full transition-colors duration-100',
            i / barCount <= progress
              ? (isOwn ? 'bg-white/80' : 'bg-[var(--accent)]')
              : (isOwn ? 'bg-white/20' : 'bg-[var(--border)]')
          )}
          style={{ height: `${h * 24}px` }}
        />
      ))}
    </div>
  );
}

// ─── Audio Player Bubble ───
function AudioBubble({ fileData, isOwn }: { fileData: FileAttachment; isOwn: boolean }) {
  const [src, setSrc] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(fileData.duration || 0);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetchBlobUrl(`/files/${fileData.file_id}/download`)
      .then(url => { if (!cancelled) setSrc(url); })
      .catch(() => { });
    return () => { cancelled = true; };
  }, [fileData.file_id]);

  const toggle = useCallback(() => {
    if (!audioRef.current) return;
    if (playing) audioRef.current.pause();
    else audioRef.current.play();
    setPlaying(!playing);
  }, [playing]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-3 min-w-[220px]">
      {src && (
        <audio
          ref={audioRef}
          src={src}
          onTimeUpdate={() => {
            if (audioRef.current) {
              setCurrentTime(audioRef.current.currentTime);
              setProgress(audioRef.current.currentTime / (audioRef.current.duration || 1));
            }
          }}
          onLoadedMetadata={() => {
            if (audioRef.current && isFinite(audioRef.current.duration)) {
              setDuration(audioRef.current.duration);
            }
          }}
          onEnded={() => { setPlaying(false); setProgress(0); setCurrentTime(0); }}
        />
      )}

      <button
        onClick={toggle}
        disabled={!src}
        className={cn(
          'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0',
          'transition-all duration-150 active:scale-90',
          isOwn
            ? 'bg-white/20 text-white hover:bg-white/30'
            : 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]',
        )}
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {!src ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : playing ? (
          <Pause className="w-4 h-4" />
        ) : (
          <Play className="w-4 h-4 ml-0.5" />
        )}
      </button>

      <div className="flex-1 min-w-0">
        <WaveformBars progress={progress} isOwn={isOwn} />
        <p className={cn('text-[10px] mt-0.5', isOwn ? 'text-white/50' : 'text-[var(--text-muted)]')}>
          {playing ? formatTime(currentTime) : formatTime(duration)}
        </p>
      </div>
    </div>
  );
}

// ─── Location Bubble ───
function LocationContent({ lat, lng, isOwn }: { lat: number; lng: number; isOwn: boolean }) {
  const mapsLink = `https://www.google.com/maps?q=${lat},${lng}`;

  return (
    <div className="rounded-xl overflow-hidden -mx-1 -mt-0.5 mb-0.5 w-[260px]">
      <div className={cn(
        'relative w-full h-[130px] flex items-center justify-center',
        isOwn ? 'bg-white/5' : 'bg-[var(--bg-wash)]'
      )}>
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage: 'linear-gradient(var(--text-muted) 1px, transparent 1px), linear-gradient(90deg, var(--text-muted) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        />
        <div className="relative flex flex-col items-center">
          <div className={cn(
            'w-11 h-11 rounded-full flex items-center justify-center shadow-lg',
            isOwn ? 'bg-white/20' : 'bg-[var(--accent)]'
          )}>
            <MapPin className="w-5 h-5 text-white" />
          </div>
          <div className={cn(
            'mt-2 px-2.5 py-1 rounded-md text-[10px] font-mono',
            isOwn ? 'bg-white/10 text-white/70' : 'bg-[var(--bg-surface)] text-[var(--text-muted)] shadow-sm'
          )}>
            {lat.toFixed(4)}&deg;, {lng.toFixed(4)}&deg;
          </div>
        </div>
      </div>
      <a
        href={mapsLink}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors',
          isOwn
            ? 'text-white/80 bg-white/5 hover:bg-white/10'
            : 'text-[var(--accent)] bg-[var(--accent-subtle)] hover:bg-[var(--accent-muted)]'
        )}
        onClick={e => e.stopPropagation()}
      >
        Open in Google Maps
      </a>
    </div>
  );
}

// ─── Reactions Display ───
function ReactionsBar({ reactions, isOwn, onReact }: {
  reactions: { emoji: string; count: number; isOwn: boolean }[];
  isOwn: boolean;
  onReact?: (emoji: string) => void;
}) {
  if (!reactions?.length) return null;

  return (
    <div className={cn('flex flex-wrap gap-1 mt-1', isOwn ? 'justify-end' : 'justify-start')}>
      {reactions.map(({ emoji, count, isOwn: reacted }) => (
        <button
          key={emoji}
          onClick={() => onReact?.(emoji)}
          className={cn(
            'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs transition-all',
            'hover:scale-105 active:scale-95',
            reacted
              ? 'bg-[var(--accent-subtle)] border border-[var(--accent-muted)] text-[var(--accent)]'
              : 'bg-[var(--bg-wash)] border border-[var(--border)] text-[var(--text-secondary)]'
          )}
          aria-label={`${emoji} ${count} reaction${count > 1 ? 's' : ''}`}
        >
          <span className="text-sm">{emoji}</span>
          <span className="font-medium">{count}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Reply Preview ───
function ReplyPreview({ replyTo, isOwn, onJump }: {
  replyTo: NonNullable<MessageBubbleProps['replyTo']>;
  isOwn: boolean;
  onJump?: () => void;
}) {
  return (
    <button
      onClick={onJump}
      className={cn(
        'w-full mb-1.5 border-l-[3px] pl-2.5 py-1 rounded-r-md text-left transition-colors cursor-pointer',
        isOwn
          ? 'border-white/40 bg-white/10 hover:bg-white/15'
          : 'border-[var(--accent)] bg-[var(--accent)]/5 hover:bg-[var(--accent)]/10'
      )}
    >
      <p className={cn('font-semibold text-[11px] truncate', isOwn ? 'text-white/80' : 'text-[var(--accent)]')}>
        {replyTo.senderName}
      </p>
      <p className={cn('text-[11px] truncate', isOwn ? 'text-white/55' : 'text-[var(--text-muted)]')}>
        {replyTo.content}
      </p>
    </button>
  );
}

// ─── Message Footer (time + status) ───
function MessageFooter({ timestamp, status, isOwn, isStarred, isPinned, isForwarded, editedAt, className }: {
  timestamp: string;
  status: string;
  isOwn: boolean;
  isStarred?: boolean;
  isPinned?: boolean;
  isForwarded?: boolean;
  editedAt?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-1 justify-end mt-0.5', className)}>
      {isForwarded && (
        <span className={cn('text-[10px] italic', isOwn ? 'text-white/40' : 'text-[var(--text-muted)]')}>
          forwarded
        </span>
      )}
      {isPinned && (
        <Pin className={cn('w-2.5 h-2.5', isOwn ? 'text-white/40' : 'text-[var(--accent)] opacity-60')} />
      )}
      {isStarred && (
        <Star className={cn('w-2.5 h-2.5 fill-current', isOwn ? 'text-yellow-300/70' : 'text-yellow-500')} />
      )}
      {editedAt && (
        <span className={cn('text-[9px] italic', isOwn ? 'text-white/40' : 'text-[var(--text-muted)]')}>
          edited
        </span>
      )}
      <span className={cn('text-[10px] leading-none ml-0.5', isOwn ? 'text-white/45' : 'text-[var(--text-muted)]')}>
        {formatMessageTime(timestamp)}
      </span>
      {isOwn && <StatusIndicator status={status as 'pending' | 'sent' | 'delivered' | 'read' | 'failed'} className={isOwn ? '[&_*]:!text-inherit' : ''} />}
    </div>
  );
}

// ─── Main MessageBubble Component ───
const MessageBubble = memo(function MessageBubble({
  id,
  content,
  variant,
  status,
  isOwn,
  senderName,
  senderColor,
  timestamp,
  editedAt,
  position,
  reactions,
  fileData,
  replyTo,
  isStarred,
  isPinned,
  isForwarded,
  isHighlighted,
  isSelected,
  selectionMode,
  onReply,
  onReact,
  onContextMenu,
  onSelect,
  onRetry,
  onPreview,
  onDownload,
  onJumpToReply,
}: MessageBubbleProps) {
  const [hovered, setHovered] = useState(false);
  const bubbleRef = useRef<HTMLDivElement>(null);

  const isPending = status === 'pending';
  const isFailed = status === 'failed';
  const showSender = !isOwn && senderName && (position === 'first' || position === 'single');
  const bubbleRadius = getBubbleRadius(position, isOwn);

  // Spacing based on grouping
  const spacing = position === 'first' || position === 'single' ? 'mt-3' : 'mt-[3px]';

  // Swipe-to-reply gesture support
  const touchStartX = useRef(0);
  const touchDelta = useRef(0);
  const [swipeOffset, setSwipeOffset] = useState(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (selectionMode) return;
    touchStartX.current = e.touches[0].clientX;
    touchDelta.current = 0;
  }, [selectionMode]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (selectionMode) return;
    const delta = e.touches[0].clientX - touchStartX.current;
    const direction = isOwn ? -1 : 1;
    const offset = Math.max(0, delta * direction);
    touchDelta.current = offset;
    setSwipeOffset(Math.min(offset, 80));
  }, [selectionMode, isOwn]);

  const handleTouchEnd = useCallback(() => {
    if (touchDelta.current > 60 && onReply) {
      onReply();
    }
    setSwipeOffset(0);
    touchDelta.current = 0;
  }, [onReply]);

  // Animation class for new messages

  // ─── Render content based on variant ───
  const renderContent = () => {
    switch (variant) {
      case 'image':
        if (!fileData?.file_id) return <span className="text-sm opacity-60">Image unavailable</span>;
        return (
          <div className="relative cursor-pointer" onClick={() => onPreview?.(fileData)}>
            <ProgressiveImage
              fileId={fileData.file_id}
              className="w-full max-w-[320px] min-h-[100px] max-h-[320px]"
              useThumbnail
            />
            {/* Gradient overlay for timestamp */}
            <div className="absolute bottom-0 right-0 left-0 bg-gradient-to-t from-black/60 to-transparent px-3 py-1.5 rounded-b-xl">
              <MessageFooter
                timestamp={timestamp}
                status={status}
                isOwn={isOwn}
                isStarred={isStarred}
                isPinned={isPinned}
                editedAt={editedAt}
                className="[&_span]:text-white/80 [&_svg]:text-white/70"
              />
            </div>
          </div>
        );

      case 'audio':
      case 'voice':
        if (!fileData) return <span className="text-sm opacity-60">Audio unavailable</span>;
        return (
          <div className="px-3.5 py-2.5">
            <AudioBubble fileData={fileData} isOwn={isOwn} />
          </div>
        );

      case 'file':
        if (!fileData) return <span className="text-sm opacity-60">File unavailable</span>;
        const info = getFileInfo(fileData.mime_type, fileData.filename);
        return (
          <div className="px-3 py-2.5">
            <div className={cn(
              'flex items-center gap-3 p-2.5 rounded-xl transition-colors',
              isOwn ? 'bg-white/10 hover:bg-white/15' : 'bg-[var(--bg-wash)] hover:bg-[var(--hover)]'
            )}>
              <div className={cn(
                'w-11 h-11 rounded-xl flex items-center justify-center text-white text-lg flex-shrink-0 shadow-sm',
                info.color
              )}>
                <span>{info.icon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn('text-sm font-medium truncate', isOwn ? 'text-white' : 'text-[var(--text-primary)]')}>
                  {fileData.filename || 'File'}
                </p>
                <p className={cn('text-xs mt-0.5', isOwn ? 'text-white/55' : 'text-[var(--text-muted)]')}>
                  {info.label}{fileData.file_size ? ` · ${formatSize(fileData.file_size)}` : ''}
                </p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onDownload?.(fileData); }}
                className={cn(
                  'w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0',
                  'transition-all duration-150 active:scale-90',
                  isOwn
                    ? 'bg-white/15 hover:bg-white/25 text-white'
                    : 'bg-[var(--accent-subtle)] hover:bg-[var(--accent-muted)] text-[var(--accent)]'
                )}
                aria-label={`Download ${fileData.filename}`}
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>
        );

      case 'location':
        try {
          const loc = JSON.parse(content);
          if (loc.lat != null && loc.lng != null) {
            return <LocationContent lat={loc.lat} lng={loc.lng} isOwn={isOwn} />;
          }
        } catch { }
        return <span className="text-sm">Location</span>;

      case 'gif':
        try {
          const gif = JSON.parse(content);
          if (gif.url) {
            return (
              <div className="rounded-xl overflow-hidden max-w-[280px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={gif.previewUrl || gif.url}
                  alt={gif.title || 'GIF'}
                  className="w-full rounded-xl"
                  loading="lazy"
                />
                <span className="text-[9px] opacity-30 mt-0.5 block px-1">via GIPHY</span>
              </div>
            );
          }
        } catch { }
        return <span className="text-sm">{content}</span>;

      case 'system':
        return null; // Rendered differently

      default: // text
        return (
          <div className="leading-relaxed whitespace-pre-wrap break-words text-[14px]">
            {renderTextContent(content, isOwn)}
          </div>
        );
    }
  };

  // ─── Text content with @mention highlighting ───
  function renderTextContent(text: string, isOwn: boolean) {
    // Check for special JSON content
    try {
      const parsed = JSON.parse(text.trim());
      if (parsed.type === 'location' && parsed.lat != null) {
        return <LocationContent lat={parsed.lat} lng={parsed.lng} isOwn={isOwn} />;
      }
      if (parsed.type === 'gif' && parsed.url) {
        return (
          <div className="rounded-xl overflow-hidden max-w-[280px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={parsed.previewUrl || parsed.url} alt={parsed.title || 'GIF'} className="w-full rounded-xl" loading="lazy" />
            <span className="text-[9px] opacity-30 mt-0.5 block">via GIPHY</span>
          </div>
        );
      }
      if (parsed.type === 'poll' && parsed.pollId) {
        // PollBubble is loaded from the parent — just show text
        return <span>📊 Poll</span>;
      }
    } catch {
      // Not JSON, treat as text
    }

    // @mention highlighting
    const mentionRegex = /@(\w+)/g;
    const parts = text.split(mentionRegex);
    if (parts.length > 1) {
      return parts.map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className={cn(
            'font-semibold cursor-pointer hover:underline',
            isOwn ? 'text-white/90' : 'text-[var(--accent)]'
          )}>
            @{part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      );
    }

    // URL detection & highlighting
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urlParts = text.split(urlRegex);
    if (urlParts.length > 1) {
      return urlParts.map((part, i) =>
        urlRegex.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className={cn('underline underline-offset-2', isOwn ? 'text-white/90' : 'text-[var(--accent)]')}
            onClick={e => e.stopPropagation()}
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      );
    }

    return text;
  }

  // ─── System message ───
  if (variant === 'system') {
    return (
      <div className="flex justify-center my-3">
        <span className="text-[11px] text-[var(--text-muted)] bg-[var(--bg-elevated)] px-3 py-1 rounded-lg shadow-[var(--shadow-xs)] select-none">
          {content}
        </span>
      </div>
    );
  }

  // ─── Encrypted/deleted message ───
  const isEncrypted = content?.startsWith('{') && (content.includes('"ct"') || content.includes('"ciphertext"'));
  const isDeleted = content === 'This message was deleted';

  return (
    <div
      ref={bubbleRef}
      id={`msg-${id}`}
      className={cn(
        'flex group/msg message-bubble-wrapper',
        isOwn ? 'justify-end' : 'justify-start',
        spacing,
        selectionMode && 'cursor-pointer',
        isHighlighted && 'bg-[var(--accent-subtle)] rounded-lg -mx-2 px-2 py-1 transition-all duration-1000',
        isSelected && 'bg-[var(--accent-subtle)] rounded-lg -mx-2 px-2 py-0.5',
      )}
      onContextMenu={selectionMode ? undefined : onContextMenu}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDoubleClick={selectionMode ? undefined : onReply}
      onClick={selectionMode ? onSelect : undefined}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      role={selectionMode ? 'checkbox' : 'article'}
      aria-checked={selectionMode ? isSelected : undefined}
      aria-label={`Message from ${isOwn ? 'you' : senderName || 'someone'}: ${isDeleted ? 'deleted' : isEncrypted ? 'encrypted' : content?.slice(0, 100)}`}
    >
      {/* Selection checkbox */}
      {selectionMode && (
        <div className={cn('flex items-center flex-shrink-0', isOwn ? 'order-last ml-2' : 'mr-2')}>
          <div className={cn(
            'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-150',
            isSelected
              ? 'bg-[var(--accent)] border-[var(--accent)] scale-100'
              : 'border-[var(--text-muted)] bg-transparent scale-90'
          )}>
            {isSelected && <Check className="w-3 h-3 text-white" />}
          </div>
        </div>
      )}

      {/* Swipe reply indicator */}
      {swipeOffset > 10 && (
        <div className={cn(
          'flex items-center justify-center w-8',
          isOwn ? 'order-last' : 'order-first'
        )}
          style={{ opacity: Math.min(swipeOffset / 60, 1) }}
        >
          <Reply className="w-4 h-4 text-[var(--accent)]" />
        </div>
      )}

      <div
        className={cn('max-w-[75%] lg:max-w-[55%] relative')}
        style={{
          transform: swipeOffset > 0 ? `translateX(${isOwn ? -swipeOffset : swipeOffset}px)` : undefined,
          transition: swipeOffset === 0 ? 'transform 0.2s ease' : undefined,
        }}
      >
        {/* Hover action buttons */}
        {hovered && !isFailed && !selectionMode && (
          <div className={cn(
            'absolute -top-7 z-10 flex items-center gap-0.5 opacity-0 group-hover/msg:opacity-100 transition-opacity duration-150',
            isOwn ? 'right-0' : 'left-0'
          )}>
            <button
              onClick={onReply}
              className="p-1.5 bg-[var(--bg-surface)] border border-[var(--border)] rounded-full shadow-sm text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent-muted)] transition-colors"
              title="Reply"
              aria-label="Reply to this message"
            >
              <Reply className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onContextMenu?.(e); }}
              className="p-1.5 bg-[var(--bg-surface)] border border-[var(--border)] rounded-full shadow-sm text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent-muted)] transition-colors"
              title="More options"
              aria-label="More options"
            >
              <MoreHorizontal className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Bubble content */}
        <div className={cn(
          'overflow-hidden text-sm transition-all duration-150',
          bubbleRadius,
          // Bubble colors
          variant === 'image'
            ? '' // Images render their own background
            : isOwn
              ? 'bubble-own shadow-[var(--shadow-xs)]'
              : 'bubble-other shadow-[var(--shadow-xs)]',
          // States
          isFailed && '!bg-red-600/90 text-white',
          isPending && 'opacity-60',
        )}>
          {/* Sender name */}
          {showSender && (
            <p className={cn(
              'text-[11px] font-semibold px-3.5 pt-2.5 pb-0',
              senderColor || 'text-[var(--accent)]'
            )}>
              {senderName}
            </p>
          )}

          {/* Reply preview */}
          {replyTo && (
            <div className="px-3.5 pt-2">
              <ReplyPreview
                replyTo={replyTo}
                isOwn={isOwn}
                onJump={() => onJumpToReply?.(replyTo.id)}
              />
            </div>
          )}

          {/* Main content */}
          {variant === 'image' ? (
            renderContent()
          ) : (
            <div className="px-3.5 py-2">
              {isEncrypted ? (
                <span className="italic opacity-60 flex items-center gap-1.5 text-sm">
                  <Lock className="w-3.5 h-3.5" />
                  Encrypted message
                </span>
              ) : isDeleted ? (
                <span className="italic opacity-50 text-sm">This message was deleted</span>
              ) : (
                renderContent()
              )}
              <MessageFooter
                timestamp={timestamp}
                status={status}
                isOwn={isOwn}
                isStarred={isStarred}
                isPinned={isPinned}
                isForwarded={isForwarded}
                editedAt={editedAt}
              />
            </div>
          )}
        </div>

        {/* Reactions */}
        {reactions && reactions.length > 0 && (
          <ReactionsBar reactions={reactions} isOwn={isOwn} onReact={onReact} />
        )}

        {/* Failed state retry */}
        {isFailed && onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center gap-1 mt-1 text-xs text-red-400 hover:text-red-300 transition-colors"
            aria-label="Retry sending message"
          >
            <AlertCircle className="w-3 h-3" />
            <span>Failed</span>
            <RefreshCw className="w-3 h-3" />
            <span>Retry</span>
          </button>
        )}
      </div>
    </div>
  );
});

export default MessageBubble;
