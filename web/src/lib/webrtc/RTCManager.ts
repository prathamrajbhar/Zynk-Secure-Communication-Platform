/**
 * RTCManager — WebRTC Peer Connection management
 *
 * Handles:
 * - PeerConnection lifecycle (create, negotiate, close)
 * - SDP offer/answer creation and setting
 * - ICE candidate collection and handling
 * - Connection state monitoring with auto-reconnect
 * - Mid-call renegotiation for media changes
 */

import logger from '@/lib/logger';

export type RTCConnectionState =
  | 'new'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'closed';

export interface RTCManagerCallbacks {
  onTrack: (event: RTCTrackEvent) => void;
  onIceCandidate: (candidate: RTCIceCandidate) => void;
  onConnectionStateChange: (state: RTCConnectionState) => void;
  onNegotiationNeeded?: () => void;
}

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

const DEFAULT_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
};

export class RTCManager {
  private pc: RTCPeerConnection | null = null;
  private callbacks: RTCManagerCallbacks;
  private pendingCandidates: RTCIceCandidate[] = [];
  private isRemoteDescriptionSet = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private _connectionState: RTCConnectionState = 'new';

  constructor(callbacks: RTCManagerCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Create a new RTCPeerConnection with the given ICE servers.
   */
  createConnection(iceServers?: IceServer[]): RTCPeerConnection {
    this.close();

    const config: RTCConfiguration = {
      ...DEFAULT_CONFIG,
      ...(iceServers ? { iceServers } : {}),
    };

    this.pc = new RTCPeerConnection(config);
    this.isRemoteDescriptionSet = false;
    this.pendingCandidates = [];
    this.reconnectAttempts = 0;

    // ── Event handlers ──

    this.pc.ontrack = (event) => {
      logger.debug('[RTC] ontrack:', event.track.kind);
      this.callbacks.onTrack(event);
    };

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.callbacks.onIceCandidate(event.candidate);
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      if (!this.pc) return;
      logger.debug('[RTC] ICE connection state:', this.pc.iceConnectionState);

      switch (this.pc.iceConnectionState) {
        case 'connected':
        case 'completed':
          this.setConnectionState('connected');
          this.reconnectAttempts = 0;
          break;
        case 'disconnected':
          this.setConnectionState('disconnected');
          // Auto-reconnect: wait before declaring failure
          this.scheduleReconnectCheck();
          break;
        case 'failed':
          this.handleConnectionFailure();
          break;
        case 'closed':
          this.setConnectionState('closed');
          break;
      }
    };

    this.pc.onconnectionstatechange = () => {
      if (!this.pc) return;
      logger.debug('[RTC] Connection state:', this.pc.connectionState);

      switch (this.pc.connectionState) {
        case 'connected':
          this.setConnectionState('connected');
          break;
        case 'disconnected':
          this.setConnectionState('disconnected');
          break;
        case 'failed':
          this.handleConnectionFailure();
          break;
        case 'closed':
          this.setConnectionState('closed');
          break;
      }
    };

    this.pc.onnegotiationneeded = () => {
      logger.debug('[RTC] Negotiation needed');
      this.callbacks.onNegotiationNeeded?.();
    };

    return this.pc;
  }

  /**
   * Add local media tracks to the peer connection.
   */
  addTracks(stream: MediaStream): void {
    if (!this.pc) throw new Error('No peer connection');
    stream.getTracks().forEach((track) => {
      this.pc!.addTrack(track, stream);
    });
  }

  /**
   * Replace a track (e.g., switch camera).
   */
  async replaceTrack(oldTrack: MediaStreamTrack, newTrack: MediaStreamTrack): Promise<void> {
    if (!this.pc) return;
    const sender = this.pc.getSenders().find((s) => s.track === oldTrack);
    if (sender) {
      await sender.replaceTrack(newTrack);
    }
  }

  /**
   * Create an SDP offer.
   */
  async createOffer(): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) throw new Error('No peer connection');
    this.setConnectionState('connecting');
    const offer = await this.pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  /**
   * Create an SDP answer (after setting remote offer).
   */
  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) throw new Error('No peer connection');
    this.setConnectionState('connecting');
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  /**
   * Set the remote SDP description (offer or answer).
   */
  async setRemoteDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    if (!this.pc) throw new Error('No peer connection');
    await this.pc.setRemoteDescription(new RTCSessionDescription(desc));
    this.isRemoteDescriptionSet = true;

    // Drain pending ICE candidates
    for (const candidate of this.pendingCandidates) {
      await this.pc.addIceCandidate(candidate);
    }
    this.pendingCandidates = [];
  }

  /**
   * Add a remote ICE candidate. Queues if remote description not yet set.
   */
  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.pc) return;
    const rtcCandidate = new RTCIceCandidate(candidate);

    if (this.isRemoteDescriptionSet) {
      await this.pc.addIceCandidate(rtcCandidate);
    } else {
      this.pendingCandidates.push(rtcCandidate);
    }
  }

  /**
   * Get connection quality stats.
   */
  async getStats(): Promise<{
    latencyMs: number;
    packetLossPercent: number;
    bitrateKbps: number;
    jitterMs: number;
    audioLevel: number;
  } | null> {
    if (!this.pc) return null;

    try {
      const stats = await this.pc.getStats();
      let latencyMs = 0;
      let packetLossPercent = 0;
      let bitrateKbps = 0;
      let jitterMs = 0;
      let audioLevel = 0;

      stats.forEach((report) => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          latencyMs = report.currentRoundTripTime
            ? report.currentRoundTripTime * 1000
            : 0;
        }
        if (report.type === 'inbound-rtp' && report.kind === 'audio') {
          if (report.packetsLost !== undefined && report.packetsReceived) {
            const total = report.packetsReceived + report.packetsLost;
            packetLossPercent = total > 0 ? (report.packetsLost / total) * 100 : 0;
          }
          jitterMs = report.jitter ? report.jitter * 1000 : 0;
          audioLevel = report.audioLevel || 0;
        }
        if (report.type === 'outbound-rtp') {
          if (report.bytesSent && report.timestamp) {
            // Calculate bitrate from bytes sent
            bitrateKbps = (report.bytesSent * 8) / 1000;
          }
        }
      });

      return { latencyMs, packetLossPercent, bitrateKbps, jitterMs, audioLevel };
    } catch {
      return null;
    }
  }

  /**
   * Get the underlying RTCPeerConnection (for advanced use).
   */
  getPeerConnection(): RTCPeerConnection | null {
    return this.pc;
  }

  get connectionState(): RTCConnectionState {
    return this._connectionState;
  }

  /**
   * Close and clean up the peer connection.
   */
  close(): void {
    if (this.pc) {
      this.pc.ontrack = null;
      this.pc.onicecandidate = null;
      this.pc.oniceconnectionstatechange = null;
      this.pc.onconnectionstatechange = null;
      this.pc.onnegotiationneeded = null;

      // Close all senders
      this.pc.getSenders().forEach((sender) => {
        if (sender.track) {
          sender.track.stop();
        }
      });

      this.pc.close();
      this.pc = null;
    }

    this.isRemoteDescriptionSet = false;
    this.pendingCandidates = [];
    this.setConnectionState('closed');
  }

  // ── Private helpers ──

  private setConnectionState(state: RTCConnectionState): void {
    if (this._connectionState !== state) {
      this._connectionState = state;
      this.callbacks.onConnectionStateChange(state);
    }
  }

  private scheduleReconnectCheck(): void {
    setTimeout(() => {
      if (this.pc && this.pc.iceConnectionState === 'disconnected') {
        this.handleConnectionFailure();
      }
    }, 10000); // 10s grace period
  }

  private handleConnectionFailure(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts && this.pc) {
      this.reconnectAttempts++;
      logger.info(`[RTC] Attempting ICE restart (attempt ${this.reconnectAttempts})`);
      this.attemptIceRestart();
    } else {
      this.setConnectionState('failed');
    }
  }

  private async attemptIceRestart(): Promise<void> {
    if (!this.pc) return;
    try {
      const offer = await this.pc.createOffer({ iceRestart: true });
      await this.pc.setLocalDescription(offer);
      this.callbacks.onNegotiationNeeded?.();
    } catch (error) {
      logger.error('[RTC] ICE restart failed:', error);
      this.setConnectionState('failed');
    }
  }
}
