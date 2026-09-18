import { inject, Injectable, signal } from '@angular/core';
import { ProjectService } from './project.service';
import { OrganizationFacade } from './organization.facade';
import type { Project, CreateProjectPayload, UpdateProjectPayload, ProjectDocument } from '../domain/project.types';
import { infraError, type ProjectError } from '../domain/project.errors';

export interface CreateProjectResult {
  readonly project: Project | null;
  readonly error: ProjectError | null;
}

@Injectable({ providedIn: 'root' })
export class ProjectFacade {
  private readonly projectService = inject(ProjectService);
  private readonly orgFacade = inject(OrganizationFacade);

  readonly projects = signal<Project[]>([]);
  readonly isLoading = signal(false);
  readonly isSaving = signal(false);
  readonly isDeleting = signal(false);

  readonly documents = signal<ProjectDocument[]>([]);
  readonly isUploadingDocuments = signal(false);

  async loadProjects(): Promise<ProjectError | null> {
    const orgId = this.orgFacade.activeOrgId();
    if (!orgId) return infraError('No active organization');

    this.isLoading.set(true);
    const { data, errorMessage } = await this.projectService.getProjectsByOrganization(orgId);
    this.isLoading.set(false);

    if (errorMessage) {
      return infraError(errorMessage);
    }

    this.projects.set(data ?? []);
    return null;
  }

  async createProject(payload: CreateProjectPayload): Promise<CreateProjectResult> {
    this.isSaving.set(true);
    const { data, errorMessage } = await this.projectService.createProject(payload);
    this.isSaving.set(false);

    if (errorMessage) {
      return { project: null, error: infraError(errorMessage) };
    }

    if (data) {
      this.projects.update((list) => [data, ...list]);
      return { project: data, error: null };
    }

    return { project: null, error: infraError('Project creation returned no data') };
  }

  async updateProject(
    projectId: string,
    payload: UpdateProjectPayload,
  ): Promise<ProjectError | null> {
    this.isSaving.set(true);
    const { data, errorMessage } = await this.projectService.updateProject(projectId, payload);
    this.isSaving.set(false);

    if (errorMessage) {
      return infraError(errorMessage);
    }

    if (data) {
      this.projects.update((list) => list.map((p) => (p.id === projectId ? data : p)));
    }

    return null;
  }

  async deleteProject(projectId: string): Promise<ProjectError | null> {
    this.isDeleting.set(true);
    const { errorMessage } = await this.projectService.deleteProject(projectId);
    this.isDeleting.set(false);

    if (errorMessage) {
      return infraError(errorMessage);
    }
    this.projects.update((list) => list.filter((p) => p.id !== projectId));
    return null;
  }

  /**
   * Re-fetch a single project and merge the updated data into the local list.
   * Used when realtime events or explicit refreshes require a fresh project row.
   */
  async refreshProject(projectId: string): Promise<ProjectError | null> {
    const { data, errorMessage } = await this.projectService.getProject(projectId);
    if (errorMessage) {
      return infraError(errorMessage);
    }
    if (data) {
      this.projects.update((list) => {
        const idx = list.findIndex((p) => p.id === projectId);
        if (idx >= 0) {
          const copy = [...list];
          copy[idx] = data;
          return copy;
        }
        return [data, ...list];
      });
    }
    return null;
  }

  async loadDocuments(projectId: string): Promise<ProjectError | null> {
    const { data, errorMessage } = await this.projectService.getDocuments(projectId);
    if (errorMessage) {
      return infraError(errorMessage);
    }
    this.documents.set(data ?? []);
    return null;
  }

  async uploadDocuments(projectId: string, files: File[]): Promise<ProjectError | null> {
    this.isUploadingDocuments.set(true);
    const { data, errorMessage } = await this.projectService.uploadDocuments(projectId, files);
    this.isUploadingDocuments.set(false);

    if (errorMessage) {
      return infraError(errorMessage);
    }

    if (data && data.length > 0) {
      // Append the newly uploaded documents to the list
      this.documents.update(docs => [...docs, ...data]);
    }
    return null;
  }
}
