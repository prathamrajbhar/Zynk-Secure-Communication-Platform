import { create } from 'zustand';
import { getSocket } from '@/lib/socket';
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
  peerConnection: RTCPeerConnection | null;
  isMuted: boolean;
  isVideoOff: boolean;

  initiateCall: (recipientId: string, callType: 'audio' | 'video', username?: string) => Promise<void>;
  answerCall: () => Promise<void>;
  endCall: () => void;
  declineCall: () => void;
  toggleMute: () => void;
  toggleVideo: () => void;
  setIncomingCall: (data: { call_id: string; call_type: 'audio' | 'video'; caller_id: string; caller_username?: string; sdp_offer: string }) => void;
  handleAnswer: (data: { sdp_answer: string }) => void;
  handleIceCandidate: (data: { candidate: RTCIceCandidateInit }) => void;
  handleCallEnded: (data: { call_id: string }) => void;
  cleanup: () => void;
}

// ICE server configuration with STUN and TURN fallback
const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    // Multiple STUN servers for reliability
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    // Free TURN servers - these are public free servers for development
    // For production, use your own TURN server (e.g., coturn) or a paid service
    {
      urls: 'turn:numb.viagenie.ca',
      username: 'webrtc@live.com',
      credential: 'muazkh',
    },
    {
      urls: 'turn:192.158.29.39:3478?transport=udp',
      username: '28224511:1379330808',
      credential: 'JZEOEt2V3Qb0y27GRntt2u2PAYA=',
    },
    {
      urls: 'turn:192.158.29.39:3478?transport=tcp',
      username: '28224511:1379330808',
      credential: 'JZEOEt2V3Qb0y27GRntt2u2PAYA=',
    },
    {
      urls: 'turn:turn.bistri.com:80',
      username: 'homeo',
      credential: 'homeo',
    },
  ],
  iceCandidatePoolSize: 10,
};

// Call timeout in milliseconds (30 seconds)
const CALL_TIMEOUT = 30000;

let callTimeoutId: ReturnType<typeof setTimeout> | null = null;

// Queue for ICE candidates that arrive before remote description is set (receiving side)
let pendingIceCandidates: RTCIceCandidateInit[] = [];

// Queue for outgoing ICE candidates that are generated before call ID is set (sending side)
let outgoingIceCandidates: { candidate: RTCIceCandidateInit; targetId: string }[] = [];

// Helper to clear call timeout
function clearCallTimeout() {
  if (callTimeoutId) {
    clearTimeout(callTimeoutId);
    callTimeoutId = null;
  }
}

// Helper to clear pending ICE candidates
function clearPendingCandidates() {
  pendingIceCandidates = [];
  outgoingIceCandidates = [];
}

// Helper to apply pending ICE candidates
async function applyPendingCandidates(pc: RTCPeerConnection) {
  const candidates = [...pendingIceCandidates];
  pendingIceCandidates = [];

  for (const candidate of candidates) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
      console.log('Applied queued ICE candidate');
    } catch (error) {
      console.error('Failed to apply queued ICE candidate:', error);
    }
  }
}

export const useCallStore = create<CallState>((set, get) => ({
  activeCall: null,
  localStream: null,
  remoteStream: null,
  peerConnection: null,
  isMuted: false,
  isVideoOff: false,

  initiateCall: async (recipientId, callType, username) => {
    try {
      // Request media permissions
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === 'video',
      });

      const pc = new RTCPeerConnection(ICE_SERVERS);

      // Add local tracks to peer connection
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      // Handle remote stream
      pc.ontrack = (event) => {
        console.log('Received remote track:', event.track.kind);
        set({ remoteStream: event.streams[0] });
      };

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const socket = getSocket();
          const call = get().activeCall;
          const candidateData = event.candidate.toJSON();

          // If call ID exists, send immediately
          if (call?.callId) {
            socket?.emit('call:ice-candidate', {
              call_id: call.callId,
              candidate: candidateData,
              target_id: recipientId,
            });
          } else {
            // Queue the candidate until we have a call ID
            console.log('Queuing outgoing ICE candidate (call ID not set yet)');
            outgoingIceCandidates.push({ candidate: candidateData, targetId: recipientId });
          }
        }
      };

      // Handle ICE gathering state
      pc.onicegatheringstatechange = () => {
        console.log('ICE gathering state:', pc.iceGatheringState);
      };

      // Handle ICE connection state changes
      pc.oniceconnectionstatechange = () => {
        console.log('ICE connection state:', pc.iceConnectionState);
        const state = pc.iceConnectionState;

        if (state === 'connected' || state === 'completed') {
          clearCallTimeout();
          set(s => ({
            activeCall: s.activeCall ? { ...s.activeCall, status: 'in_progress' } : null,
          }));
        } else if (state === 'failed') {
          console.error('ICE connection failed');
          toast.error('Call connection failed');
          get().cleanup();
        } else if (state === 'disconnected') {
          console.warn('ICE connection disconnected, attempting recovery...');
          // Give it a moment to recover before ending
          setTimeout(() => {
            if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
              toast.error('Call disconnected');
              get().cleanup();
            }
          }, 5000);
        }
      };

      // Handle connection state changes
      pc.onconnectionstatechange = () => {
        console.log('Connection state:', pc.connectionState);
        if (pc.connectionState === 'failed') {
          toast.error('Connection failed');
          get().cleanup();
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
      socket?.once('call:initiated', (data: { call_id: string }) => {
        set(state => ({
          activeCall: state.activeCall ? { ...state.activeCall, callId: data.call_id, status: 'ringing' } : null,
        }));

        // Send any queued outgoing ICE candidates now that we have a call ID
        const queuedCandidates = [...outgoingIceCandidates];
        outgoingIceCandidates = [];
        for (const { candidate, targetId } of queuedCandidates) {
          console.log('Sending queued outgoing ICE candidate');
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
      });
    } catch (error) {
      console.error('Failed to initiate call:', error);
      if ((error as Error).name === 'NotAllowedError') {
        toast.error('Camera/microphone permission denied');
      } else if ((error as Error).name === 'NotFoundError') {
        toast.error('No camera/microphone found');
      } else {
        toast.error('Failed to start call');
      }
      get().cleanup();
    }
  },

  answerCall: async () => {
    const { activeCall } = get();
    if (!activeCall) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: activeCall.callType === 'video',
      });

      const pc = new RTCPeerConnection(ICE_SERVERS);

      // Add local tracks
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      // Handle remote stream
      pc.ontrack = (event) => {
        console.log('Received remote track:', event.track.kind);
        set({ remoteStream: event.streams[0] });
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

      // Handle ICE gathering state
      pc.onicegatheringstatechange = () => {
        console.log('ICE gathering state:', pc.iceGatheringState);
      };

      // Handle ICE connection state changes
      pc.oniceconnectionstatechange = () => {
        console.log('ICE connection state:', pc.iceConnectionState);
        const state = pc.iceConnectionState;

        if (state === 'connected' || state === 'completed') {
          set(s => ({
            activeCall: s.activeCall ? { ...s.activeCall, status: 'in_progress' } : null,
          }));
        } else if (state === 'failed') {
          console.error('ICE connection failed');
          toast.error('Call connection failed');
          get().cleanup();
        } else if (state === 'disconnected') {
          console.warn('ICE connection disconnected');
          setTimeout(() => {
            if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
              toast.error('Call disconnected');
              get().cleanup();
            }
          }, 5000);
        }
      };

      // Handle connection state changes
      pc.onconnectionstatechange = () => {
        console.log('Connection state:', pc.connectionState);
        if (pc.connectionState === 'failed') {
          toast.error('Connection failed');
          get().cleanup();
        }
      };

      // Set remote description from offer
      if (activeCall.sdpOffer) {
        await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(activeCall.sdpOffer)));
        // Apply any ICE candidates that arrived before we set up the peer connection
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
      console.error('Failed to answer call:', error);
      if ((error as Error).name === 'NotAllowedError') {
        toast.error('Camera/microphone permission denied');
      } else if ((error as Error).name === 'NotFoundError') {
        toast.error('No camera/microphone found');
      } else {
        toast.error('Failed to answer call');
      }
      get().cleanup();
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
    const { localStream, isMuted } = get();
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = isMuted;
      });
      set({ isMuted: !isMuted });
    }
  },

  toggleVideo: () => {
    const { localStream, isVideoOff } = get();
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = isVideoOff;
      });
      set({ isVideoOff: !isVideoOff });
    }
  },

  setIncomingCall: (data) => {
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
        await peerConnection.setRemoteDescription(
          new RTCSessionDescription(JSON.parse(data.sdp_answer))
        );

        // Apply any ICE candidates that arrived before remote description was set
        await applyPendingCandidates(peerConnection);

        set(state => ({
          activeCall: state.activeCall ? { ...state.activeCall, status: 'connecting' } : null,
        }));
      } catch (error) {
        console.error('Failed to set remote description:', error);
        toast.error('Failed to establish connection');
        get().cleanup();
      }
    }
  },

  handleIceCandidate: async (data) => {
    const { peerConnection } = get();
    if (!data.candidate) return;

    // If peer connection doesn't exist or remote description not set, queue the candidate
    if (!peerConnection || !peerConnection.remoteDescription) {
      console.log('Queuing ICE candidate (remote description not set yet)');
      pendingIceCandidates.push(data.candidate);
      return;
    }

    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (error) {
      console.error('Failed to add ICE candidate:', error);
    }
  },

  handleCallEnded: (data) => {
    const { activeCall } = get();
    if (activeCall && activeCall.callId === data.call_id) {
      clearCallTimeout();
      get().cleanup();
    }
  },

  cleanup: () => {
    const { localStream, peerConnection } = get();

    // Stop all local tracks
    localStream?.getTracks().forEach(track => {
      track.stop();
    });

    // Close peer connection
    if (peerConnection) {
      peerConnection.onicecandidate = null;
      peerConnection.ontrack = null;
      peerConnection.oniceconnectionstatechange = null;
      peerConnection.onconnectionstatechange = null;
      peerConnection.onicegatheringstatechange = null;
      peerConnection.close();
    }

    clearCallTimeout();
    clearPendingCandidates();

    set({
      activeCall: null,
      localStream: null,
      remoteStream: null,
      peerConnection: null,
      isMuted: false,
      isVideoOff: false,
    });
  },
}));
