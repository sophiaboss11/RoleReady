import { inject, Injectable } from '@angular/core';
import { ApiClient } from './api.client';
import {
  isJobStatus,
  type Job,
  type JobType,
  type StartIngestionResponse,
} from '../domain/ingestion.types';
import type { ServiceResult } from '../domain/service-result';

interface JobRow {
  id: string;
  project_id: string;
  user_id: string;
  job_type: JobType;
  status: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

interface GithubIngestionRow {
  message: string;
  project_id: string;
  job_id: string;
}

function toJob(row: JobRow): Job | null {
  if (!isJobStatus(row.status)) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    jobType: row.job_type,
    status: row.status,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toStartIngestionResponse(row: GithubIngestionRow): StartIngestionResponse {
  return {
    message: row.message,
    projectId: row.project_id,
    jobId: row.job_id,
  };
}

@Injectable({ providedIn: 'root' })
export class IngestionService {
  private readonly api = inject(ApiClient);

  async startGithubIngestion(
    projectId: string,
    repoUrl: string,
  ): Promise<ServiceResult<StartIngestionResponse>> {
    const result = await this.api.post<GithubIngestionRow>('/api/v1/ingestion/github', {
      project_id: projectId,
      repo_url: repoUrl,
    });

    if (result.errorMessage) {
      return { data: null, errorMessage: result.errorMessage };
    }

    return { data: toStartIngestionResponse(result.data!), errorMessage: null };
  }

  async getProjectJobs(projectId: string, jobType?: JobType): Promise<ServiceResult<Job[]>> {
    const params = jobType ? `?job_type=${jobType}` : '';
    const result = await this.api.get<JobRow[]>(`/api/v1/jobs/${projectId}${params}`);

    if (result.errorMessage) {
      return { data: null, errorMessage: result.errorMessage };
    }

    const jobs = (result.data ?? []).map(toJob).filter((j): j is Job => j !== null);
    return { data: jobs, errorMessage: null };
  }
}
