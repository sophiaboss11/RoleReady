import { inject, Injectable } from '@angular/core';
import { ApiClient } from './api.client';
import type {
  Project,
  ProjectAsset,
  ProjectAssetType,
  ProjectAssetVisualPreviewType,
  ProjectStatus,
  CreateProjectPayload,
  UpdateProjectPayload,
  ProjectDocument,
} from '../domain/project.types';
import type { ServiceResult } from '../domain/service-result';

// ---------------------------------------------------------------------------
// Row shape returned by the backend API (snake_case)
// ---------------------------------------------------------------------------

interface ProjectRow {
  id: string;
  title: string;
  description: string;
  organization_id: string | null;
  github_link: string | null;
  jira_link: string | null;
  confluence_link: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface ProjectDocumentRow {
  readonly id?: string;
  readonly document_id?: string;
  readonly project_id: string;
  readonly filename: string;
  readonly content_type?: string;
  readonly size?: number;
  readonly created_at?: string;
  readonly updated_at?: string;
}

interface ProjectAssetRow {
  readonly asset_type: string;
  readonly title: string;
  readonly available: boolean;
  readonly preview: string | null;
  readonly visual_preview: string | null;
  readonly visual_preview_type: string | null;
}

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    projectName: row.title,
    projectDescription: row.description,
    githubLink: row.github_link,
    jiraLink: row.jira_link,
    confluenceLink: row.confluence_link,
    organizationId: row.organization_id ?? '',
    status: (row.status ?? 'created') as ProjectStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toProjectDocument(row: ProjectDocumentRow): ProjectDocument {
  const timestamp = new Date().toISOString();

  return {
    id: row.document_id ?? row.id ?? '',
    projectId: row.project_id,
    filename: row.filename,
    contentType: row.content_type,
    size: row.size,
    createdAt: row.created_at ?? timestamp,
    updatedAt: row.updated_at ?? timestamp,
  };
}

function toProjectAssetVisualPreviewType(
  value: string | null,
): ProjectAssetVisualPreviewType | null {
  if (value === 'image' || value === 'mermaid') return value;
  return null;
}

function toProjectAsset(row: ProjectAssetRow): ProjectAsset {
  return {
    assetType: row.asset_type as ProjectAssetType,
    title: row.title,
    available: row.available,
    preview: row.preview,
    visualPreview: row.visual_preview,
    visualPreviewType: toProjectAssetVisualPreviewType(row.visual_preview_type),
  };
}

// ---------------------------------------------------------------------------
// Service – all calls go through the backend REST API
// ---------------------------------------------------------------------------

@Injectable({ providedIn: 'root' })
export class ProjectService {
  private readonly api = inject(ApiClient);

  // ── GET /projects?organization_id=… ────────────────────────────────
  async getProjectsByOrganization(orgId: string): Promise<ServiceResult<Project[]>> {
    const result = await this.api.get<ProjectRow[]>(
      `/api/v1/projects/?organization_id=${encodeURIComponent(orgId)}`,
    );
    if (result.errorMessage) {
      return { data: null, errorMessage: result.errorMessage };
    }
    return {
      data: (result.data ?? []).map(toProject),
      errorMessage: null,
    };
  }

  // ── GET /projects/{id} ─────────────────────────────────────────────
  async getProject(projectId: string): Promise<ServiceResult<Project>> {
    const result = await this.api.get<ProjectRow>(`/api/v1/projects/${projectId}`);
    if (result.errorMessage) {
      return { data: null, errorMessage: result.errorMessage };
    }
    return { data: toProject(result.data!), errorMessage: null };
  }

  // ── POST /projects/ ────────────────────────────────────────────────
  async createProject(payload: CreateProjectPayload): Promise<ServiceResult<Project>> {
    const body = {
      title: payload.projectName,
      description: payload.projectDescription,
      organization_id: payload.organizationId,
      github_link: payload.githubLink ?? null,
      jira_link: payload.jiraLink ?? null,
      confluence_link: payload.confluenceLink ?? null,
      repository_token: payload.repositoryToken ?? null,
    };
    const result = await this.api.post<ProjectRow>('/api/v1/projects/', body);
    if (result.errorMessage) {
      return { data: null, errorMessage: result.errorMessage };
    }
    return { data: toProject(result.data!), errorMessage: null };
  }

  // ── PUT /projects/{id} ─────────────────────────────────────────────
  async updateProject(
    projectId: string,
    payload: UpdateProjectPayload,
  ): Promise<ServiceResult<Project>> {
    const body = {
      title: payload.projectName,
      description: payload.projectDescription,
      github_link: payload.githubLink,
      jira_link: payload.jiraLink,
      confluence_link: payload.confluenceLink,
      repository_token: payload.repositoryToken ?? null,
    };
    const result = await this.api.put<ProjectRow>(`/api/v1/projects/${projectId}`, body);
    if (result.errorMessage) {
      return { data: null, errorMessage: result.errorMessage };
    }
    return { data: toProject(result.data!), errorMessage: null };
  }

  // ── GET /projects/{id}/assets ────────────────────────────────────────
  async getProjectAssets(projectId: string): Promise<ServiceResult<ProjectAsset[]>> {
    const result = await this.api.get<ProjectAssetRow[]>(`/api/v1/projects/${projectId}/assets`);
    if (result.errorMessage) {
      return { data: null, errorMessage: result.errorMessage };
    }
    return {
      data: (result.data ?? []).map(toProjectAsset),
      errorMessage: null,
    };
  }

  // ── DELETE /projects/{id} ──────────────────────────────────────────
  async deleteProject(projectId: string): Promise<ServiceResult<void>> {
    const result = await this.api.delete<{ message: string }>(`/api/v1/projects/${projectId}`);
    if (result.errorMessage) {
      return { data: null, errorMessage: result.errorMessage };
    }
    return { data: undefined, errorMessage: null };
  }

  // ── GET /projects/{id}/documents ────────────────────────────────────
  async getDocuments(projectId: string): Promise<ServiceResult<ProjectDocument[]>> {
    const result = await this.api.get<ProjectDocumentRow[]>(
      `/api/v1/projects/${projectId}/documents`,
    );
    if (result.errorMessage) {
      return { data: null, errorMessage: result.errorMessage };
    }

    const docs = (result.data ?? []).map(toProjectDocument);
    return { data: docs, errorMessage: null };
  }

  // ── POST /projects/{id}/documents/bulk ──────────────────────────────
  async uploadDocuments(
    projectId: string,
    files: File[],
  ): Promise<ServiceResult<ProjectDocument[]>> {
    if (files.length === 0) return { data: [], errorMessage: null };

    const formData = new FormData();
    files.forEach((file) => {
      formData.append('files', file);
    });

    const result = await this.api.postFormData<ProjectDocumentRow[]>(
      `/api/v1/projects/${projectId}/documents/bulk`,
      formData,
    );

    if (result.errorMessage) {
      return { data: null, errorMessage: result.errorMessage };
    }

    const docs = (result.data ?? []).map(toProjectDocument);
    return { data: docs, errorMessage: null };
  }
}
