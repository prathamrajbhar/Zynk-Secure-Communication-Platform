/**
 * MediaManager — Audio/Video device and stream management
 *
 * Handles:
 * - getUserMedia with optimal constraints
 * - Audio: echo cancellation, noise suppression, auto gain
 * - Video: 720p HD, adaptive bitrate
 * - Mute/unmute, video toggle, camera switch
 * - Audio level detection for speaking indicator
 * - Proper cleanup to prevent leaks
 */

import logger from '@/lib/logger';

export interface MediaConstraints {
  audio: boolean;
  video: boolean;
}

export type AudioLevel = 'silent' | 'low' | 'medium' | 'high';

const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  sampleRate: 48000,
  channelCount: 1,
};

const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1280, max: 1920 },
  height: { ideal: 720, max: 1080 },
  frameRate: { ideal: 30, max: 30 },
  facingMode: 'user',
};

export class MediaManager {
  private localStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private audioLevelInterval: ReturnType<typeof setInterval> | null = null;
  private onAudioLevelChange?: (level: AudioLevel, raw: number) => void;

  private _isAudioMuted = false;
  private _isVideoOff = false;
  private _currentFacingMode: 'user' | 'environment' = 'user';

  get isAudioMuted(): boolean { return this._isAudioMuted; }
  get isVideoOff(): boolean { return this._isVideoOff; }
  get currentFacingMode(): 'user' | 'environment' { return this._currentFacingMode; }
  get stream(): MediaStream | null { return this.localStream; }

  /**
   * Acquire local media (mic and/or camera).
   */
  async acquireMedia(constraints: MediaConstraints): Promise<MediaStream> {
    this.releaseMedia();

    const mediaConstraints: MediaStreamConstraints = {};

    if (constraints.audio) {
      mediaConstraints.audio = AUDIO_CONSTRAINTS;
    }

    if (constraints.video) {
      mediaConstraints.video = VIDEO_CONSTRAINTS;
    }

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
      logger.info('[Media] Acquired local stream:', {
        audio: this.localStream.getAudioTracks().length,
        video: this.localStream.getVideoTracks().length,
      });
      return this.localStream;
    } catch (error: unknown) {
      const err = error as { name?: string; message?: string };
      logger.error('[Media] getUserMedia failed:', err);

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        throw new Error('PERMISSION_DENIED');
      }
      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        throw new Error('DEVICE_NOT_FOUND');
      }
      if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        throw new Error('DEVICE_IN_USE');
      }
      throw error;
    }
  }

  /**
   * Toggle audio mute. Returns new muted state.
   */
  toggleAudio(): boolean {
    if (!this.localStream) return this._isAudioMuted;
    this._isAudioMuted = !this._isAudioMuted;
    this.localStream.getAudioTracks().forEach((track) => {
      track.enabled = !this._isAudioMuted;
    });
    return this._isAudioMuted;
  }

  /**
   * Toggle video on/off. Returns new off state.
   */
  toggleVideo(): boolean {
    if (!this.localStream) return this._isVideoOff;
    this._isVideoOff = !this._isVideoOff;
    this.localStream.getVideoTracks().forEach((track) => {
      track.enabled = !this._isVideoOff;
    });
    return this._isVideoOff;
  }

  /**
   * Switch between front and back camera (mobile).
   * Returns the new MediaStreamTrack for track replacement.
   */
  async switchCamera(): Promise<MediaStreamTrack | null> {
    if (!this.localStream) return null;

    const newFacingMode = this._currentFacingMode === 'user' ? 'environment' : 'user';

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { ...VIDEO_CONSTRAINTS, facingMode: newFacingMode },
      });

      const oldTrack = this.localStream.getVideoTracks()[0];
      const newTrack = newStream.getVideoTracks()[0];

      if (oldTrack) {
        this.localStream.removeTrack(oldTrack);
        oldTrack.stop();
      }
      this.localStream.addTrack(newTrack);
      this._currentFacingMode = newFacingMode;

      return newTrack;
    } catch (error) {
      logger.error('[Media] Switch camera failed:', error);
      return null;
    }
  }

  /**
   * Start monitoring local audio levels for speaking indicator.
   */
  startAudioLevelMonitoring(callback: (level: AudioLevel, raw: number) => void): void {
    if (!this.localStream) return;

    const audioTrack = this.localStream.getAudioTracks()[0];
    if (!audioTrack) return;

    this.onAudioLevelChange = callback;

    try {
      this.audioContext = new AudioContext();
      const source = this.audioContext.createMediaStreamSource(
        new MediaStream([audioTrack])
      );
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 256;
      this.analyserNode.smoothingTimeConstant = 0.5;
      source.connect(this.analyserNode);

      const dataArray = new Uint8Array(this.analyserNode.frequencyBinCount);

      this.audioLevelInterval = setInterval(() => {
        if (!this.analyserNode) return;
        this.analyserNode.getByteFrequencyData(dataArray);

        // RMS of frequency data
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sum / dataArray.length);
        const normalized = Math.min(rms / 128, 1);

        let level: AudioLevel = 'silent';
        if (normalized > 0.4) level = 'high';
        else if (normalized > 0.15) level = 'medium';
        else if (normalized > 0.03) level = 'low';

        this.onAudioLevelChange?.(level, normalized);
      }, 100);
    } catch (error) {
      logger.error('[Media] Audio level monitoring failed:', error);
    }
  }

  /**
   * Stop audio level monitoring.
   */
  stopAudioLevelMonitoring(): void {
    if (this.audioLevelInterval) {
      clearInterval(this.audioLevelInterval);
      this.audioLevelInterval = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    this.analyserNode = null;
    this.onAudioLevelChange = undefined;
  }

  /**
   * Enable/disable video track for adding video mid-call.
   */
  async addVideoTrack(): Promise<MediaStreamTrack | null> {
    if (!this.localStream) return null;

    try {
      const videoStream = await navigator.mediaDevices.getUserMedia({
        video: VIDEO_CONSTRAINTS,
      });
      const videoTrack = videoStream.getVideoTracks()[0];
      this.localStream.addTrack(videoTrack);
      this._isVideoOff = false;
      return videoTrack;
    } catch (error) {
      logger.error('[Media] Failed to add video:', error);
      return null;
    }
  }

  /**
   * Release all media tracks and clean up.
   */
  releaseMedia(): void {
    this.stopAudioLevelMonitoring();

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        track.stop();
      });
      this.localStream = null;
    }

    this._isAudioMuted = false;
    this._isVideoOff = false;
    this._currentFacingMode = 'user';
  }

  /**
   * Check if camera/mic permissions are available.
   */
  static async checkPermissions(): Promise<{
    audio: PermissionState;
    video: PermissionState;
  }> {
    const result = { audio: 'prompt' as PermissionState, video: 'prompt' as PermissionState };

    try {
      if (navigator.permissions) {
        const [audio, video] = await Promise.allSettled([
          navigator.permissions.query({ name: 'microphone' as PermissionName }),
          navigator.permissions.query({ name: 'camera' as PermissionName }),
        ]);
        if (audio.status === 'fulfilled') result.audio = audio.value.state;
        if (video.status === 'fulfilled') result.video = video.value.state;
      }
    } catch {
      // Permissions API not fully supported
    }

    return result;
  }

  /**
   * Enumerate available media devices.
   */
  static async getDevices(): Promise<{
    audioInputs: MediaDeviceInfo[];
    videoInputs: MediaDeviceInfo[];
    audioOutputs: MediaDeviceInfo[];
  }> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return {
      audioInputs: devices.filter((d) => d.kind === 'audioinput'),
      videoInputs: devices.filter((d) => d.kind === 'videoinput'),
      audioOutputs: devices.filter((d) => d.kind === 'audiooutput'),
    };
  }
}
