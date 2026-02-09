'use client';

import { useState, useEffect, useRef } from 'react';
import { useCallStore } from '@/stores/callStore';
import { cn, getInitials } from '@/lib/utils';
import {
  Phone, PhoneOff, Video, VideoOff, Mic, MicOff,
  PhoneIncoming, Volume2, Monitor, MonitorOff, Signal, SignalLow, SignalMedium, SignalHigh
} from 'lucide-react';

// Connection quality indicator component
function ConnectionQualityBadge({ quality }: { quality: string }) {
  const config: Record<string, { icon: React.ElementType; color: string; label: string }> = {
    excellent: { icon: SignalHigh, color: 'text-green-400', label: 'Excellent' },
    good: { icon: SignalMedium, color: 'text-green-400', label: 'Good' },
    fair: { icon: SignalLow, color: 'text-yellow-400', label: 'Fair' },
    poor: { icon: Signal, color: 'text-red-400', label: 'Poor' },
    unknown: { icon: Signal, color: 'text-white/40', label: '' },
  };
  const { icon: Icon, color, label } = config[quality] || config.unknown;
  if (quality === 'unknown') return null;
  return (
    <div className={`flex items-center gap-1 ${color}`}>
      <Icon className="w-3.5 h-3.5" />
      <span className="text-xs">{label}</span>
    </div>
  );
}

export default function CallOverlay() {
  const {
    activeCall, isMuted, isVideoOff, isScreenSharing, remoteStream, localStream,
    remoteMediaState, connectionQuality,
    answerCall, endCall, declineCall, toggleMute, toggleVideo, toggleScreenShare,
  } = useCallStore();

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const ringtoneRef = useRef<HTMLAudioElement | null>(null);

  // Play ringtone for incoming calls only
  useEffect(() => {
    const ringtone = ringtoneRef.current;
    if (!activeCall) return;

    const isRinging = activeCall.status === 'ringing';
    const isInitiating = activeCall.status === 'initiating';
    const isIncoming = activeCall.isIncoming;

    if ((isRinging || isInitiating) && isIncoming) {
      // Play ringtone for incoming calls
      if (ringtone) {
        ringtone.loop = true;
        ringtone.volume = 0.5;
        ringtone.play().catch(err => console.log('Ringtone play failed:', err));
      }
    } else if (isInitiating && !isIncoming) {
      // Play ring-back tone for outgoing calls
      if (ringtone) {
        ringtone.loop = true;
        ringtone.volume = 0.3;
        ringtone.play().catch(err => console.log('Ring-back play failed:', err));
      }
    } else {
      // Stop ringtone when call connects or ends
      if (ringtone) {
        ringtone.pause();
        ringtone.currentTime = 0;
      }
    }

    return () => {
      if (ringtone) {
        ringtone.pause();
        ringtone.currentTime = 0;
      }
    };
  }, [activeCall]);

  // Attach local stream when video element is available
  useEffect(() => {
    const video = localVideoRef.current;
    if (video && localStream) {
      video.srcObject = localStream;
      video.play().catch(err => console.log('Local video play failed:', err));
    }
  }, [localStream]);

  // Attach remote stream when video element is available
  useEffect(() => {
    const video = remoteVideoRef.current;
    if (video && remoteStream) {
      video.srcObject = remoteStream;
      video.play().catch(err => console.log('Remote video play failed:', err));
    }
  }, [remoteStream]);

  // Attach remote stream to audio element (for voice calls and backup audio)
  useEffect(() => {
    const audio = remoteAudioRef.current;
    if (audio && remoteStream) {
      audio.srcObject = remoteStream;
      audio.play().catch(err => console.log('Remote audio play failed:', err));
    }
  }, [remoteStream]);

  // Callback ref handlers to set stream immediately when video element mounts
  const setLocalVideoRef = (element: HTMLVideoElement | null) => {
    localVideoRef.current = element;
    if (element && localStream) {
      element.srcObject = localStream;
      element.play().catch(err => console.log('Local video play failed:', err));
    }
  };

  const setRemoteVideoRef = (element: HTMLVideoElement | null) => {
    remoteVideoRef.current = element;
    if (element && remoteStream) {
      element.srcObject = remoteStream;
      element.play().catch(err => console.log('Remote video play failed:', err));
    }
  };

  const setRemoteAudioRef = (element: HTMLAudioElement | null) => {
    remoteAudioRef.current = element;
    if (element && remoteStream) {
      element.srcObject = remoteStream;
      element.play().catch(err => console.log('Remote audio play failed:', err));
    }
  };

  if (!activeCall) return null;

  const callerName = activeCall.remoteUsername || 'Unknown';
  const isVideo = activeCall.callType === 'video';
  const isRinging = activeCall.status === 'ringing';
  const isConnecting = activeCall.status === 'connecting' || activeCall.status === 'initiating';
  const isInCall = activeCall.status === 'in_progress';
  const isVideoEnabled = !isVideoOff;
  const isOutgoing = !activeCall.isIncoming && (activeCall.status === 'ringing' || activeCall.status === 'initiating');

  // ============ INCOMING VIDEO CALL - WhatsApp Style with Camera Preview ============
  if (isRinging && activeCall.isIncoming && isVideo) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col h-screen w-screen overflow-hidden">
        {/* Ringtone audio */}
        <audio ref={ringtoneRef} src="/sounds/ringtone.mp3" preload="auto" />

        {/* Background - blur effect */}
        <div className="absolute inset-0 bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900" />

        {/* Header */}
        <div className="relative z-10 pt-12 pb-6 text-center">
          <div className="flex items-center justify-center gap-2 text-green-400 mb-4">
            <Video className="w-5 h-5" />
            <span className="text-sm font-medium uppercase tracking-wider">Incoming Video Call</span>
          </div>

          {/* Caller avatar with ring animation */}
          <div className="relative inline-block mb-4">
            <div className="w-28 h-28 rounded-full bg-gradient-to-br from-zynk-500 to-zynk-700 flex items-center justify-center text-white text-4xl font-bold shadow-2xl">
              {getInitials(callerName)}
            </div>
            {/* Pulsing ring */}
            <div className="absolute inset-0 rounded-full border-4 border-green-500 animate-ping opacity-75" />
            <div className="absolute inset-[-8px] rounded-full border-2 border-green-400/50 animate-pulse" />
          </div>

          <h2 className="text-2xl font-bold text-white mb-1">{callerName}</h2>
          <p className="text-white/60 flex items-center justify-center gap-2">
            <PhoneIncoming className="w-4 h-4 animate-bounce" />
            <span>Zynk video call...</span>
          </p>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Call action buttons */}
        <div className="relative z-10 pb-12 px-8">
          <div className="flex items-center justify-center gap-16">
            {/* Decline */}
            <div className="flex flex-col items-center gap-3">
              <button
                onClick={declineCall}
                className="w-18 h-18 sm:w-20 sm:h-20 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center text-white transition-all duration-200 shadow-xl ring-4 ring-red-600/30"
                style={{ width: '72px', height: '72px' }}
              >
                <PhoneOff className="w-8 h-8" />
              </button>
              <span className="text-white text-sm font-medium">Decline</span>
            </div>

            {/* Accept */}
            <div className="flex flex-col items-center gap-3">
              <button
                onClick={answerCall}
                className="w-18 h-18 sm:w-20 sm:h-20 rounded-full bg-green-600 hover:bg-green-700 flex items-center justify-center text-white transition-all duration-200 shadow-xl ring-4 ring-green-600/30 animate-pulse"
                style={{ width: '72px', height: '72px' }}
              >
                <Video className="w-8 h-8" />
              </button>
              <span className="text-white text-sm font-medium">Accept</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============ INCOMING VOICE CALL - Traditional Phone Style ============
  if (isRinging && activeCall.isIncoming && !isVideo) {
    return (
      <div className="fixed inset-0 z-50 bg-gradient-to-b from-gray-900 via-emerald-900/30 to-gray-900 flex flex-col h-screen w-screen overflow-hidden">
        {/* Ringtone audio */}
        <audio ref={ringtoneRef} src="/sounds/ringtone.mp3" preload="auto" />

        {/* Header */}
        <div className="relative z-10 pt-16 pb-8 text-center">
          <div className="flex items-center justify-center gap-2 text-emerald-400 mb-6">
            <Phone className="w-5 h-5" />
            <span className="text-sm font-medium uppercase tracking-wider">Incoming Voice Call</span>
          </div>

          {/* Caller avatar with animated rings */}
          <div className="relative inline-block mb-6">
            <div className="w-32 h-32 rounded-full bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center text-white text-5xl font-bold shadow-2xl relative z-10">
              {getInitials(callerName)}
            </div>
            {/* Multiple pulsing rings */}
            <div className="absolute inset-[-16px] rounded-full border-2 border-emerald-500/60 animate-ping" style={{ animationDuration: '1.5s' }} />
            <div className="absolute inset-[-32px] rounded-full border border-emerald-400/40 animate-ping" style={{ animationDuration: '2s', animationDelay: '0.5s' }} />
            <div className="absolute inset-[-48px] rounded-full border border-emerald-300/20 animate-ping" style={{ animationDuration: '2.5s', animationDelay: '1s' }} />
          </div>

          <h2 className="text-3xl font-bold text-white mb-2">{callerName}</h2>
          <p className="text-white/60 text-lg">Zynk voice call</p>
        </div>

        {/* Spacer */}
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2 text-white/40">
            <Volume2 className="w-5 h-5 animate-pulse" />
            <span className="text-sm">Ringing...</span>
          </div>
        </div>

        {/* Slide to answer hint */}
        <div className="relative z-10 pb-8 px-8">
          <div className="flex items-center justify-center gap-20">
            {/* Decline */}
            <div className="flex flex-col items-center gap-3">
              <button
                onClick={declineCall}
                className="w-18 h-18 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center text-white transition-all duration-200 shadow-xl"
                style={{ width: '72px', height: '72px' }}
              >
                <PhoneOff className="w-8 h-8 rotate-[135deg]" />
              </button>
              <span className="text-red-400 text-sm font-medium">Decline</span>
            </div>

            {/* Accept */}
            <div className="flex flex-col items-center gap-3">
              <button
                onClick={answerCall}
                className="w-18 h-18 rounded-full bg-green-600 hover:bg-green-700 flex items-center justify-center text-white transition-all duration-200 shadow-xl animate-pulse"
                style={{ width: '72px', height: '72px' }}
              >
                <Phone className="w-8 h-8" />
              </button>
              <span className="text-green-400 text-sm font-medium">Accept</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============ OUTGOING VIDEO CALL - Shows Camera Preview ============
  if (isOutgoing && isVideo) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col h-screen w-screen overflow-hidden">
        {/* Ringtone audio for outgoing call */}
        <audio ref={ringtoneRef} src="/sounds/ringtone.mp3" preload="auto" />

        {/* Camera preview as background */}
        {localStream && (
          <video
            ref={setLocalVideoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover"
            style={{ transform: 'scaleX(-1)' }}
          />
        )}

        {/* Dark overlay */}
        <div className="absolute inset-0 bg-black/40" />

        {/* Header with calling status */}
        <div className="relative z-10 pt-12 text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md px-4 py-2 rounded-full mb-6">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-white text-sm font-medium">Calling...</span>
          </div>

          {/* Caller info */}
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-zynk-500 to-zynk-700 flex items-center justify-center text-white text-3xl font-bold mx-auto mb-4 shadow-2xl ring-4 ring-white/20">
            {getInitials(callerName)}
          </div>
          <h2 className="text-2xl font-bold text-white mb-1">{callerName}</h2>
          <p className="text-white/70 flex items-center justify-center gap-2">
            <Video className="w-4 h-4" />
            <span>Video call</span>
          </p>

          {/* Bouncing dots */}
          <div className="flex justify-center gap-1 mt-4">
            <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* End call button */}
        <div className="relative z-10 pb-12 flex flex-col items-center">
          <button
            onClick={endCall}
            className="w-20 h-20 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center text-white transition-all duration-200 shadow-xl ring-4 ring-red-600/30"
          >
            <PhoneOff className="w-8 h-8" />
          </button>
          <span className="text-white/70 text-sm mt-3">Cancel</span>
        </div>
      </div>
    );
  }

  // ============ OUTGOING VOICE CALL - Traditional Phone Style ============
  if (isOutgoing && !isVideo) {
    return (
      <div className="fixed inset-0 z-50 bg-gradient-to-b from-gray-900 via-zynk-900/30 to-gray-900 flex flex-col h-screen w-screen overflow-hidden">
        {/* Ringtone audio */}
        <audio ref={ringtoneRef} src="/sounds/ringtone.mp3" preload="auto" />

        {/* Header */}
        <div className="relative z-10 pt-16 text-center">
          <div className="flex items-center justify-center gap-2 text-zynk-400 mb-6">
            <Phone className="w-5 h-5" />
            <span className="text-sm font-medium uppercase tracking-wider">Voice Call</span>
          </div>

          {/* Caller avatar */}
          <div className="relative inline-block mb-6">
            <div className="w-32 h-32 rounded-full bg-gradient-to-br from-zynk-500 to-zynk-700 flex items-center justify-center text-white text-5xl font-bold shadow-2xl">
              {getInitials(callerName)}
            </div>
            {/* Subtle ring animation */}
            <div className="absolute inset-[-8px] rounded-full border-2 border-zynk-500/50 animate-pulse" />
          </div>

          <h2 className="text-3xl font-bold text-white mb-2">{callerName}</h2>
          <p className="text-white/60 text-lg">Calling...</p>

          {/* Bouncing dots */}
          <div className="flex justify-center gap-1 mt-4">
            <div className="w-2 h-2 bg-zynk-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-2 bg-zynk-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-2 h-2 bg-zynk-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* End call button */}
        <div className="relative z-10 pb-12 flex flex-col items-center">
          <button
            onClick={endCall}
            className="w-20 h-20 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center text-white transition-all duration-200 shadow-xl ring-4 ring-red-600/30"
          >
            <PhoneOff className="w-8 h-8" />
          </button>
          <span className="text-white/70 text-sm mt-3">Cancel</span>
        </div>
      </div>
    );
  }

  // ============ CONNECTING STATE ============
  if (isConnecting) {
    return (
      <div className="fixed inset-0 z-50 bg-gradient-to-b from-gray-900 to-black flex flex-col h-screen w-screen overflow-hidden">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-28 h-28 rounded-full bg-gradient-to-br from-zynk-500 to-zynk-700 flex items-center justify-center text-white text-4xl font-bold mx-auto mb-6 shadow-2xl">
              {getInitials(callerName)}
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">{callerName}</h2>
            <p className="text-white/60 mb-4">Connecting...</p>
            <div className="flex justify-center gap-1">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-ping" style={{ animationDuration: '1s' }} />
              <div className="w-2 h-2 bg-green-400 rounded-full animate-ping" style={{ animationDelay: '333ms', animationDuration: '1s' }} />
              <div className="w-2 h-2 bg-green-400 rounded-full animate-ping" style={{ animationDelay: '666ms', animationDuration: '1s' }} />
            </div>
          </div>
        </div>

        <div className="pb-12 flex justify-center">
          <button
            onClick={endCall}
            className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center text-white transition-colors shadow-lg"
          >
            <PhoneOff className="w-7 h-7" />
          </button>
        </div>
      </div>
    );
  }

  // ============ ACTIVE VIDEO CALL ============
  if (isInCall && isVideo) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col h-screen w-screen overflow-hidden">
        {/* Hidden audio element to ensure remote audio always plays */}
        <audio ref={setRemoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />

        {/* Remote video - full screen */}
        {remoteStream ? (
          <video
            ref={setRemoteVideoRef}
            autoPlay
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gray-900 flex items-center justify-center">
            <div className="w-32 h-32 rounded-full bg-gradient-to-br from-zynk-500 to-zynk-700 flex items-center justify-center text-white text-4xl font-bold">
              {getInitials(callerName)}
            </div>
          </div>
        )}

        {/* Header overlay */}
        <div className="absolute top-0 left-0 right-0 z-10 p-4 bg-gradient-to-b from-black/60 to-transparent">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-white text-sm font-semibold">
                {getInitials(callerName)}
              </div>
              <div>
                <h3 className="text-white font-medium">{callerName}</h3>
                <p className="text-white/70 text-xs flex items-center gap-1">
                  <CallTimer />
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ConnectionQualityBadge quality={connectionQuality} />
              {remoteMediaState.screen_sharing && (
                <div className="flex items-center gap-1 bg-blue-500/20 px-2 py-1 rounded-full">
                  <Monitor className="w-3 h-3 text-blue-400" />
                  <span className="text-blue-400 text-xs">Screen</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Local video PIP */}
        {localStream && (
          <div className="absolute top-20 right-4 w-28 h-40 sm:w-32 sm:h-44 rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20 bg-black">
            <video
              ref={setLocalVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ transform: 'scaleX(-1)' }}
            />
            {!isVideoEnabled && (
              <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
                <VideoOff className="w-6 h-6 text-white/60" />
              </div>
            )}
          </div>
        )}

        {/* Bottom controls */}
        <div className="absolute bottom-0 left-0 right-0 z-10 p-6 bg-gradient-to-t from-black/80 to-transparent">
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={toggleMute}
              className={cn(
                'w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-lg',
                isMuted ? 'bg-white text-gray-900' : 'bg-white/20 text-white backdrop-blur'
              )}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>

            <button
              onClick={toggleVideo}
              className={cn(
                'w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-lg',
                !isVideoEnabled ? 'bg-white text-gray-900' : 'bg-white/20 text-white backdrop-blur'
              )}
              title={isVideoEnabled ? 'Turn off camera' : 'Turn on camera'}
            >
              {isVideoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
            </button>

            <button
              onClick={toggleScreenShare}
              className={cn(
                'w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-lg',
                isScreenSharing ? 'bg-blue-500 text-white' : 'bg-white/20 text-white backdrop-blur'
              )}
              title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
            >
              {isScreenSharing ? <MonitorOff className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
            </button>

            <button
              onClick={endCall}
              className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center text-white transition-all shadow-xl"
              title="End call"
            >
              <PhoneOff className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============ ACTIVE VOICE CALL - Traditional Phone UI ============
  if (isInCall && !isVideo) {
    return (
      <div className="fixed inset-0 z-50 bg-gradient-to-b from-gray-900 via-emerald-900/20 to-gray-900 flex flex-col h-screen w-screen overflow-hidden">
        {/* Hidden audio element */}
        <audio ref={setRemoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />

        {/* Main content */}
        <div className="flex-1 flex flex-col items-center justify-center">
          {/* Avatar with audio visualizer effect */}
          <div className="relative mb-8">
            <div className="w-36 h-36 rounded-full bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center text-white text-5xl font-bold shadow-2xl">
              {getInitials(callerName)}
            </div>
            {/* Subtle pulse to indicate ongoing call */}
            <div className="absolute inset-[-4px] rounded-full border-2 border-emerald-500/30 animate-pulse" />
          </div>

          <h2 className="text-3xl font-bold text-white mb-2">{callerName}</h2>
          <p className="text-emerald-400 text-lg flex items-center gap-2">
            <CallTimer />
          </p>
          <ConnectionQualityBadge quality={connectionQuality} />

          {/* Audio wave indicator */}
          <div className="flex items-center gap-1 mt-6">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="w-1 bg-emerald-500 rounded-full animate-pulse"
                style={{
                  height: `${12 + Math.random() * 20}px`,
                  animationDelay: `${i * 100}ms`,
                  animationDuration: '0.5s'
                }}
              />
            ))}
          </div>
        </div>

        {/* Bottom controls */}
        <div className="pb-12 px-8">
          <div className="flex items-center justify-center gap-8">
            {/* Mute */}
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={toggleMute}
                className={cn(
                  'w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-lg',
                  isMuted ? 'bg-white text-gray-900' : 'bg-white/20 text-white backdrop-blur'
                )}
              >
                {isMuted ? <MicOff className="w-7 h-7" /> : <Mic className="w-7 h-7" />}
              </button>
              <span className="text-white/70 text-xs">{isMuted ? 'Unmute' : 'Mute'}</span>
            </div>

            {/* End call */}
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={endCall}
                className="w-20 h-20 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center text-white transition-all shadow-xl ring-4 ring-red-600/30"
              >
                <PhoneOff className="w-8 h-8" />
              </button>
              <span className="text-red-400 text-xs">End</span>
            </div>

            {/* Speaker placeholder */}
            <div className="flex flex-col items-center gap-2">
              <button className="w-16 h-16 rounded-full bg-white/20 text-white backdrop-blur flex items-center justify-center transition-all shadow-lg">
                <Volume2 className="w-7 h-7" />
              </button>
              <span className="text-white/70 text-xs">Speaker</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

function CallTimer() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;

  return (
    <span>{String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}</span>
  );
}
