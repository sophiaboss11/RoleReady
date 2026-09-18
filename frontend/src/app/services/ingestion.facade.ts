import { inject, Injectable, OnDestroy, signal } from '@angular/core';
import { IngestionService } from './ingestion.service';
import { JobRealtimeService } from './job-realtime.service';
import type { Job } from '../domain/ingestion.types';
import { infraError, type IngestionError } from '../domain/ingestion.errors';

@Injectable()
export class IngestionFacade implements OnDestroy {
  private readonly ingestionService = inject(IngestionService);
  private readonly jobRealtime = inject(JobRealtimeService);

  readonly latestGithubJob = signal<Job | null>(null);
  readonly isStarting = signal(false);

  private unsubscribe: (() => void) | null = null;

  async checkForActiveJob(projectId: string): Promise<void> {
    const { data } = await this.ingestionService.getProjectJobs(projectId, 'github_ingestion');
    if (!data || data.length === 0) return;

    const latest = data[0];
    this.latestGithubJob.set(latest);

    if (latest.status === 'pending' || latest.status === 'running') {
      this.subscribeToJobUpdates(projectId);
    }
  }

  async startGithubIngestion(projectId: string, repoUrl: string): Promise<IngestionError | null> {
    this.isStarting.set(true);

    const { data, errorMessage } = await this.ingestionService.startGithubIngestion(
      projectId,
      repoUrl,
    );
    this.isStarting.set(false);

    if (errorMessage) {
      return infraError(errorMessage);
    }

    this.latestGithubJob.set({
      id: data!.jobId,
      projectId,
      userId: '',
      jobType: 'github_ingestion',
      status: 'pending',
      errorMessage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    this.subscribeToJobUpdates(projectId);
    return null;
  }

  ngOnDestroy(): void {
    this.clearSubscription();
  }

  private subscribeToJobUpdates(projectId: string): void {
    this.clearSubscription();
    this.jobRealtime.connect(projectId);

    this.unsubscribe = this.jobRealtime.onJobChange('github_ingestion', (payload) => {
      this.latestGithubJob.set({
        id: payload.id,
        projectId: payload.projectId,
        userId: payload.userId,
        jobType: payload.jobType,
        status: payload.status,
        errorMessage: payload.errorMessage,
        createdAt: payload.createdAt,
        updatedAt: payload.updatedAt,
      });

      if (payload.status === 'completed' || payload.status === 'failed') {
        this.clearSubscription();
      }
    });
  }

  private clearSubscription(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }
}
