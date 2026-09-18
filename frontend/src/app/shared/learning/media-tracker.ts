import { DestroyRef, inject, Injectable } from '@angular/core';
import { LearningSessionService, type LearningEventType } from './learning-session.service';

export type MediaType = 'video' | 'audio';

interface MediaTrackerConfig {
  readonly sessionId: string;
  readonly stepId: string;
  readonly mediaType: MediaType;
  readonly heartbeatIntervalMs?: number;
}

/**
 * Shared abstraction for tracking audio/video playback events.
 * Both media types use the same event contract so that
 * watch_time / listen_time can be aggregated uniformly.
 */
@Injectable({ providedIn: 'root' })
export class MediaTracker {
  private readonly destroyRef = inject(DestroyRef);
  private readonly sessionService = inject(LearningSessionService);

  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastPosition = 0;
  private config: MediaTrackerConfig | null = null;

  attach(config: MediaTrackerConfig): void {
    this.detach();
    this.config = config;
    this.lastPosition = 0;

    const interval = config.heartbeatIntervalMs ?? 10_000;
    this.heartbeatTimer = setInterval(() => {
      void this.sendHeartbeat();
    }, interval);

    this.destroyRef.onDestroy(() => this.detach());
  }

  detach(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.config = null;
  }

  onPlay(positionSeconds: number): void {
    this.lastPosition = positionSeconds;
    void this.send('play', { position_seconds: positionSeconds });
  }

  onPause(positionSeconds: number): void {
    this.lastPosition = positionSeconds;
    void this.send('pause', { position_seconds: positionSeconds });
  }

  onSeek(fromSeconds: number, toSeconds: number): void {
    this.lastPosition = toSeconds;
    void this.send('seek', {
      from_seconds: fromSeconds,
      to_seconds: toSeconds,
    });
  }

  onPlaybackEnd(totalDurationSeconds: number): void {
    void this.send('playback_end', {
      total_duration_seconds: totalDurationSeconds,
      position_seconds: this.lastPosition,
    });
  }

  updatePosition(positionSeconds: number): void {
    this.lastPosition = positionSeconds;
  }

  private async sendHeartbeat(): Promise<void> {
    if (!this.config) return;
    await this.send('heartbeat', {
      position_seconds: this.lastPosition,
      media_type: this.config.mediaType,
      duration_seconds: 10,
    });
  }

  private async send(
    eventType: LearningEventType,
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (!this.config) return;
    const enriched = {
      ...payload,
      media_type: this.config.mediaType,
    };
    await this.sessionService.recordEvent(
      this.config.sessionId,
      eventType,
      this.config.stepId,
      enriched,
    );
  }
}
