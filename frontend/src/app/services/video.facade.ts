import { computed, inject, Injectable, signal } from '@angular/core';
import { VideoService } from './video.service';
import { GenerationJobFacadeBase } from './generation-job.facade-base';
import type { Video } from '../domain/video.types';
import { infraError, type VideoError } from '../domain/video.errors';

@Injectable()
export class VideoFacade extends GenerationJobFacadeBase {
  private readonly videoService = inject(VideoService);

  readonly video = signal<Video | null>(null);
  readonly isLoading = signal(false);
  readonly hasVideo = computed(() => this.video() !== null);

  async loadVideo(projectId: string): Promise<VideoError | null> {
    this.isLoading.set(true);
    const { data, errorMessage } = await this.videoService.getVideo(projectId);
    this.isLoading.set(false);

    if (errorMessage) {
      if (errorMessage.includes('not found') || errorMessage.includes('404')) {
        this.video.set(null);
        return null;
      }
      return infraError(errorMessage);
    }

    this.video.set(data);
    return null;
  }

  async generateVideo(projectId: string): Promise<VideoError | null> {
    this.generationStatus.set('pending');
    this.generationError.set(null);

    const { data, errorMessage } = await this.videoService.generateVideo(projectId);

    if (errorMessage) {
      this.generationStatus.set('failed');
      this.generationError.set(errorMessage);
      return infraError(errorMessage);
    }

    if (data?.completedSync) {
      const loadError = await this.loadVideo(projectId);
      this.generationStatus.set('idle');
      return loadError;
    }

    this.subscribeToGenerationJob(
      projectId,
      'video_generation',
      async (activeProjectId) => this.loadVideo(activeProjectId),
      'Video generation failed.',
    );
    return null;
  }

  async checkForActiveJob(projectId: string, retries = 3): Promise<void> {
    await this.checkForActiveGenerationJob(
      projectId,
      'video_generation',
      async (activeProjectId) => this.loadVideo(activeProjectId),
      'Video generation failed.',
      retries,
    );
  }

  dismissError(): void {
    this.generationStatus.set('idle');
    this.generationError.set(null);
  }
}
