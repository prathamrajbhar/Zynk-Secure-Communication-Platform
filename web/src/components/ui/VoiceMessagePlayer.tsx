// ═══════════════════════════════════════════════════════
// ZYNK — Voice Message Player
// WhatsApp/Telegram-style audio message with waveform
// ═══════════════════════════════════════════════════════

'use client';

import { useState, useRef, useEffect, useCallback, memo } from 'react';
import { Play, Pause } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VoiceMessagePlayerProps {
  src: string;
  duration: number;
  isMine?: boolean;
  senderName?: string;
  senderAvatar?: string;
  waveformData?: number[];
  className?: string;
  fetchBlobUrl?: (url: string) => Promise<string>;
}

const BAR_COUNT = 40;

function generateWaveformBars(data?: number[]): number[] {
  if (data && data.length >= BAR_COUNT) {
    return data.slice(0, BAR_COUNT);
  }
  // Generate deterministic pseudo-random bars from input or defaults
  const bars: number[] = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    const seed = data ? (data[i % data.length] || 0.5) : 0.5;
    const val = Math.abs(Math.sin(i * 1.7 + seed * 3.14)) * 0.7 + 0.15;
    bars.push(val);
  }
  return bars;
}

function VoiceMessagePlayer({
  src,
  duration,
  isMine = false,
  senderAvatar,
  waveformData,
  className,
  fetchBlobUrl,
}: VoiceMessagePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(duration || 0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const [resolvedSrc, setResolvedSrc] = useState<string>('');

  const waveform = generateWaveformBars(waveformData);

  // Resolve audio source (may need auth)
  useEffect(() => {
    if (fetchBlobUrl) {
      fetchBlobUrl(src).then(setResolvedSrc).catch(() => setResolvedSrc(src));
    } else {
      setResolvedSrc(src);
    }
  }, [src, fetchBlobUrl]);

  // Initialize audio element
  useEffect(() => {
    if (!resolvedSrc) return;

    const audio = new Audio(resolvedSrc);
    audioRef.current = audio;

    audio.addEventListener('loadedmetadata', () => {
      if (audio.duration && isFinite(audio.duration)) {
        setAudioDuration(audio.duration);
      }
    });

    audio.addEventListener('ended', () => {
      setIsPlaying(false);
      setCurrentTime(0);
    });

    return () => {
      cancelAnimationFrame(rafRef.current);
      audio.pause();
      audio.src = '';
    };
  }, [resolvedSrc]);

  // Animation frame updater
  const updateProgress = useCallback(() => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      if (!audioRef.current.paused) {
        rafRef.current = requestAnimationFrame(updateProgress);
      }
    }
  }, []);

  // Toggle playback
  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      cancelAnimationFrame(rafRef.current);
      setIsPlaying(false);
    } else {
      try {
        await audio.play();
        setIsPlaying(true);
        rafRef.current = requestAnimationFrame(updateProgress);
      } catch {
        // Playback blocked
      }
    }
  }, [isPlaying, updateProgress]);

  // Cycle playback speed
  const cycleSpeed = useCallback(() => {
    const speeds = [1, 1.5, 2];
    const nextIdx = (speeds.indexOf(playbackRate) + 1) % speeds.length;
    const newRate = speeds[nextIdx];
    setPlaybackRate(newRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = newRate;
    }
  }, [playbackRate]);

  // Seek on waveform click
  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    const container = progressRef.current;
    if (!audio || !container) return;

    const rect = container.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newTime = ratio * audioDuration;
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  }, [audioDuration]);

  const progress = audioDuration > 0 ? (currentTime / audioDuration) * 100 : 0;
  const activeBarIndex = Math.floor((progress / 100) * BAR_COUNT);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className={cn('flex items-center gap-2.5 min-w-[220px] max-w-[320px]', className)}>
      {/* Play button */}
      <button
        onClick={togglePlay}
        className={cn(
          'relative w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0',
          'transition-all duration-200',
          isMine
            ? 'bg-white/20 hover:bg-white/30 text-white'
            : 'bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white',
        )}
        aria-label={isPlaying ? 'Pause voice message' : 'Play voice message'}
      >
        {isPlaying ? (
          <Pause className="w-4.5 h-4.5" fill="currentColor" />
        ) : (
          <Play className="w-4.5 h-4.5 ml-0.5" fill="currentColor" />
        )}

        {/* Mini avatar overlay (WhatsApp style) */}
        {senderAvatar && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={senderAvatar}
            alt=""
            className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border border-[var(--bg-primary)]"
          />
        )}
      </button>

      {/* Waveform + time */}
      <div className="flex-1 flex flex-col gap-1 min-w-0">
        {/* Waveform bars */}
        <div
          ref={progressRef}
          onClick={handleSeek}
          className="flex items-end gap-[2px] h-[28px] cursor-pointer group"
          role="slider"
          aria-label="Audio progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
        >
          {waveform.map((bar, i) => (
            <div
              key={i}
              className={cn(
                'flex-1 rounded-full transition-colors duration-150',
                'min-w-[2px] max-w-[4px]',
                i <= activeBarIndex
                  ? isMine
                    ? 'bg-white/90'
                    : 'bg-[var(--accent)]'
                  : isMine
                    ? 'bg-white/30 group-hover:bg-white/40'
                    : 'bg-[var(--text-muted)]/30 group-hover:bg-[var(--text-muted)]/40',
              )}
              style={{ height: `${bar * 100}%` }}
            />
          ))}
        </div>

        {/* Time + speed */}
        <div className="flex items-center justify-between">
          <span className={cn(
            'text-[11px] font-mono tabular-nums',
            isMine ? 'text-white/70' : 'text-[var(--text-muted)]',
          )}>
            {isPlaying || currentTime > 0
              ? formatTime(currentTime)
              : formatTime(audioDuration)
            }
          </span>

          {(isPlaying || currentTime > 0) && (
            <button
              onClick={cycleSpeed}
              className={cn(
                'text-[10px] font-bold px-1.5 py-0.5 rounded-md transition-colors',
                isMine
                  ? 'bg-white/20 text-white/80 hover:bg-white/30'
                  : 'bg-[var(--hover)] text-[var(--text-secondary)] hover:bg-[var(--active)]',
              )}
            >
              {playbackRate}×
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(VoiceMessagePlayer);
