// ═══════════════════════════════════════════════════════
// ZYNK UI — Call Overlay (Discord-style)
// Full-screen overlay for voice/video calls with PiP
// ═══════════════════════════════════════════════════════

'use client';

import { useState, useEffect, useRef } from 'react';
import { useCallStore } from '@/stores/callStore';
import { ZAvatar } from '@/components/ui';
import { cn } from '@/lib/utils';
import {
  Phone, PhoneOff, Mic, MicOff, Video, VideoOff,
  Minimize2, RotateCcw, Loader2,
  Wifi, Signal, SignalLow, PhoneIncoming,
} from 'lucide-react';

export default function CallOverlay() {
  const {
    status, callType, remoteUser, localUser,
    localStream, remoteStream,
    isAudioMuted, isVideoOff, isRemoteVideoOff,
    connectionQuality, callStartTime,
    answerCall, declineCall, endCall, toggleAudio, toggleVideo, switchCamera,
  } = useCallStore();

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [timer, setTimer] = useState('00:00');

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

  useEffect(() => {
    if (status !== 'connected' || !callStartTime) return;
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
      const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
      const secs = (elapsed % 60).toString().padStart(2, '0');
      setTimer(`${mins}:${secs}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [status, callStartTime]);

  if (status === 'idle' || status === 'ended') return null;

  const isVideo = callType === 'video';
  const isIncoming = status === 'incoming';
  const isRinging = status === 'ringing' || status === 'initiating';
  const isConnecting = status === 'connecting' || status === 'requesting_permission';
  const isConnected = status === 'connected';
  const isReconnecting = status === 'reconnecting';
  const remoteName = remoteUser?.displayName || remoteUser?.username || 'Unknown';

  const QualityIcon = connectionQuality === 'excellent' || connectionQuality === 'good'
    ? Signal
    : connectionQuality === 'poor' ? SignalLow : Wifi;

  /* ── Minimized PiP View ── */
  if (isMinimized && isConnected) {
    return (
      <div
        className="fixed bottom-20 right-4 z-[60] w-44 h-60 rounded-2xl overflow-hidden shadow-2xl border-2 border-border bg-black cursor-pointer animate-appear"
        onClick={() => setIsMinimized(false)}
      >
        {isVideo && remoteStream ? (
          <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-b from-[#1a1a2e] to-[#0a0a18] flex flex-col items-center justify-center gap-2">
            <ZAvatar name={remoteName} size="lg" />
            <span className="text-white text-xs font-medium">{remoteName}</span>
            <span className="text-white/60 text-[10px] tabular-nums">{timer}</span>
          </div>
        )}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); toggleAudio(); }}
            className="w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center"
          >
            {isAudioMuted ? <MicOff className="w-4 h-4 text-destructive" /> : <Mic className="w-4 h-4" />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); endCall(); }}
            className="w-8 h-8 rounded-full bg-destructive text-white flex items-center justify-center"
          >
            <PhoneOff className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] bg-[#0a0a18] flex flex-col animate-appear">
      {/* Video background */}
      {isVideo && isConnected && remoteStream && (
        <video
          ref={remoteVideoRef}
          autoPlay playsInline
          className={cn('absolute inset-0 w-full h-full object-cover', isRemoteVideoOff && 'hidden')}
        />
      )}

      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/70 pointer-events-none" />

      {/* ─── Top Bar ─── */}
      <div className="relative z-10 flex items-center justify-between px-6 pt-6 pb-3">
        <div className="flex items-center gap-2">
          {isConnected && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 text-white/80 backdrop-blur-sm text-xs font-medium">
              <QualityIcon className="w-3.5 h-3.5" />
              {connectionQuality}
            </span>
          )}
          {isReconnecting && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-warning/20 text-warning text-xs font-medium">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Reconnecting
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isConnected && (
            <button
              onClick={() => setIsMinimized(true)}
              className="w-8 h-8 rounded-full bg-white/10 text-white backdrop-blur-sm hover:bg-white/20 flex items-center justify-center transition-colors"
              aria-label="Minimize"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* ─── Center Content ─── */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center">
        {(!isVideo || isRinging || isIncoming || isConnecting || isRemoteVideoOff) && (
          <div className="flex flex-col items-center gap-5 animate-appear">
            <div className={cn('relative', (isRinging || isIncoming) && 'animate-pulse')}>
              <ZAvatar
                name={remoteName}
                src={remoteUser?.avatarUrl}
                size="xl"
                className="w-28 h-28 text-2xl ring-4 ring-primary/30"
              />
              {isIncoming && (
                <div className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-success flex items-center justify-center animate-bounce shadow-lg shadow-success/30">
                  <PhoneIncoming className="w-4 h-4 text-white" />
                </div>
              )}
            </div>

            <div className="text-center">
              <h2 className="text-2xl font-bold text-white">{remoteName}</h2>
              <p className="text-sm text-white/60 mt-1.5">
                {isIncoming ? `Incoming ${callType} call...` :
                  isRinging ? 'Ringing...' :
                  isConnecting ? 'Connecting...' :
                  isReconnecting ? 'Reconnecting...' :
                  isConnected ? timer : 'Calling...'}
              </p>
            </div>
          </div>
        )}

        {/* Timer badge for video calls */}
        {isVideo && isConnected && !isRemoteVideoOff && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2">
            <span className="px-3 py-1 rounded-full bg-black/40 text-white backdrop-blur-sm text-xs font-medium tabular-nums">
              {timer}
            </span>
          </div>
        )}

        {/* Self-view PiP */}
        {isVideo && isConnected && localStream && (
          <div className="absolute bottom-24 right-6 w-32 h-44 rounded-xl overflow-hidden border-2 border-white/20 shadow-2xl">
            {isVideoOff ? (
              <div className="w-full h-full bg-[#1a1a2e] flex items-center justify-center">
                <ZAvatar
                  name={localUser?.displayName || localUser?.username || 'You'}
                  size="md"
                  className="ring-2 ring-primary/30"
                />
              </div>
            ) : (
              <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover mirror" />
            )}
          </div>
        )}
      </div>

      {/* ─── Controls ─── */}
      <div className="relative z-10 pb-10 pt-4">
        {isIncoming ? (
          <div className="flex items-center justify-center gap-14">
            <div className="flex flex-col items-center gap-2.5">
              <button
                onClick={declineCall}
                className="w-16 h-16 rounded-full bg-destructive text-white flex items-center justify-center shadow-lg shadow-destructive/30"
                aria-label="Decline call"
              >
                <PhoneOff className="w-6 h-6" />
              </button>
              <span className="text-xs text-white/60 font-medium">Decline</span>
            </div>
            <div className="flex flex-col items-center gap-2.5">
              <button
                onClick={answerCall}
                className="w-16 h-16 rounded-full bg-success text-white flex items-center justify-center shadow-lg shadow-success/30"
                aria-label="Accept call"
              >
                <Phone className="w-6 h-6" />
              </button>
              <span className="text-xs text-white/60 font-medium">Accept</span>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-5">
            <CallButton icon={isAudioMuted ? MicOff : Mic} label={isAudioMuted ? 'Unmute' : 'Mute'} active={isAudioMuted} onClick={toggleAudio} />
            {isVideo && <CallButton icon={isVideoOff ? VideoOff : Video} label={isVideoOff ? 'Camera On' : 'Camera Off'} active={isVideoOff} onClick={toggleVideo} />}
            {isVideo && <CallButton icon={RotateCcw} label="Switch" onClick={switchCamera} />}
            <CallButton icon={PhoneOff} label="End" danger onClick={endCall} />
          </div>
        )}
      </div>
    </div>
  );
}


function CallButton({
  icon: Icon, label, active, danger, onClick,
}: {
  icon: typeof Mic;
  label: string;
  active?: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={onClick}
        className={cn(
          'w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200',
          danger
            ? 'bg-destructive text-white shadow-lg shadow-destructive/30'
            : active
              ? 'bg-white/30 backdrop-blur-sm text-white'
              : 'bg-white/10 backdrop-blur-sm text-white/90 hover:bg-white/20',
        )}
        aria-label={label}
      >
        <Icon className="w-6 h-6" />
      </button>
      <span className="text-[10px] text-white/60 font-medium">{label}</span>
    </div>
  );
}
