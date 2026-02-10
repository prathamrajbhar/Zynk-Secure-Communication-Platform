import { create } from 'zustand';
import { getSocket } from '@/lib/socket';
import api from '@/lib/api';
import logger from '@/lib/logger';
import toast from 'react-hot-toast';

interface CallState {
  activeCall: {
    callId: string;
    callType: 'audio' | 'video';
    remoteUserId: string;
    remoteUsername?: string;
    status: 'initiating' | 'ringing' | 'connecting' | 'in_progress' | 'ended';
    isIncoming: boolean;
    sdpOffer?: string;
  } | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  screenStream: MediaStream | null;
  peerConnection: RTCPeerConnection | null;
  isMuted: boolean;
  isVideoOff: boolean;
  isScreenSharing: boolean;
  remoteMediaState: { audio: boolean; video: boolean; screen_sharing: boolean };
  connectionQuality: 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';

  initiateCall: (recipientId: string, callType: 'audio' | 'video', username?: string) => Promise<void>;
  answerCall: () => Promise<void>;
  endCall: () => void;
  declineCall: () => void;
  toggleMute: () => void;
  toggleVideo: () => void;
  toggleScreenShare: () => Promise<void>;
  setIncomingCall: (data: { call_id: string; call_type: 'audio' | 'video'; caller_id: string; caller_username?: string; sdp_offer: string; ice_servers?: RTCIceServer[] }) => void;
  handleAnswer: (data: { sdp_answer: string }) => void;
  handleIceCandidate: (data: { candidate: RTCIceCandidateInit }) => void;
  handleCallEnded: (data: { call_id: string }) => void;
  handleCallDeclined: (data: { call_id: string }) => void;
  handleRemoteMediaState: (data: { audio: boolean; video: boolean; screen_sharing: boolean }) => void;
  handleRenegotiate: (data: { sdp_offer: string; from_id: string; call_id: string }) => void;
  handleRenegotiateAnswer: (data: { sdp_answer: string }) => void;
  cleanup: () => void;
}

// ========== ICE Server Configuration ==========
// Default config - will be overridden by server-provided config
const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

let cachedIceServers: RTCIceServer[] | null = null;
let iceServersFetchedAt = 0;
const ICE_SERVERS_CACHE_TTL = 3600000; // 1 hour

async function getIceServers(): Promise<RTCIceServer[]> {
  // Return cached if fresh
  if (cachedIceServers && Date.now() - iceServersFetchedAt < ICE_SERVERS_CACHE_TTL) {
    return cachedIceServers;
  }

  try {
    const response = await api.get('/calls/ice-servers');
    if (response.data?.ice_servers?.length > 0) {
      cachedIceServers = response.data.ice_servers;
      iceServersFetchedAt = Date.now();
      return cachedIceServers!;
    }
  } catch {
    logger.warn('Failed to fetch ICE servers from API, using defaults');
  }

  return DEFAULT_ICE_SERVERS;
}

function createRTCConfig(servers: RTCIceServer[]): RTCConfiguration {
  return {
    iceServers: servers,
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
  };
}

// ========== Media Constraints ==========
function getMediaConstraints(callType: 'audio' | 'video'): MediaStreamConstraints {
  return {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: 48000,
    },
    video: callType === 'video' ? {
      width: { ideal: 1280, max: 1920 },
      height: { ideal: 720, max: 1080 },
      frameRate: { ideal: 30, max: 60 },
      facingMode: 'user',
    } : false,
  };
}

// ========== Call Timeout Management ==========
const CALL_TIMEOUT = 30000;
let callTimeoutId: ReturnType<typeof setTimeout> | null = null;

function clearCallTimeout() {
  if (callTimeoutId) {
    clearTimeout(callTimeoutId);
    callTimeoutId = null;
  }
}

// ========== ICE Candidate Queuing ==========
let pendingIceCandidates: RTCIceCandidateInit[] = [];
let outgoingIceCandidates: { candidate: RTCIceCandidateInit; targetId: string }[] = [];

function clearPendingCandidates() {
  pendingIceCandidates = [];
  outgoingIceCandidates = [];
}

async function applyPendingCandidates(pc: RTCPeerConnection) {
  const candidates = [...pendingIceCandidates];
  pendingIceCandidates = [];

  for (const candidate of candidates) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      logger.error('Failed to apply queued ICE candidate:', error);
    }
  }
}

// ========== Connection Quality Monitoring ==========
let statsInterval: ReturnType<typeof setInterval> | null = null;

function startConnectionQualityMonitor(pc: RTCPeerConnection, set: (state: Partial<CallState>) => void) {
  stopConnectionQualityMonitor();
  statsInterval = setInterval(async () => {
    try {
      const stats = await pc.getStats();
      let roundTripTime = 0;
      let packetsLost = 0;
      let packetsReceived = 0;

      stats.forEach(report => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          roundTripTime = report.currentRoundTripTime ?? 0;
        }
        if (report.type === 'inbound-rtp' && report.kind === 'audio') {
          packetsLost = report.packetsLost ?? 0;
          packetsReceived = report.packetsReceived ?? 0;
        }
      });

      const lossRate = packetsReceived > 0 ? packetsLost / (packetsLost + packetsReceived) : 0;

      let quality: 'excellent' | 'good' | 'fair' | 'poor';
      if (roundTripTime < 0.1 && lossRate < 0.01) quality = 'excellent';
      else if (roundTripTime < 0.2 && lossRate < 0.03) quality = 'good';
      else if (roundTripTime < 0.4 && lossRate < 0.08) quality = 'fair';
      else quality = 'poor';

      set({ connectionQuality: quality });
    } catch {
      // Stats collection failed, non-critical
    }
  }, 3000);
}

function stopConnectionQualityMonitor() {
  if (statsInterval) {
    clearInterval(statsInterval);
    statsInterval = null;
  }
}

// ========== ICE Restart Handler ==========
let iceRestartAttempts = 0;
const MAX_ICE_RESTART_ATTEMPTS = 3;

async function attemptIceRestart(pc: RTCPeerConnection, get: () => CallState) {
  if (iceRestartAttempts >= MAX_ICE_RESTART_ATTEMPTS) {
    toast.error('Connection lost - unable to recover');
    get().cleanup();
    return;
  }

  iceRestartAttempts++;
  logger.debug(`Attempting ICE restart (attempt ${iceRestartAttempts}/${MAX_ICE_RESTART_ATTEMPTS})`);

  try {
    const offer = await pc.createOffer({ iceRestart: true });
    await pc.setLocalDescription(offer);

    const socket = getSocket();
    const call = get().activeCall;
    if (call && socket) {
      socket.emit('call:renegotiate', {
        call_id: call.callId,
        sdp_offer: JSON.stringify(offer),
        target_id: call.remoteUserId,
      });
    }
  } catch (error) {
    logger.error('ICE restart failed:', error);
    toast.error('Failed to recover connection');
    get().cleanup();
  }
}

export const useCallStore = create<CallState>((set, get) => ({
  activeCall: null,
  localStream: null,
  remoteStream: null,
  screenStream: null,
  peerConnection: null,
  isMuted: false,
  isVideoOff: false,
  isScreenSharing: false,
  remoteMediaState: { audio: true, video: true, screen_sharing: false },
  connectionQuality: 'unknown',

  initiateCall: async (recipientId, callType, username) => {
    try {
      // Fetch ICE servers from the server API
      const iceServers = await getIceServers();
      const rtcConfig = createRTCConfig(iceServers);

      // Request media permissions with optimized constraints
      const stream = await navigator.mediaDevices.getUserMedia(getMediaConstraints(callType));

      const pc = new RTCPeerConnection(rtcConfig);

      // Add local tracks to peer connection
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      // Handle remote stream
      pc.ontrack = (event) => {
        logger.debug('Received remote track:', event.track.kind);
        if (event.streams[0]) {
          set({ remoteStream: event.streams[0] });
        }
      };

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const socket = getSocket();
          const call = get().activeCall;
          const candidateData = event.candidate.toJSON();

          if (call?.callId) {
            socket?.emit('call:ice-candidate', {
              call_id: call.callId,
              candidate: candidateData,
              target_id: recipientId,
            });
          } else {
            outgoingIceCandidates.push({ candidate: candidateData, targetId: recipientId });
          }
        }
      };

      // Handle ICE connection state changes
      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        logger.debug('ICE connection state:', state);

        if (state === 'connected' || state === 'completed') {
          clearCallTimeout();
          iceRestartAttempts = 0;
          set(s => ({
            activeCall: s.activeCall ? { ...s.activeCall, status: 'in_progress' } : null,
          }));
          startConnectionQualityMonitor(pc, (partial) => set(partial as Partial<CallState>));
        } else if (state === 'failed') {
          attemptIceRestart(pc, get);
        } else if (state === 'disconnected') {
          logger.warn('ICE disconnected, waiting for recovery...');
          set({ connectionQuality: 'poor' });
          // Wait before attempting ICE restart
          setTimeout(() => {
            if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
              attemptIceRestart(pc, get);
            }
          }, 3000);
        }
      };

      // Handle connection state changes
      pc.onconnectionstatechange = () => {
        logger.debug('Connection state:', pc.connectionState);
        if (pc.connectionState === 'failed') {
          attemptIceRestart(pc, get);
        }
      };

      // Create and set local description
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const socket = getSocket();
      socket?.emit('call:initiate', {
        recipient_id: recipientId,
        call_type: callType,
        sdp_offer: JSON.stringify(offer),
      });

      set({
        localStream: stream,
        peerConnection: pc,
        activeCall: {
          callId: '',
          callType,
          remoteUserId: recipientId,
          remoteUsername: username,
          status: 'initiating',
          isIncoming: false,
          sdpOffer: JSON.stringify(offer),
        },
      });

      // Listen for call initiated confirmation
      const onCallInitiated = (data: { call_id: string; recipient_online: boolean }) => {
        // Clean up the error listener since we got a successful response
        socket?.off('call:error', onCallError);

        set(state => ({
          activeCall: state.activeCall ? { ...state.activeCall, callId: data.call_id, status: 'ringing' } : null,
        }));

        if (!data.recipient_online) {
          toast('User is offline - they will be notified');
        }

        // Flush queued outgoing ICE candidates
        const queuedCandidates = [...outgoingIceCandidates];
        outgoingIceCandidates = [];
        for (const { candidate, targetId } of queuedCandidates) {
          socket?.emit('call:ice-candidate', {
            call_id: data.call_id,
            candidate,
            target_id: targetId,
          });
        }

        // Set call timeout
        clearCallTimeout();
        callTimeoutId = setTimeout(() => {
          const currentCall = get().activeCall;
          if (currentCall && currentCall.status === 'ringing') {
            toast.error('No answer - call ended');
            get().endCall();
          }
        }, CALL_TIMEOUT);
      };

      // Listen for busy signal or error
      const onCallError = (data: { message: string; code?: string }) => {
        // Clean up the initiated listener since we got an error
        socket?.off('call:initiated', onCallInitiated);

        if (data.code === 'USER_BUSY') {
          toast.error('User is busy on another call');
        } else {
          toast.error(data.message || 'Call failed');
        }
        get().cleanup();
      };

      socket?.once('call:initiated', onCallInitiated);
      socket?.once('call:error', onCallError);
    } catch (error) {
      logger.error('Failed to initiate call:', error);
      if ((error as Error).name === 'NotAllowedError') {
        toast.error('Camera/microphone permission denied');
      } else if ((error as Error).name === 'NotFoundError') {
        toast.error('No camera/microphone found');
      } else if ((error as Error).name === 'NotReadableError') {
        toast.error('Camera/microphone is in use by another application');
      } else {
        toast.error('Failed to start call');
      }
      get().cleanup();
    }
  },

  answerCall: async () => {
    const { activeCall } = get();
    if (!activeCall) return;

    // Clear the incoming call timeout immediately
    clearCallTimeout();

    try {
      // Fetch ICE servers (may have been provided in the incoming call data)
      const iceServers = await getIceServers();
      const rtcConfig = createRTCConfig(iceServers);

      const stream = await navigator.mediaDevices.getUserMedia(getMediaConstraints(activeCall.callType));

      const pc = new RTCPeerConnection(rtcConfig);

      // Add local tracks
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      // Handle remote stream
      pc.ontrack = (event) => {
        logger.debug('Received remote track:', event.track.kind);
        if (event.streams[0]) {
          set({ remoteStream: event.streams[0] });
        }
      };

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const socket = getSocket();
          socket?.emit('call:ice-candidate', {
            call_id: activeCall.callId,
            candidate: event.candidate.toJSON(),
            target_id: activeCall.remoteUserId,
          });
        }
      };

      // Handle ICE connection state changes
      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        logger.debug('ICE connection state:', state);

        if (state === 'connected' || state === 'completed') {
          iceRestartAttempts = 0;
          set(s => ({
            activeCall: s.activeCall ? { ...s.activeCall, status: 'in_progress' } : null,
          }));
          startConnectionQualityMonitor(pc, (partial) => set(partial as Partial<CallState>));
        } else if (state === 'failed') {
          attemptIceRestart(pc, get);
        } else if (state === 'disconnected') {
          logger.warn('ICE disconnected');
          set({ connectionQuality: 'poor' });
          setTimeout(() => {
            if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
              attemptIceRestart(pc, get);
            }
          }, 3000);
        }
      };

      pc.onconnectionstatechange = () => {
        logger.debug('Connection state:', pc.connectionState);
        if (pc.connectionState === 'failed') {
          attemptIceRestart(pc, get);
        }
      };

      // Set remote description from offer
      if (activeCall.sdpOffer) {
        await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(activeCall.sdpOffer)));
        await applyPendingCandidates(pc);
      }

      // Create and send answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      const socket = getSocket();
      socket?.emit('call:answer', {
        call_id: activeCall.callId,
        sdp_answer: JSON.stringify(answer),
      });

      set({
        localStream: stream,
        peerConnection: pc,
        activeCall: { ...activeCall, status: 'connecting' },
      });
    } catch (error) {
      logger.error('Failed to answer call:', error);
      if ((error as Error).name === 'NotAllowedError') {
        toast.error('Camera/microphone permission denied');
      } else if ((error as Error).name === 'NotFoundError') {
        toast.error('No camera/microphone found');
      } else if ((error as Error).name === 'NotReadableError') {
        toast.error('Camera/microphone is in use by another application');
      } else {
        toast.error('Failed to answer call');
      }
      get().declineCall();
    }
  },

  endCall: () => {
    const { activeCall } = get();
    if (activeCall?.callId) {
      const socket = getSocket();
      socket?.emit('call:end', { call_id: activeCall.callId });
    }
    clearCallTimeout();
    get().cleanup();
  },

  declineCall: () => {
    const { activeCall } = get();
    if (activeCall?.callId) {
      const socket = getSocket();
      socket?.emit('call:decline', { call_id: activeCall.callId });
    }
    clearCallTimeout();
    get().cleanup();
  },

  toggleMute: () => {
    const { localStream, isMuted, activeCall } = get();
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = isMuted;
      });
      const newMuted = !isMuted;
      set({ isMuted: newMuted });

      // Notify remote about media state change
      if (activeCall) {
        const socket = getSocket();
        socket?.emit('call:media-state', {
          call_id: activeCall.callId,
          target_id: activeCall.remoteUserId,
          audio: !newMuted,
          video: !get().isVideoOff,
          screen_sharing: get().isScreenSharing,
        });
      }
    }
  },

  toggleVideo: () => {
    const { localStream, isVideoOff, activeCall } = get();
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = isVideoOff;
      });
      const newVideoOff = !isVideoOff;
      set({ isVideoOff: newVideoOff });

      if (activeCall) {
        const socket = getSocket();
        socket?.emit('call:media-state', {
          call_id: activeCall.callId,
          target_id: activeCall.remoteUserId,
          audio: !get().isMuted,
          video: !newVideoOff,
          screen_sharing: get().isScreenSharing,
        });
      }
    }
  },

  toggleScreenShare: async () => {
    const { peerConnection, isScreenSharing, screenStream, localStream, activeCall } = get();
    if (!peerConnection || !activeCall) return;

    if (isScreenSharing && screenStream) {
      // Stop screen sharing - replace screen tracks with camera tracks
      screenStream.getTracks().forEach(track => track.stop());

      const senders = peerConnection.getSenders();
      const videoSender = senders.find(s => s.track?.kind === 'video');
      if (videoSender && localStream) {
        const cameraTrack = localStream.getVideoTracks()[0];
        if (cameraTrack) {
          await videoSender.replaceTrack(cameraTrack);
        }
      }

      set({ isScreenSharing: false, screenStream: null });
    } else {
      // Start screen sharing
      try {
        const screen = await navigator.mediaDevices.getDisplayMedia({
          video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
          audio: false,
        });

        const screenTrack = screen.getVideoTracks()[0];
        const senders = peerConnection.getSenders();
        const videoSender = senders.find(s => s.track?.kind === 'video');

        if (videoSender) {
          await videoSender.replaceTrack(screenTrack);
        }

        // Handle user stopping screen share via browser UI
        screenTrack.onended = () => {
          get().toggleScreenShare();
        };

        set({ isScreenSharing: true, screenStream: screen });
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          toast.error('Failed to share screen');
        }
        return;
      }
    }

    // Notify remote
    const socket = getSocket();
    const nowSharing = get().isScreenSharing;
    socket?.emit('call:media-state', {
      call_id: activeCall.callId,
      target_id: activeCall.remoteUserId,
      audio: !get().isMuted,
      video: !get().isVideoOff,
      screen_sharing: nowSharing,
    });
  },

  setIncomingCall: (data) => {
    // Update cached ICE servers if provided
    if (data.ice_servers && data.ice_servers.length > 0) {
      cachedIceServers = data.ice_servers;
      iceServersFetchedAt = Date.now();
    }

    set({
      activeCall: {
        callId: data.call_id,
        callType: data.call_type,
        remoteUserId: data.caller_id,
        remoteUsername: data.caller_username,
        status: 'ringing',
        isIncoming: true,
        sdpOffer: data.sdp_offer,
      },
    });

    // Auto-decline after timeout if not answered
    clearCallTimeout();
    callTimeoutId = setTimeout(() => {
      const currentCall = get().activeCall;
      if (currentCall && currentCall.status === 'ringing' && currentCall.isIncoming) {
        toast('Missed call from ' + (currentCall.remoteUsername || 'Unknown'));
        get().cleanup();
      }
    }, CALL_TIMEOUT);
  },

  handleAnswer: async (data) => {
    const { peerConnection } = get();
    if (peerConnection && data.sdp_answer) {
      try {
        clearCallTimeout();

        // Check if already have a remote description (prevent InvalidStateError)
        if (peerConnection.signalingState === 'have-local-offer') {
          await peerConnection.setRemoteDescription(
            new RTCSessionDescription(JSON.parse(data.sdp_answer))
          );
        } else {
          logger.warn('Unexpected signaling state for answer:', peerConnection.signalingState);
        }

        await applyPendingCandidates(peerConnection);

        set(state => ({
          activeCall: state.activeCall ? { ...state.activeCall, status: 'connecting' } : null,
        }));
      } catch (error) {
        logger.error('Failed to set remote description:', error);
        toast.error('Failed to establish connection');
        get().cleanup();
      }
    }
  },

  handleIceCandidate: async (data) => {
    const { peerConnection } = get();
    if (!data.candidate) return;

    if (!peerConnection || !peerConnection.remoteDescription) {
      pendingIceCandidates.push(data.candidate);
      return;
    }

    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (error) {
      logger.error('Failed to add ICE candidate:', error);
    }
  },

  handleCallEnded: (data) => {
    const { activeCall } = get();
    if (activeCall && activeCall.callId === data.call_id) {
      clearCallTimeout();
      toast('Call ended');
      get().cleanup();
    }
  },

  handleCallDeclined: (data) => {
    const { activeCall } = get();
    if (activeCall && activeCall.callId === data.call_id) {
      clearCallTimeout();
      toast('Call was declined');
      get().cleanup();
    }
  },

  handleRemoteMediaState: (data) => {
    set({ remoteMediaState: { audio: data.audio, video: data.video, screen_sharing: data.screen_sharing } });
  },

  handleRenegotiate: async (data) => {
    const { peerConnection } = get();
    if (!peerConnection || !data.sdp_offer) return;

    try {
      // Only accept renegotiation if in stable state or have-local-offer
      if (peerConnection.signalingState !== 'stable' && peerConnection.signalingState !== 'have-local-offer') {
        logger.warn('Ignoring renegotiation in state:', peerConnection.signalingState);
        return;
      }

      await peerConnection.setRemoteDescription(new RTCSessionDescription(JSON.parse(data.sdp_offer)));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      const socket = getSocket();
      socket?.emit('call:renegotiate-answer', {
        call_id: data.call_id,
        sdp_answer: JSON.stringify(answer),
        target_id: data.from_id,
      });
    } catch (error) {
      logger.error('Failed to handle renegotiation:', error);
    }
  },

  handleRenegotiateAnswer: async (data) => {
    const { peerConnection } = get();
    if (!peerConnection || !data.sdp_answer) return;

    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(JSON.parse(data.sdp_answer)));
      iceRestartAttempts = 0;
    } catch (error) {
      logger.error('Failed to apply renegotiation answer:', error);
    }
  },

  cleanup: () => {
    const { localStream, screenStream, peerConnection } = get();

    // Stop all local tracks
    localStream?.getTracks().forEach(track => track.stop());
    screenStream?.getTracks().forEach(track => track.stop());

    // Close peer connection
    if (peerConnection) {
      peerConnection.onicecandidate = null;
      peerConnection.ontrack = null;
      peerConnection.oniceconnectionstatechange = null;
      peerConnection.onconnectionstatechange = null;
      peerConnection.onicegatheringstatechange = null;
      peerConnection.close();
    }

    // Clean up any leftover socket listeners from call initiation
    try {
      const socket = getSocket();
      if (socket) {
        socket.removeAllListeners('call:initiated');
        socket.removeAllListeners('call:error');
      }
    } catch { /* socket may not exist */ }

    clearCallTimeout();
    clearPendingCandidates();
    stopConnectionQualityMonitor();
    iceRestartAttempts = 0;

    set({
      activeCall: null,
      localStream: null,
      remoteStream: null,
      screenStream: null,
      peerConnection: null,
      isMuted: false,
      isVideoOff: false,
      isScreenSharing: false,
      remoteMediaState: { audio: true, video: true, screen_sharing: false },
      connectionQuality: 'unknown',
    });
  },
}));
