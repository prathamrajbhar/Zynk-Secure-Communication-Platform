/**
 * QualityMonitor — Network quality monitoring for active calls
 *
 * Polls WebRTC stats every 3 seconds and computes:
 * - Latency (round-trip time)
 * - Packet loss percentage
 * - Bitrate (kbps)
 * - Jitter
 * - Overall quality rating (excellent/good/poor)
 *
 * Provides quality history for end-of-call metrics reporting.
 */

import { RTCManager } from './RTCManager';
import logger from '@/lib/logger';

export type CallQuality = 'excellent' | 'good' | 'poor' | 'unknown';

export interface QualitySnapshot {
  timestamp: number;
  latencyMs: number;
  packetLossPercent: number;
  bitrateKbps: number;
  jitterMs: number;
  quality: CallQuality;
  audioLevel: number;
}

export interface QualityMetrics {
  avgLatencyMs: number;
  maxLatencyMs: number;
  packetLossPct: number;
  avgBitrateKbps: number;
}

const POLL_INTERVAL = 3000; // 3 seconds
const MAX_HISTORY = 200; // ~10 minutes at 3s intervals

export class QualityMonitor {
  private rtcManager: RTCManager;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private history: QualitySnapshot[] = [];
  private onQualityChange?: (snapshot: QualitySnapshot) => void;
  private prevBytesReceived = 0;
  private prevTimestamp = 0;

  constructor(rtcManager: RTCManager) {
    this.rtcManager = rtcManager;
  }

  /**
   * Start monitoring quality. Calls onQualityChange with each snapshot.
   */
  start(onQualityChange: (snapshot: QualitySnapshot) => void): void {
    this.stop();
    this.onQualityChange = onQualityChange;
    this.history = [];
    this.prevBytesReceived = 0;
    this.prevTimestamp = 0;

    this.pollInterval = setInterval(() => this.poll(), POLL_INTERVAL);
    // Immediately poll once
    this.poll();
  }

  /**
   * Stop monitoring.
   */
  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /**
   * Get accumulated quality metrics for end-of-call reporting.
   */
  getMetrics(): QualityMetrics {
    if (this.history.length === 0) {
      return { avgLatencyMs: 0, maxLatencyMs: 0, packetLossPct: 0, avgBitrateKbps: 0 };
    }

    const valid = this.history.filter((s) => s.latencyMs > 0);

    const avgLatencyMs = valid.length > 0
      ? Math.round(valid.reduce((s, h) => s + h.latencyMs, 0) / valid.length)
      : 0;
    const maxLatencyMs = valid.length > 0
      ? Math.round(Math.max(...valid.map((h) => h.latencyMs)))
      : 0;
    const packetLossPct = valid.length > 0
      ? parseFloat((valid.reduce((s, h) => s + h.packetLossPercent, 0) / valid.length).toFixed(2))
      : 0;
    const avgBitrateKbps = valid.length > 0
      ? Math.round(valid.reduce((s, h) => s + h.bitrateKbps, 0) / valid.length)
      : 0;

    return { avgLatencyMs, maxLatencyMs, packetLossPct, avgBitrateKbps };
  }

  /**
   * Get the latest quality snapshot.
   */
  getLatest(): QualitySnapshot | null {
    return this.history.length > 0 ? this.history[this.history.length - 1] : null;
  }

  /**
   * Determine quality rating from metrics.
   */
  static rateQuality(latencyMs: number, packetLossPercent: number): CallQuality {
    if (latencyMs === 0 && packetLossPercent === 0) return 'unknown';
    if (latencyMs < 100 && packetLossPercent < 1) return 'excellent';
    if (latencyMs < 300 && packetLossPercent < 5) return 'good';
    return 'poor';
  }

  // ── Private ──

  private async poll(): Promise<void> {
    try {
      const stats = await this.rtcManager.getStats();
      if (!stats) return;

      // Calculate instantaneous bitrate
      const pc = this.rtcManager.getPeerConnection();
      let bitrateKbps = 0;

      if (pc) {
        const rawStats = await pc.getStats();
        rawStats.forEach((report) => {
          if (report.type === 'inbound-rtp' && report.kind === 'video') {
            if (this.prevTimestamp > 0 && report.bytesReceived) {
              const timeDiff = (report.timestamp - this.prevTimestamp) / 1000;
              if (timeDiff > 0) {
                bitrateKbps = Math.round(
                  ((report.bytesReceived - this.prevBytesReceived) * 8) / timeDiff / 1000
                );
              }
            }
            this.prevBytesReceived = report.bytesReceived || 0;
            this.prevTimestamp = report.timestamp;
          }
        });
      }

      const snapshot: QualitySnapshot = {
        timestamp: Date.now(),
        latencyMs: Math.round(stats.latencyMs),
        packetLossPercent: parseFloat(stats.packetLossPercent.toFixed(2)),
        bitrateKbps: bitrateKbps || Math.round(stats.bitrateKbps),
        jitterMs: Math.round(stats.jitterMs),
        quality: QualityMonitor.rateQuality(stats.latencyMs, stats.packetLossPercent),
        audioLevel: stats.audioLevel,
      };

      this.history.push(snapshot);
      if (this.history.length > MAX_HISTORY) {
        this.history.shift();
      }

      this.onQualityChange?.(snapshot);
    } catch (error) {
      logger.error('[QualityMonitor] Poll failed:', error);
    }
  }
}
