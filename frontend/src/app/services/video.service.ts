import { inject, Injectable } from '@angular/core';
import { ApiClient } from './api.client';
import type { Video } from '../domain/video.types';
import type { ServiceResult } from '../domain/service-result';

interface VideoRow {
  id: string;
  project_id: string;
  video_url: string | null;
  prompt: string;
  retrieved_count: number;
  slide_count: number;
  warning: string | null;
  metadata: Record<string, unknown> | null;
  is_processed: boolean;
  created_at: string;
  updated_at: string;
}

interface JobAcceptedRow {
  job_id: string;
  status: string;
}

interface SyncGeneratedRow {
  video_url: string;
  retrieved_count: number;
  slide_count: number;
  warning: string | null;
}

function isJobAccepted(row: unknown): row is JobAcceptedRow {
  return (
    typeof row === 'object' &&
    row !== null &&
    'job_id' in row &&
    'status' in row &&
    !('video_url' in row)
  );
}

function toVideo(row: VideoRow): Video {
  return {
    id: row.id,
    projectId: row.project_id,
    videoUrl: row.video_url,
    prompt: row.prompt,
    retrievedCount: row.retrieved_count,
    slideCount: row.slide_count,
    warning: row.warning,
    metadata: row.metadata ?? {},
    isProcessed: row.is_processed,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface GenerateVideoResult {
  readonly video: Video | null;
  readonly jobId: string | null;
  readonly completedSync: boolean;
}

@Injectable({ providedIn: 'root' })
export class VideoService {
  private readonly api = inject(ApiClient);

  async getVideo(projectId: string): Promise<ServiceResult<Video>> {
    const result = await this.api.get<VideoRow>(`/api/v1/video/${projectId}`);

    if (result.errorMessage) {
      return { data: null, errorMessage: result.errorMessage };
    }

    return { data: toVideo(result.data!), errorMessage: null };
  }

  async generateVideo(projectId: string): Promise<ServiceResult<GenerateVideoResult>> {
    const result = await this.api.post<JobAcceptedRow | SyncGeneratedRow>('/api/v1/video/generate', {
      project_id: projectId,
    });

    if (result.errorMessage) {
      return { data: null, errorMessage: result.errorMessage };
    }

    const raw = result.data!;
    if (isJobAccepted(raw)) {
      return {
        data: { video: null, jobId: raw.job_id, completedSync: false },
        errorMessage: null,
      };
    }

    return {
      data: { video: null, jobId: null, completedSync: true },
      errorMessage: null,
    };
  }
}
