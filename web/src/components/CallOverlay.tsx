'use client';

/**
 * CallOverlay — Full-screen call UI (WhatsApp-style)
 *
 * Shows:
 * - Active call with video/avatar display
 * - Floating local video (draggable)
 * - Call controls bar (mute, video, end, etc.)
 * - Call timer
 * - Quality indicator
 * - Incoming call modal
 * - "Call ended" feedback
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useCallStore } from '@/stores/callStore';
import { getInitials, getAvatarColor, cn } from '@/lib/utils';
import {
  Phone, PhoneOff,
  Mic, MicOff, Video, VideoOff, SwitchCamera,
  WifiOff,
} from 'lucide-react';

// ── Call Timer ──
function CallTimer({ duration }: { duration: number }) {
  const mins = Math.floor(duration / 60).toString().padStart(2, '0');
  const secs = (duration % 60).toString().padStart(2, '0');
  return (
    <div className="text-white/90 text-sm font-mono tabular-nums tracking-wide">
      {mins}:{secs}
    </div>
  );
}

// ── Quality Indicator ──
function CallQualityIndicator({ quality, latency }: { quality: string; latency: number }) {
  const bars = quality === 'excellent' ? 4 : quality === 'good' ? 3 : quality === 'poor' ? 1 : 2;
  const color = quality === 'excellent' ? 'bg-green-400' : quality === 'good' ? 'bg-yellow-400' : 'bg-red-400';

  return (
    <div className="flex items-center gap-1.5" title={`${quality} (${Math.round(latency)}ms)`}>
      <div className="flex items-end gap-[2px] h-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={cn(
              'w-[3px] rounded-full transition-all duration-300',
              i <= bars ? color : 'bg-white/20'
            )}
            style={{ height: `${i * 4 + 2}px` }}
          />
        ))}
      </div>
      {quality !== 'unknown' && (
        <span className="text-[10px] text-white/60 font-medium">{Math.round(latency)}ms</span>
      )}
    </div>
  );
}

// ── Incoming Call Modal ──
function IncomingCallModal() {
  const { callType, remoteUser, answerCall, declineCall } = useCallStore();
  if (!remoteUser) return null;

  const name = remoteUser.displayName || remoteUser.username;
  const color = getAvatarColor(name);
  const isVideo = callType === 'video';

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-md">
      <div className="relative w-full max-w-sm mx-4">
        {/* Pulsing background */}
        <div className="absolute inset-0 rounded-3xl bg-gradient-to-b from-[var(--accent)]/20 to-transparent animate-pulse" />

        <div className="relative bg-[var(--bg-elevated)]/95 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/10">
          {/* Caller info */}
          <div className="flex flex-col items-center mb-8">
            <div className="relative mb-4">
              <div className={cn(
                'w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold',
                'ring-4 ring-[var(--accent)]/30 shadow-xl',
                color
              )}>
                {getInitials(name)}
              </div>
              {/* Ripple effect */}
              <div className="absolute inset-0 rounded-full border-2 border-[var(--accent)] animate-ping opacity-30" />
              <div className="absolute inset-[-4px] rounded-full border-2 border-[var(--accent)] animate-ping opacity-20" style={{ animationDelay: '0.5s' }} />
            </div>
            <h3 className="text-xl font-bold text-[var(--text-primary)]">{name}</h3>
            <p className="text-sm text-[var(--text-muted)] mt-1 flex items-center gap-1.5">
              {isVideo ? <Video className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
              Incoming {isVideo ? 'video' : 'voice'} call
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-center gap-8">
            <button
              onClick={declineCall}
              className="flex flex-col items-center gap-2 group"
            >
              <div className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg shadow-red-500/30 transition-all active:scale-90">
                <PhoneOff className="w-7 h-7 text-white" />
              </div>
              <span className="text-xs text-[var(--text-muted)] group-hover:text-red-400 transition-colors">Decline</span>
            </button>
            <button
              onClick={answerCall}
              className="flex flex-col items-center gap-2 group"
            >
              <div className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center shadow-lg shadow-green-500/30 transition-all active:scale-90">
                <Phone className="w-7 h-7 text-white" />
              </div>
              <span className="text-xs text-[var(--text-muted)] group-hover:text-green-400 transition-colors">Answer</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Ringing Screen (caller waiting for answer) ──
function RingingScreen() {
  const { remoteUser, callType, endCall } = useCallStore();
  if (!remoteUser) return null;

  const name = remoteUser.displayName || remoteUser.username;
  const color = getAvatarColor(name);

  return (
    <div className="fixed inset-0 z-[9998] flex flex-col items-center justify-center bg-gradient-to-b from-gray-900 via-gray-800 to-black">
      <div className="flex flex-col items-center">
        <div className="relative mb-6">
          <div className={cn(
            'w-28 h-28 rounded-full flex items-center justify-center text-white text-3xl font-bold shadow-2xl',
            color
          )}>
            {getInitials(name)}
          </div>
          <div className="absolute inset-0 rounded-full border-2 border-white/20 animate-ping" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">{name}</h2>
        <p className="text-white/60 flex items-center gap-2">
          <span className="flex gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: '200ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: '400ms' }} />
          </span>
          Calling
        </p>
      </div>

      {/* End call button */}
      <div className="absolute bottom-20">
        <button
          onClick={endCall}
          className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg shadow-red-500/30 transition-all active:scale-90"
        >
          <PhoneOff className="w-7 h-7 text-white" />
        </button>
      </div>
    </div>
  );
}

// ── Active Call Screen ──
function ActiveCallScreen() {
  const {
    callType, remoteUser, localStream, remoteStream,
    isAudioMuted, isVideoOff, isRemoteVideoOff, isRemoteAudioMuted,
    connectionQuality, latencyMs, callDuration,
    toggleAudio, toggleVideo, switchCamera, endCall, status,
    localAudioLevel,
  } = useCallStore();

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [showControls, setShowControls] = useState(true);
  const [localVideoPos, setLocalVideoPos] = useState({ x: 16, y: 16 });
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isVideo = callType === 'video';
  const name = remoteUser?.displayName || remoteUser?.username || 'Unknown';
  const color = getAvatarColor(name);

  // Attach streams to video elements
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // Auto-hide controls after 4s of inactivity (video only)
  useEffect(() => {
    if (!isVideo) return;
    const resetTimer = () => {
      setShowControls(true);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 4000);
    };
    resetTimer();
    return () => { if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current); };
  }, [isVideo]);

  const handleScreenTap = useCallback(() => {
    if (isVideo) {
      setShowControls((prev) => !prev);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 4000);
    }
  }, [isVideo]);

  // Draggable local video
  useEffect(() => {
    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!dragRef.current) return;
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
      const dx = clientX - dragRef.current.startX;
      const dy = clientY - dragRef.current.startY;
      setLocalVideoPos({
        x: Math.max(8, Math.min(window.innerWidth - 168, dragRef.current.startPosX + dx)),
        y: Math.max(8, Math.min(window.innerHeight - 228, dragRef.current.startPosY + dy)),
      });
    };
    const handleUp = () => { dragRef.current = null; };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchmove', handleMove);
    window.addEventListener('touchend', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleUp);
    };
  }, []);

  const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    dragRef.current = { startX: clientX, startY: clientY, startPosX: localVideoPos.x, startPosY: localVideoPos.y };
  }, [localVideoPos]);

  return (
    <div
      className="fixed inset-0 z-[9998] bg-gray-900 flex flex-col"
      onClick={handleScreenTap}
    >
      {/* Remote video / avatar background */}
      {isVideo && remoteStream && !isRemoteVideoOff ? (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-b from-gray-800 to-gray-900 flex items-center justify-center">
          <div className="flex flex-col items-center">
            <div className={cn(
              'w-32 h-32 rounded-full flex items-center justify-center text-white text-4xl font-bold shadow-2xl',
              'ring-4 transition-all duration-300',
              localAudioLevel === 'high' || localAudioLevel === 'medium'
                ? 'ring-[var(--accent)]/50 scale-105'
                : 'ring-white/10',
              color
            )}>
              {getInitials(name)}
            </div>
            <h2 className="text-xl font-bold text-white mt-4">{name}</h2>
            {isRemoteAudioMuted && (
              <div className="flex items-center gap-1 mt-2 px-3 py-1 rounded-full bg-red-500/20 text-red-300 text-xs">
                <MicOff className="w-3 h-3" />
                <span>Muted</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className={cn(
        'relative z-10 flex items-center justify-between px-4 py-3 transition-opacity duration-300',
        isVideo && !showControls ? 'opacity-0' : 'opacity-100'
      )}>
        <div className="flex items-center gap-3">
          <div className="bg-black/40 backdrop-blur-md rounded-full px-3 py-1.5 flex items-center gap-2">
            {status === 'reconnecting' ? (
              <>
                <WifiOff className="w-4 h-4 text-yellow-400" />
                <span className="text-xs text-yellow-400 font-medium">Reconnecting...</span>
              </>
            ) : (
              <CallQualityIndicator quality={connectionQuality} latency={latencyMs} />
            )}
          </div>
        </div>
        <div className="bg-black/40 backdrop-blur-md rounded-full px-3 py-1.5">
          <CallTimer duration={callDuration} />
        </div>
      </div>

      {/* Local video (floating, draggable) */}
      {isVideo && localStream && !isVideoOff && (
        <div
          className="absolute z-20 rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20 cursor-move select-none"
          style={{
            width: 160,
            height: 220,
            left: localVideoPos.x,
            top: localVideoPos.y,
          }}
          onMouseDown={handleDragStart}
          onTouchStart={handleDragStart}
          onClick={(e) => e.stopPropagation()}
        >
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover [transform:scaleX(-1)]"
          />
        </div>
      )}

      {/* Bottom controls */}
      <div className={cn(
        'absolute bottom-0 left-0 right-0 z-10 pb-10 pt-6 px-4 transition-all duration-300',
        'bg-gradient-to-t from-black/80 to-transparent',
        isVideo && !showControls ? 'translate-y-full opacity-0' : 'translate-y-0 opacity-100'
      )}>
        <div className="flex items-center justify-center gap-5">
          {/* Mute */}
          <button
            onClick={(e) => { e.stopPropagation(); toggleAudio(); }}
            className={cn(
              'w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-90 shadow-lg',
              isAudioMuted
                ? 'bg-white text-gray-900'
                : 'bg-white/15 text-white hover:bg-white/25 backdrop-blur-md'
            )}
            title={isAudioMuted ? 'Unmute' : 'Mute'}
          >
            {isAudioMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          </button>

          {/* Video toggle */}
          {isVideo && (
            <button
              onClick={(e) => { e.stopPropagation(); toggleVideo(); }}
              className={cn(
                'w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-90 shadow-lg',
                isVideoOff
                  ? 'bg-white text-gray-900'
                  : 'bg-white/15 text-white hover:bg-white/25 backdrop-blur-md'
              )}
              title={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
            >
              {isVideoOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
            </button>
          )}

          {/* End call */}
          <button
            onClick={(e) => { e.stopPropagation(); endCall(); }}
            className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg shadow-red-500/30 transition-all active:scale-90"
            title="End call"
          >
            <PhoneOff className="w-7 h-7 text-white" />
          </button>

          {/* Switch camera (video only) */}
          {isVideo && (
            <button
              onClick={(e) => { e.stopPropagation(); switchCamera(); }}
              className="w-14 h-14 rounded-full bg-white/15 text-white hover:bg-white/25 flex items-center justify-center transition-all active:scale-90 shadow-lg backdrop-blur-md"
              title="Switch camera"
            >
              <SwitchCamera className="w-6 h-6" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Export ──
export default function CallOverlay() {
  const status = useCallStore((s) => s.status);
  const error = useCallStore((s) => s.error);

  if (status === 'idle' && !error) return null;

  // Error toast display
  if (status === 'idle' && error) {
    return (
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[10000]">
        <div className="bg-red-500/90 backdrop-blur-md text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-2 text-sm font-medium">
          <PhoneOff className="w-4 h-4" />
          {error}
        </div>
      </div>
    );
  }

  // Incoming call
  if (status === 'incoming') {
    return <IncomingCallModal />;
  }

  // Ringing (caller waiting)
  if (status === 'ringing' || status === 'initiating' || status === 'requesting_permission') {
    return <RingingScreen />;
  }

  // Call ended briefly
  if (status === 'ended') {
    return (
      <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/80">
        <div className="text-center">
          <PhoneOff className="w-12 h-12 text-white/60 mx-auto mb-3" />
          <p className="text-white text-lg font-medium">Call ended</p>
        </div>
      </div>
    );
  }

  // Active call (connecting, connected, reconnecting)
  if (['connecting', 'connected', 'reconnecting'].includes(status)) {
    return <ActiveCallScreen />;
  }

  return null;
}
