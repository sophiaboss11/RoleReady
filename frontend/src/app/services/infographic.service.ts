import { inject, Injectable } from '@angular/core';
import { ApiClient } from './api.client';
import type { Infographic } from '../domain/infographic.types';
import type { ServiceResult } from '../domain/service-result';

interface InfographicRow {
  id: string;
  project_id: string;
  image_url: string | null;
  is_processed: boolean;
  infographic_text?: string | null;
  created_at: string;
  updated_at: string;
}

interface JobAcceptedRow {
  job_id: string;
  status: string;
}

function isJobAccepted(row: unknown): row is JobAcceptedRow {
  return (
    typeof row === 'object' && row !== null && 'job_id' in row && 'status' in row && !('id' in row)
  );
}

function toInfographic(row: InfographicRow): Infographic {
  return {
    id: row.id,
    projectId: row.project_id,
    imageUrl: row.image_url,
    isProcessed: row.is_processed,
    infographicText: row.infographic_text ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface GenerateInfographicResult {
  readonly infographic: Infographic | null;
  readonly jobId: string | null;
}

@Injectable({ providedIn: 'root' })
export class InfographicService {
  private readonly api = inject(ApiClient);

  async getInfographic(projectId: string): Promise<ServiceResult<Infographic>> {
    const result = await this.api.get<InfographicRow>(`/api/v1/infographics/${projectId}`);

    if (result.errorMessage) {
      return { data: null, errorMessage: result.errorMessage };
    }

    return { data: toInfographic(result.data!), errorMessage: null };
  }

  async generateInfographic(projectId: string): Promise<ServiceResult<GenerateInfographicResult>> {
    const result = await this.api.post<InfographicRow | JobAcceptedRow>(
      '/api/v1/infographics/generate',
      {
        project_id: projectId,
      },
    );

    if (result.errorMessage) {
      return { data: null, errorMessage: result.errorMessage };
    }

    const raw = result.data!;
    if (isJobAccepted(raw)) {
      return { data: { infographic: null, jobId: raw.job_id }, errorMessage: null };
    }

    return {
      data: { infographic: toInfographic(raw as InfographicRow), jobId: null },
      errorMessage: null,
    };
  }
}
