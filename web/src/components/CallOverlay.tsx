// ═══════════════════════════════════════════════════════
// ZYNK UI — Call Overlay (HeroUI Redesign)
// Full-screen overlay for voice/video calls with PiP
// ═══════════════════════════════════════════════════════

'use client';

import { useState, useEffect, useRef } from 'react';
import { useCallStore } from '@/stores/callStore';
import { Avatar, Button, Chip } from '@heroui/react';
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
        className="fixed bottom-20 right-4 z-[60] w-44 h-60 rounded-2xl overflow-hidden shadow-2xl border-2 border-default-200 bg-black cursor-pointer animate-scale-in"
        onClick={() => setIsMinimized(false)}
      >
        {isVideo && remoteStream ? (
          <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-b from-[#1a1a2e] to-[#0a0a18] flex flex-col items-center justify-center gap-2">
            <Avatar name={remoteName} size="lg" className="ring-2 ring-primary/40" />
            <span className="text-white text-xs font-medium">{remoteName}</span>
            <span className="text-white/60 text-[10px] tabular-nums">{timer}</span>
          </div>
        )}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-2">
          <Button
            isIconOnly size="sm" radius="full" variant="flat"
            className="bg-black/60 text-white min-w-8 w-8 h-8"
            onPress={() => { toggleAudio(); }}
          >
            {isAudioMuted ? <MicOff className="w-4 h-4 text-danger" /> : <Mic className="w-4 h-4" />}
          </Button>
          <Button
            isIconOnly size="sm" radius="full" color="danger"
            className="min-w-8 w-8 h-8"
            onPress={() => endCall()}
          >
            <PhoneOff className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] bg-[#0a0a18] flex flex-col animate-fade-in">
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
            <Chip size="sm" variant="flat" className="bg-white/10 text-white/80 backdrop-blur-sm border-0"
              startContent={<QualityIcon className="w-3.5 h-3.5" />}
            >
              {connectionQuality}
            </Chip>
          )}
          {isReconnecting && (
            <Chip size="sm" variant="flat" className="bg-warning/20 text-warning border-0"
              startContent={<Loader2 className="w-3.5 h-3.5 animate-spin" />}
            >
              Reconnecting
            </Chip>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isConnected && (
            <Button
              isIconOnly size="sm" radius="full" variant="flat"
              className="bg-white/10 text-white backdrop-blur-sm hover:bg-white/20"
              onPress={() => setIsMinimized(true)}
              aria-label="Minimize"
            >
              <Minimize2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* ─── Center Content ─── */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center">
        {(!isVideo || isRinging || isIncoming || isConnecting || isRemoteVideoOff) && (
          <div className="flex flex-col items-center gap-5 animate-appear">
            <div className={cn('relative', (isRinging || isIncoming) && 'animate-pulse-soft')}>
              <Avatar
                name={remoteName}
                src={remoteUser?.avatarUrl}
                isBordered
                color="primary"
                className="w-28 h-28 text-2xl"
              />
              {isIncoming && (
                <div className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-success flex items-center justify-center animate-bounce shadow-lg shadow-success/30">
                  <PhoneIncoming className="w-4.5 h-4.5 text-white" />
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
            <Chip size="sm" variant="flat" className="bg-black/40 text-white backdrop-blur-sm border-0 tabular-nums font-medium">
              {timer}
            </Chip>
          </div>
        )}

        {/* Self-view PiP */}
        {isVideo && isConnected && localStream && (
          <div className="absolute bottom-24 right-6 w-32 h-44 rounded-xl overflow-hidden border-2 border-white/20 shadow-2xl">
            {isVideoOff ? (
              <div className="w-full h-full bg-[#1a1a2e] flex items-center justify-center">
                <Avatar
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
              <Button
                isIconOnly radius="full" color="danger" size="lg"
                className="w-16 h-16 shadow-lg shadow-danger/30"
                onPress={declineCall}
                aria-label="Decline call"
              >
                <PhoneOff className="w-6 h-6" />
              </Button>
              <span className="text-xs text-white/60 font-medium">Decline</span>
            </div>
            <div className="flex flex-col items-center gap-2.5">
              <Button
                isIconOnly radius="full" color="success" size="lg"
                className="w-16 h-16 shadow-lg shadow-success/30"
                onPress={answerCall}
                aria-label="Accept call"
              >
                <Phone className="w-6 h-6" />
              </Button>
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
      <Button
        isIconOnly
        radius="full"
        variant={danger ? 'solid' : 'flat'}
        color={danger ? 'danger' : 'default'}
        className={cn(
          'w-14 h-14 transition-all duration-200',
          danger
            ? 'shadow-lg shadow-danger/30'
            : active
              ? 'bg-white/30 backdrop-blur-sm text-white'
              : 'bg-white/10 backdrop-blur-sm text-white/90 hover:bg-white/20',
        )}
        onPress={onClick}
        aria-label={label}
      >
        <Icon className="w-6 h-6" />
      </Button>
      <span className="text-[10px] text-white/60 font-medium">{label}</span>
    </div>
  );
}
