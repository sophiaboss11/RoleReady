import { inject, Injectable } from '@angular/core';
import { ApiClient } from './api.client';
import type { ProjectPrompt, PromptDefault, PromptType } from '../domain/prompt.types';
import type { ServiceResult } from '../domain/service-result';

interface DeleteResult {
  deleted: boolean;
}

interface ProjectPromptRow {
  id: string;
  project_id: string;
  prompt_type: PromptType;
  instruction: string;
  created_at: string;
  updated_at: string;
}

interface PromptDefaultRow {
  prompt_type: PromptType;
  instruction: string;
}

function toProjectPrompt(row: ProjectPromptRow): ProjectPrompt {
  return {
    id: row.id,
    projectId: row.project_id,
    promptType: row.prompt_type,
    instruction: row.instruction,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toPromptDefault(row: PromptDefaultRow): PromptDefault {
  return {
    promptType: row.prompt_type,
    instruction: row.instruction,
  };
}

@Injectable({ providedIn: 'root' })
export class PromptService {
  private readonly api = inject(ApiClient);

  async getDefaults(): Promise<ServiceResult<readonly PromptDefault[]>> {
    const result = await this.api.get<readonly PromptDefaultRow[]>('/api/v1/prompts/defaults');

    if (result.errorMessage) {
      return { data: null, errorMessage: result.errorMessage };
    }

    return { data: result.data!.map(toPromptDefault), errorMessage: null };
  }

  async getPrompts(projectId: string): Promise<ServiceResult<readonly ProjectPrompt[]>> {
    const result = await this.api.get<readonly ProjectPromptRow[]>(`/api/v1/prompts/${projectId}`);

    if (result.errorMessage) {
      return { data: null, errorMessage: result.errorMessage };
    }

    return { data: result.data!.map(toProjectPrompt), errorMessage: null };
  }

  async savePrompt(
    projectId: string,
    promptType: PromptType,
    instruction: string,
  ): Promise<ServiceResult<ProjectPrompt>> {
    const result = await this.api.put<ProjectPromptRow>('/api/v1/prompts/', {
      project_id: projectId,
      prompt_type: promptType,
      instruction,
    });

    if (result.errorMessage) {
      return { data: null, errorMessage: result.errorMessage };
    }

    return { data: toProjectPrompt(result.data!), errorMessage: null };
  }

  async deletePrompt(
    projectId: string,
    promptType: PromptType,
  ): Promise<ServiceResult<DeleteResult>> {
    return this.api.delete<DeleteResult>(`/api/v1/prompts/${projectId}/${promptType}`);
  }
}
