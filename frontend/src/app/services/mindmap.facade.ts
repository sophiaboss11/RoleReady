import { inject, Injectable, signal } from '@angular/core';
import { MindmapService } from './mindmap.service';
import { GenerationJobFacadeBase } from './generation-job.facade-base';
import type { Mindmap } from '../domain/mindmap.types';
import { infraError, type MindmapError } from '../domain/mindmap.errors';

@Injectable()
export class MindmapFacade extends GenerationJobFacadeBase {
  private readonly mindmapService = inject(MindmapService);

  readonly mindmap = signal<Mindmap | null>(null);
  readonly isLoading = signal(false);

  async loadMindmap(projectId: string): Promise<MindmapError | null> {
    this.isLoading.set(true);
    const { data, errorMessage } = await this.mindmapService.getMindmap(projectId);
    this.isLoading.set(false);

    if (errorMessage) {
      if (errorMessage.includes('not found') || errorMessage.includes('404')) {
        this.mindmap.set(null);
        return null;
      }
      return infraError(errorMessage);
    }

    if (!data) {
      this.mindmap.set(null);
      return null;
    }

    this.mindmap.set(data);
    return null;
  }

  async generateMindmap(projectId: string, query: string): Promise<MindmapError | null> {
    this.generationStatus.set('pending');
    this.generationError.set(null);
    const { data, errorMessage } = await this.mindmapService.generateMindmap(projectId, query);

    if (errorMessage) {
      this.generationStatus.set('failed');
      this.generationError.set(errorMessage);
      return infraError(errorMessage);
    }

    if (data?.mindmap) {
      this.mindmap.set(data.mindmap);
      this.generationStatus.set('idle');
      return null;
    }

    if (data?.jobId) {
      this.subscribeToGenerationJob(
        projectId,
        'mindmap_generation',
        async (activeProjectId) => this.loadMindmap(activeProjectId),
        'Mindmap generation failed.',
      );
      return null;
    }

    this.generationStatus.set('idle');
    return null;
  }

  async checkForActiveJob(projectId: string, retries = 3): Promise<void> {
    await this.checkForActiveGenerationJob(
      projectId,
      'mindmap_generation',
      async (activeProjectId) => this.loadMindmap(activeProjectId),
      'Mindmap generation failed.',
      retries,
    );
  }

  dismissError(): void {
    this.generationStatus.set('idle');
    this.generationError.set(null);
  }
}
