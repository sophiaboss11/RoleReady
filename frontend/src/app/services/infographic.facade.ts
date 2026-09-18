import { inject, Injectable, signal } from '@angular/core';
import { InfographicService } from './infographic.service';
import { GenerationJobFacadeBase } from './generation-job.facade-base';
import type { Infographic } from '../domain/infographic.types';
import { infraError, type InfographicError } from '../domain/infographic.errors';

@Injectable()
export class InfographicFacade extends GenerationJobFacadeBase {
  private readonly infographicService = inject(InfographicService);

  readonly infographic = signal<Infographic | null>(null);
  readonly isLoading = signal(false);

  async loadInfographic(projectId: string): Promise<InfographicError | null> {
    this.isLoading.set(true);
    const { data, errorMessage } = await this.infographicService.getInfographic(projectId);
    this.isLoading.set(false);

    if (errorMessage) {
      if (errorMessage.includes('not found') || errorMessage.includes('404')) {
        return null;
      }
      return infraError(errorMessage);
    }

    this.infographic.set(data);
    return null;
  }

  async generateInfographic(projectId: string): Promise<InfographicError | null> {
    this.generationStatus.set('pending');
    this.generationError.set(null);

    const { data, errorMessage } = await this.infographicService.generateInfographic(projectId);

    if (errorMessage) {
      this.generationStatus.set('failed');
      this.generationError.set(errorMessage);
      return infraError(errorMessage);
    }

    if (data?.infographic) {
      this.infographic.set(data.infographic);
      this.generationStatus.set('idle');
      return null;
    }

    this.subscribeToGenerationJob(
      projectId,
      'infographic_generation',
      async (activeProjectId) => this.loadInfographic(activeProjectId),
      'Infographic generation failed.',
    );
    return null;
  }

  async checkForActiveJob(projectId: string, retries = 3): Promise<void> {
    await this.checkForActiveGenerationJob(
      projectId,
      'infographic_generation',
      async (activeProjectId) => this.loadInfographic(activeProjectId),
      'Infographic generation failed.',
      retries,
    );
  }

  dismissError(): void {
    this.generationStatus.set('idle');
    this.generationError.set(null);
  }
}
