import { computed, inject, Injectable, signal } from '@angular/core';
import { AudioService } from './audio.service';
import { GenerationJobFacadeBase } from './generation-job.facade-base';
import type { Audio } from '../domain/audio.types';
import { infraError, type AudioError } from '../domain/audio.errors';

@Injectable()
export class AudioFacade extends GenerationJobFacadeBase {
  private readonly audioService = inject(AudioService);

  readonly audio = signal<Audio | null>(null);
  readonly isLoading = signal(false);
  readonly hasAudio = computed(() => this.audio() !== null);

  async loadAudio(projectId: string): Promise<AudioError | null> {
    this.isLoading.set(true);
    const { data, errorMessage } = await this.audioService.getAudio(projectId);
    this.isLoading.set(false);

    if (errorMessage) {
      if (errorMessage.includes('not found') || errorMessage.includes('404')) {
        this.audio.set(null);
        return null;
      }
      return infraError(errorMessage);
    }

    this.audio.set(data);
    return null;
  }

  async generateAudio(projectId: string): Promise<AudioError | null> {
    this.generationStatus.set('pending');
    this.generationError.set(null);

    const { data, errorMessage } = await this.audioService.generateAudio(projectId);

    if (errorMessage) {
      this.generationStatus.set('failed');
      this.generationError.set(errorMessage);
      return infraError(errorMessage);
    }

    if (data?.audio) {
      this.audio.set(data.audio);
      this.generationStatus.set('idle');
      return null;
    }

    this.subscribeToGenerationJob(
      projectId,
      'tts_generation',
      async (activeProjectId) => this.loadAudio(activeProjectId),
      'Audio generation failed.',
    );
    return null;
  }

  async checkForActiveJob(projectId: string, retries = 3): Promise<void> {
    await this.checkForActiveGenerationJob(
      projectId,
      'tts_generation',
      async (activeProjectId) => this.loadAudio(activeProjectId),
      'Audio generation failed.',
      retries,
    );
  }

  dismissError(): void {
    this.generationStatus.set('idle');
    this.generationError.set(null);
  }
}
