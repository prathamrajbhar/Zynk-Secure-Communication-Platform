/**
 * Call Store — Zustand state management for voice/video calls
 *
 * Orchestrates the full call lifecycle:
 * - Initiating & receiving calls
 * - WebRTC connection and media management
 * - Quality monitoring
 * - Call timer and heartbeat
 * - Cleanup on call end
 */

import { create } from 'zustand';
import { RTCManager, type IceServer, type RTCConnectionState } from '@/lib/webrtc/RTCManager';
import { MediaManager, type AudioLevel } from '@/lib/webrtc/MediaManager';
import { QualityMonitor, type CallQuality } from '@/lib/webrtc/QualityMonitor';
import { getSocket, SOCKET_EVENTS } from '@/lib/socket';
import api from '@/lib/api';
import logger from '@/lib/logger';
import { playRingtone, stopRingtone, notifyIncomingCall, dismissNotificationByTag } from '@/lib/notifications';

export type CallStatus =
  | 'idle'
  | 'requesting_permission'
  | 'initiating'
  | 'ringing'
  | 'incoming'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'ended';

export type CallType = 'audio' | 'video';

export interface CallParticipant {
  userId: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
}

interface CallState {
  // ── Status ──
  status: CallStatus;
  callId: string | null;
  callType: CallType | null;
  conversationId: string | null;
  isInitiator: boolean;

  // ── Participants ──
  localUser: CallParticipant | null;
  remoteUser: CallParticipant | null;

  // ── Media ──
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isAudioMuted: boolean;
  isVideoOff: boolean;
  isRemoteAudioMuted: boolean;
  isRemoteVideoOff: boolean;
  localAudioLevel: AudioLevel;
  remoteAudioLevel: number;

  // ── Quality ──
  connectionQuality: CallQuality;
  latencyMs: number;

  // ── Timer ──
  callStartTime: number | null;
  callDuration: number; // seconds

  // ── Error ──
  error: string | null;

  // ── Actions ──
  initiateCall: (recipientId: string, recipientName: string, recipientAvatar: string | undefined, conversationId: string, callType: CallType) => Promise<void>;
  answerCall: () => Promise<void>;
  declineCall: () => void;
  endCall: () => void;
  toggleAudio: () => void;
  toggleVideo: () => void;
  switchCamera: () => Promise<void>;

  // ── Internal (called by socket listeners) ──
  handleIncomingCall: (data: IncomingCallData) => void;
  handleCallAnswered: (data: { callId: string; answer: RTCSessionDescriptionInit; responderId: string }) => void;
  handleIceCandidate: (data: { callId: string; candidate: RTCIceCandidateInit; fromUserId: string }) => void;
  handleCallEnded: (data: { callId: string; reason: string; endedBy?: string; durationSeconds?: number }) => void;
  handleCallDeclined: (data: { callId: string; declinedBy: string }) => void;
  handleCallError: (data: { code: string; message: string }) => void;
  handleMediaState: (data: { callId: string; fromUserId: string; audio?: boolean; video?: boolean }) => void;
  handleRenegotiate: (data: { callId: string; offer: RTCSessionDescriptionInit; fromUserId: string }) => void;
  handleRenegotiateAnswer: (data: { callId: string; answer: RTCSessionDescriptionInit; fromUserId: string }) => void;
  reset: () => void;
}

export interface IncomingCallData {
  callId: string;
  callType: CallType;
  callerId: string;
  callerName: string;
  conversationId: string;
  offer: RTCSessionDescriptionInit;
  iceServers: IceServer[];
}

// ── Singleton instances (live outside store to avoid serialization issues) ──
let rtcManager: RTCManager | null = null;
let mediaManager: MediaManager | null = null;
let qualityMonitor: QualityMonitor | null = null;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let durationInterval: ReturnType<typeof setInterval> | null = null;

// Store incoming call data for answering
let pendingIncomingData: IncomingCallData | null = null;

function cleanup() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  if (durationInterval) {
    clearInterval(durationInterval);
    durationInterval = null;
  }
  qualityMonitor?.stop();
  qualityMonitor = null;
  rtcManager?.close();
  rtcManager = null;
  mediaManager?.releaseMedia();
  mediaManager = null;
  pendingIncomingData = null;
  stopRingtone();
}

const initialState = {
  status: 'idle' as CallStatus,
  callId: null as string | null,
  callType: null as CallType | null,
  conversationId: null as string | null,
  isInitiator: false,
  localUser: null as CallParticipant | null,
  remoteUser: null as CallParticipant | null,
  localStream: null as MediaStream | null,
  remoteStream: null as MediaStream | null,
  isAudioMuted: false,
  isVideoOff: false,
  isRemoteAudioMuted: false,
  isRemoteVideoOff: false,
  localAudioLevel: 'silent' as AudioLevel,
  remoteAudioLevel: 0,
  connectionQuality: 'unknown' as CallQuality,
  latencyMs: 0,
  callStartTime: null as number | null,
  callDuration: 0,
  error: null as string | null,
};

export const useCallStore = create<CallState>((set, get) => ({
  ...initialState,

  // ════════════════════════════════════════════
  // INITIATE A CALL (caller side)
  // ════════════════════════════════════════════
  initiateCall: async (recipientId, recipientName, recipientAvatar, conversationId, callType) => {
    const state = get();
    if (state.status !== 'idle') {
      logger.warn('[Call] Cannot initiate: already in call');
      return;
    }

    try {
      set({
        status: 'requesting_permission',
        callType,
        conversationId,
        isInitiator: true,
        remoteUser: {
          userId: recipientId,
          username: recipientName,
          displayName: recipientName,
          avatarUrl: recipientAvatar,
        },
        error: null,
      });

      // 1. Acquire media
      mediaManager = new MediaManager();
      const stream = await mediaManager.acquireMedia({
        audio: true,
        video: callType === 'video',
      });

      set({ localStream: stream, status: 'initiating' });

      // 2. Create RTCPeerConnection
      let iceServers: IceServer[] | undefined;
      try {
        const iceRes = await api.get('/calls/ice-servers');
        iceServers = iceRes.data.iceServers;
      } catch {
        // Use defaults
      }

      rtcManager = new RTCManager({
        onTrack: (event) => {
          logger.info('[Call] Remote track received:', event.track.kind);
          const remoteStream = event.streams[0] || new MediaStream([event.track]);
          set({ remoteStream });
        },
        onIceCandidate: (candidate) => {
          const socket = getSocket();
          const { callId, remoteUser } = get();
          if (socket && callId && remoteUser) {
            socket.emit(SOCKET_EVENTS.CALL_ICE_CANDIDATE, {
              callId,
              candidate: candidate.toJSON(),
              targetUserId: remoteUser.userId,
            });
          }
        },
        onConnectionStateChange: (connectionState) => {
          handleRTCStateChange(connectionState, set, get);
        },
        onNegotiationNeeded: () => {
          // Handled by renegotiation flow
        },
      });

      rtcManager.createConnection(iceServers);
      rtcManager.addTracks(stream);

      // 3. Create offer
      const offer = await rtcManager.createOffer();

      // 4. Send via socket
      const socket = getSocket();
      if (!socket) throw new Error('Not connected to server');

      socket.emit(SOCKET_EVENTS.CALL_INITIATE, {
        recipientId,
        conversationId,
        callType,
        offer,
      });

      set({ status: 'ringing' });

      // Start audio level monitoring
      mediaManager.startAudioLevelMonitoring((level) => {
        set({ localAudioLevel: level });
      });

    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('[Call] Initiate failed:', err);
      cleanup();

      let errorMsg = 'Failed to start call';
      if (err.message === 'PERMISSION_DENIED') errorMsg = 'Camera/microphone permission denied';
      else if (err.message === 'DEVICE_NOT_FOUND') errorMsg = 'No camera/microphone found';
      else if (err.message === 'DEVICE_IN_USE') errorMsg = 'Camera/microphone is in use by another app';

      set({ ...initialState, error: errorMsg });
    }
  },

  // ════════════════════════════════════════════
  // HANDLE INCOMING CALL
  // ════════════════════════════════════════════
  handleIncomingCall: (data) => {
    const state = get();
    if (state.status !== 'idle') {
      // Already in a call — auto-reject
      const socket = getSocket();
      if (socket) {
        socket.emit(SOCKET_EVENTS.CALL_DECLINE, { callId: data.callId });
      }
      return;
    }

    pendingIncomingData = data;
    playRingtone();
    notifyIncomingCall(data.callerName, data.callType, data.callId);

    set({
      status: 'incoming',
      callId: data.callId,
      callType: data.callType,
      conversationId: data.conversationId,
      isInitiator: false,
      remoteUser: {
        userId: data.callerId,
        username: data.callerName,
        displayName: data.callerName,
      },
      error: null,
    });
  },

  // ════════════════════════════════════════════
  // ANSWER AN INCOMING CALL
  // ════════════════════════════════════════════
  answerCall: async () => {
    const state = get();
    if (state.status !== 'incoming' || !pendingIncomingData) {
      logger.warn('[Call] Cannot answer: not in incoming state');
      return;
    }

    const data = pendingIncomingData;
    stopRingtone();
    dismissNotificationByTag(`call-${data.callId}`);

    try {
      set({ status: 'requesting_permission' });

      // 1. Acquire media
      mediaManager = new MediaManager();
      const stream = await mediaManager.acquireMedia({
        audio: true,
        video: data.callType === 'video',
      });

      set({ localStream: stream, status: 'connecting' });

      // 2. Create RTC connection
      rtcManager = new RTCManager({
        onTrack: (event) => {
          logger.info('[Call] Remote track received:', event.track.kind);
          const remoteStream = event.streams[0] || new MediaStream([event.track]);
          set({ remoteStream });
        },
        onIceCandidate: (candidate) => {
          const socket = getSocket();
          const { callId, remoteUser } = get();
          if (socket && callId && remoteUser) {
            socket.emit(SOCKET_EVENTS.CALL_ICE_CANDIDATE, {
              callId,
              candidate: candidate.toJSON(),
              targetUserId: remoteUser.userId,
            });
          }
        },
        onConnectionStateChange: (connectionState) => {
          handleRTCStateChange(connectionState, set, get);
        },
      });

      rtcManager.createConnection(data.iceServers);
      rtcManager.addTracks(stream);

      // 3. Set remote offer and create answer
      await rtcManager.setRemoteDescription(data.offer);
      const answer = await rtcManager.createAnswer();

      // 4. Send answer via socket
      const socket = getSocket();
      if (!socket) throw new Error('Not connected to server');

      socket.emit(SOCKET_EVENTS.CALL_ANSWER, {
        callId: data.callId,
        answer,
      });

      // Start audio level monitoring
      mediaManager.startAudioLevelMonitoring((level) => {
        set({ localAudioLevel: level });
      });

    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('[Call] Answer failed:', err);
      cleanup();

      let errorMsg = 'Failed to answer call';
      if (err.message === 'PERMISSION_DENIED') errorMsg = 'Camera/microphone permission denied';

      set({ ...initialState, error: errorMsg });
    }
  },

  // ════════════════════════════════════════════
  // HANDLE CALL ANSWERED (caller receives answer)
  // ════════════════════════════════════════════
  handleCallAnswered: async (data) => {
    const state = get();
    if (state.status !== 'ringing' || !rtcManager) return;

    set({ status: 'connecting' });

    try {
      await rtcManager.setRemoteDescription(data.answer);
    } catch (error) {
      logger.error('[Call] Set remote description failed:', error);
    }
  },

  // ════════════════════════════════════════════
  // HANDLE ICE CANDIDATE
  // ════════════════════════════════════════════
  handleIceCandidate: async (data) => {
    if (!rtcManager) return;
    try {
      await rtcManager.addIceCandidate(data.candidate);
    } catch (error) {
      logger.error('[Call] Add ICE candidate failed:', error);
    }
  },

  // ════════════════════════════════════════════
  // DECLINE INCOMING CALL
  // ════════════════════════════════════════════
  declineCall: () => {
    const state = get();
    const { callId } = state;

    stopRingtone();
    if (callId) {
      dismissNotificationByTag(`call-${callId}`);
      const socket = getSocket();
      if (socket) {
        socket.emit(SOCKET_EVENTS.CALL_DECLINE, { callId });
      }
    }

    cleanup();
    set({ ...initialState });
  },

  // ════════════════════════════════════════════
  // END CALL
  // ════════════════════════════════════════════
  endCall: () => {
    const state = get();
    const { callId } = state;

    if (callId) {
      const socket = getSocket();
      const metrics = qualityMonitor?.getMetrics();

      if (socket) {
        socket.emit(SOCKET_EVENTS.CALL_END, {
          callId,
          reason: 'normal',
          qualityMetrics: metrics ? {
            avgLatencyMs: metrics.avgLatencyMs,
            maxLatencyMs: metrics.maxLatencyMs,
            packetLossPct: metrics.packetLossPct,
            avgBitrateKbps: metrics.avgBitrateKbps,
          } : undefined,
        });
      }
    }

    cleanup();
    set({ ...initialState, status: 'ended' });

    // After brief "call ended" display, reset fully
    setTimeout(() => {
      if (get().status === 'ended') {
        set({ ...initialState });
      }
    }, 2000);
  },

  // ════════════════════════════════════════════
  // HANDLE CALL ENDED (from server)
  // ════════════════════════════════════════════
  handleCallEnded: (data) => {
    stopRingtone();
    if (data.callId) dismissNotificationByTag(`call-${data.callId}`);

    cleanup();
    set({ ...initialState, status: 'ended' });

    setTimeout(() => {
      if (get().status === 'ended') {
        set({ ...initialState });
      }
    }, 2000);
  },

  // ════════════════════════════════════════════
  // HANDLE CALL DECLINED
  // ════════════════════════════════════════════
  handleCallDeclined: () => {
    cleanup();
    set({ ...initialState, status: 'ended', error: 'Call declined' });

    setTimeout(() => {
      if (get().status === 'ended') {
        set({ ...initialState });
      }
    }, 3000);
  },

  // ════════════════════════════════════════════
  // HANDLE CALL ERROR
  // ════════════════════════════════════════════
  handleCallError: (data) => {
    logger.error('[Call] Server error:', data);

    if (data.code === 'USER_BUSY') {
      cleanup();
      set({ ...initialState, error: 'User is on another call' });
    } else if (data.code === 'ALREADY_IN_CALL') {
      cleanup();
      set({ ...initialState, error: 'You are already in a call' });
    } else {
      cleanup();
      set({ ...initialState, error: data.message || 'Call failed' });
    }
  },

  // ════════════════════════════════════════════
  // HANDLE REMOTE MEDIA STATE CHANGE
  // ════════════════════════════════════════════
  handleMediaState: (data) => {
    set({
      isRemoteAudioMuted: data.audio === false,
      isRemoteVideoOff: data.video === false,
    });
  },

  // ════════════════════════════════════════════
  // HANDLE RENEGOTIATION (mid-call)
  // ════════════════════════════════════════════
  handleRenegotiate: async (data) => {
    if (!rtcManager) return;
    try {
      await rtcManager.setRemoteDescription(data.offer);
      const answer = await rtcManager.createAnswer();
      const socket = getSocket();
      if (socket) {
        socket.emit(SOCKET_EVENTS.CALL_RENEGOTIATE_ANSWER, {
          callId: data.callId,
          answer,
          targetUserId: data.fromUserId,
        });
      }
    } catch (error) {
      logger.error('[Call] Renegotiation failed:', error);
    }
  },

  handleRenegotiateAnswer: async (data) => {
    if (!rtcManager) return;
    try {
      await rtcManager.setRemoteDescription(data.answer);
    } catch (error) {
      logger.error('[Call] Renegotiation answer failed:', error);
    }
  },

  // ════════════════════════════════════════════
  // TOGGLE AUDIO
  // ════════════════════════════════════════════
  toggleAudio: () => {
    if (!mediaManager) return;
    const isMuted = mediaManager.toggleAudio();
    set({ isAudioMuted: isMuted });

    // Notify remote
    const socket = getSocket();
    const { callId, remoteUser } = get();
    if (socket && callId && remoteUser) {
      socket.emit(SOCKET_EVENTS.CALL_MEDIA_STATE, {
        callId,
        targetUserId: remoteUser.userId,
        audio: !isMuted,
        video: !get().isVideoOff,
      });
    }
  },

  // ════════════════════════════════════════════
  // TOGGLE VIDEO
  // ════════════════════════════════════════════
  toggleVideo: () => {
    if (!mediaManager) return;
    const isOff = mediaManager.toggleVideo();
    set({ isVideoOff: isOff });

    // Notify remote
    const socket = getSocket();
    const { callId, remoteUser } = get();
    if (socket && callId && remoteUser) {
      socket.emit(SOCKET_EVENTS.CALL_MEDIA_STATE, {
        callId,
        targetUserId: remoteUser.userId,
        audio: !get().isAudioMuted,
        video: !isOff,
      });
    }
  },

  // ════════════════════════════════════════════
  // SWITCH CAMERA
  // ════════════════════════════════════════════
  switchCamera: async () => {
    if (!mediaManager || !rtcManager) return;
    const oldTrack = mediaManager.stream?.getVideoTracks()[0];
    const newTrack = await mediaManager.switchCamera();
    if (oldTrack && newTrack) {
      await rtcManager.replaceTrack(oldTrack, newTrack);
    }
  },

  // ════════════════════════════════════════════
  // RESET
  // ════════════════════════════════════════════
  reset: () => {
    cleanup();
    set({ ...initialState });
  },
}));

// ════════════════════════════════════════════
// RTC Connection State Handler
// ════════════════════════════════════════════
function handleRTCStateChange(
  connectionState: RTCConnectionState,
  set: (partial: Partial<CallState> | ((state: CallState) => Partial<CallState>)) => void,
  get: () => CallState
) {
  switch (connectionState) {
    case 'connected': {
      const currentStatus = get().status;
      if (currentStatus !== 'connected') {
        const now = Date.now();
        set({ status: 'connected', callStartTime: now });

        // Notify server
        const socket = getSocket();
        const { callId } = get();
        if (socket && callId) {
          socket.emit('call:connected', { callId });
        }

        // Start call duration timer
        durationInterval = setInterval(() => {
          const { callStartTime } = get();
          if (callStartTime) {
            set({ callDuration: Math.floor((Date.now() - callStartTime) / 1000) });
          }
        }, 1000);

        // Start heartbeat
        heartbeatInterval = setInterval(() => {
          const socket = getSocket();
          const { callId } = get();
          if (socket && callId) {
            socket.emit('call:heartbeat', { callId });
          }
        }, 5000);

        // Start quality monitoring
        if (rtcManager) {
          qualityMonitor = new QualityMonitor(rtcManager);
          qualityMonitor.start((snapshot) => {
            set({
              connectionQuality: snapshot.quality,
              latencyMs: snapshot.latencyMs,
            });
          });
        }
      }
      break;
    }
    case 'disconnected':
      set({ status: 'reconnecting' });
      break;
    case 'failed':
      // Connection failed — end call
      get().endCall();
      break;
    case 'closed':
      // Already handled by endCall
      break;
  }
}
