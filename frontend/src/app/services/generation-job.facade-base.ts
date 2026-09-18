import { computed, inject, Injectable, OnDestroy, signal } from '@angular/core';
import { IngestionService } from './ingestion.service';
import { JobRealtimeService } from './job-realtime.service';
import type { GenerationStatus, JobType } from '../domain/ingestion.types';

type CompletionHandler = (projectId: string) => Promise<unknown> | void;

@Injectable()
export abstract class GenerationJobFacadeBase implements OnDestroy {
  private readonly ingestionService = inject(IngestionService);
  private readonly jobRealtime = inject(JobRealtimeService);

  readonly generationStatus = signal<GenerationStatus>('idle');
  readonly generationError = signal<string | null>(null);
  readonly isGenerating = computed(() => {
    const status = this.generationStatus();
    return status === 'pending' || status === 'running';
  });

  private unsubscribe: (() => void) | null = null;

  protected subscribeToGenerationJob(
    projectId: string,
    jobType: JobType,
    onCompleted: CompletionHandler,
    fallbackErrorMessage: string,
  ): void {
    this.clearSubscription();
    this.jobRealtime.connect(projectId);

    this.unsubscribe = this.jobRealtime.onJobChange(jobType, async (payload) => {
      if (payload.status === 'completed') {
        this.clearSubscription();
        await onCompleted(payload.projectId);
        this.generationStatus.set('idle');
        return;
      }

      if (payload.status === 'failed') {
        this.clearSubscription();
        this.generationStatus.set('failed');
        this.generationError.set(payload.errorMessage ?? fallbackErrorMessage);
        return;
      }

      this.generationStatus.set(payload.status);
    });
  }

  protected async checkForActiveGenerationJob(
    projectId: string,
    jobType: JobType,
    onCompleted: CompletionHandler,
    fallbackErrorMessage: string,
    retries = 3,
  ): Promise<void> {
    const wasTriggered = this.isGenerating();

    for (let attempt = 0; attempt <= retries; attempt++) {
      const { data } = await this.ingestionService.getProjectJobs(projectId, jobType);

      if (data?.length) {
        const latest = data[0];

        if (latest.status === 'pending' || latest.status === 'running') {
          this.generationStatus.set(latest.status);
          this.subscribeToGenerationJob(projectId, jobType, onCompleted, fallbackErrorMessage);
          return;
        }

        if (wasTriggered && latest.status === 'completed') {
          await onCompleted(projectId);
          this.generationStatus.set('idle');
          return;
        }

        if (wasTriggered && latest.status === 'failed') {
          this.generationStatus.set('failed');
          this.generationError.set(latest.errorMessage ?? fallbackErrorMessage);
          return;
        }

        this.generationStatus.set('idle');
        return;
      }

      if (attempt < retries) {
        await sleep(1000);
      }
    }

    if (wasTriggered) {
      this.generationStatus.set('idle');
    }
  }

  protected clearSubscription(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  ngOnDestroy(): void {
    this.clearSubscription();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
