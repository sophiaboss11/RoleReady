import { inject, Injectable } from '@angular/core';
import { ApiClient } from './api.client';
import type { Mindmap } from '../domain/mindmap.types';
import type { ServiceResult } from '../domain/service-result';

interface MindmapRow {
  mermaid: string;
  retrievedCount: number;
  warning?: string | null;
}

interface JobAcceptedRow {
  job_id: string;
  status: string;
}

function isJobAccepted(row: unknown): row is JobAcceptedRow {
  return typeof row === 'object' && row !== null && 'job_id' in row && 'status' in row;
}

function toMindmap(row: MindmapRow): Mindmap {
  return {
    mermaid: row.mermaid,
    retrievedCount: row.retrievedCount,
    warning: row.warning ?? null,
  };
}

export interface GenerateMindmapResult {
  readonly mindmap: Mindmap | null;
  readonly jobId: string | null;
}

@Injectable({ providedIn: 'root' })
export class MindmapService {
  private readonly api = inject(ApiClient);

  async getMindmap(projectId: string): Promise<ServiceResult<Mindmap>> {
    const result = await this.api.get<MindmapRow>(`/api/v1/mindmap/${projectId}`);
    if (result.errorMessage) {
      return { data: null, errorMessage: result.errorMessage };
    }
    return { data: toMindmap(result.data!), errorMessage: null };
  }

  async generateMindmap(
    projectId: string,
    query: string,
    maxDocs = 6,
  ): Promise<ServiceResult<GenerateMindmapResult>> {
    const result = await this.api.post<MindmapRow | JobAcceptedRow>('/api/v1/mindmap/generate', {
      project_id: projectId,
      query,
      max_docs: maxDocs,
      require_context: true,
    });
    if (result.errorMessage) {
      return { data: null, errorMessage: result.errorMessage };
    }

    const raw = result.data!;

    if (isJobAccepted(raw)) {
      return { data: { mindmap: null, jobId: raw.job_id }, errorMessage: null };
    }

    return {
      data: { mindmap: toMindmap(raw as MindmapRow), jobId: null },
      errorMessage: null,
    };
  }
}
