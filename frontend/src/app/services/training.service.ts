import { inject, Injectable } from '@angular/core';
import { ApiClient } from './api.client';
import type { ServiceResult } from '../domain/service-result';
import type {
  AssignmentStatus,
  CreateTrainingFromProjectPayload,
  ModuleProgress,
  ModuleProgressStatus,
  ModuleType,
  Training,
  TrainingAssignment,
  TrainingCoverImageStatus,
  TrainingLeaderboardEntry,
  TrainingOverview,
  TrainingSummary,
  TrainingStatus,
  TrainingModule,
  UpdateProgressPayload,
} from '../domain/training.types';
import {
  isAssignmentStatus,
  isModuleProgressStatus,
  isModuleType,
  isTrainingCoverImageStatus,
  isTrainingStatus,
} from '../domain/training.types';

interface TrainingRow {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: unknown;
  created_by: string;
  cover_image_url?: string | null;
  cover_image_status?: unknown;
  cover_image_error?: string | null;
  cover_image_generated_at?: string | null;
  created_at: string;
  updated_at: string;
}

interface TrainingSummaryRow extends TrainingRow {
  module_count: number;
  assignment_count: number;
  average_progress_pct: number;
  viewer_assignment_id: string | null;
  viewer_assignment_status: unknown;
  viewer_progress_pct: number | null;
}

interface ModuleRow {
  id: string;
  training_id: string;
  title: string;
  description: string | null;
  module_type: unknown;
  sort_order: number;
  content_url: string | null;
  content_body: string | null;
  is_required: boolean;
  estimated_duration_minutes: number | null;
  created_at: string;
  updated_at: string;
}

interface AssignmentRow {
  id: string;
  training_id: string;
  user_id: string;
  assigned_by: string;
  display_name?: string | null;
  avatar_url?: string | null;
  status: unknown;
  due_date: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  progress_pct: number;
}

interface ProgressRow {
  id: string;
  assignment_id: string;
  module_id: string;
  status: unknown;
  progress_pct: number;
  last_position_seconds: number | null;
  score: number | null;
  max_score: number | null;
  attempts: number;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
}

interface LeaderboardEntryRow {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  progress_pct: number;
  status: unknown;
}

interface TrainingOverviewRow {
  training: TrainingRow;
  modules: ModuleRow[];
  viewer_assignment: AssignmentRow | null;
  viewer_progress: ProgressRow[];
  assignments: AssignmentRow[];
  leaderboard: LeaderboardEntryRow[];
}

function parseTrainingStatus(value: unknown): TrainingStatus {
  if (!isTrainingStatus(value)) {
    throw new Error(`Invalid training status: ${String(value)}`);
  }
  return value;
}

function parseTrainingCoverImageStatus(value: unknown): TrainingCoverImageStatus {
  if (value === undefined || value === null) {
    return 'pending';
  }
  if (!isTrainingCoverImageStatus(value)) {
    throw new Error(`Invalid training cover image status: ${String(value)}`);
  }
  return value;
}

function parseModuleType(value: unknown): ModuleType {
  if (!isModuleType(value)) {
    throw new Error(`Invalid module type: ${String(value)}`);
  }
  return value;
}

function parseAssignmentStatus(value: unknown): AssignmentStatus {
  if (!isAssignmentStatus(value)) {
    throw new Error(`Invalid assignment status: ${String(value)}`);
  }
  return value;
}

function parseModuleProgressStatus(value: unknown): ModuleProgressStatus {
  if (!isModuleProgressStatus(value)) {
    throw new Error(`Invalid module progress status: ${String(value)}`);
  }
  return value;
}

function toTraining(row: TrainingRow): Training {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    status: parseTrainingStatus(row.status),
    createdBy: row.created_by,
    coverImageUrl: row.cover_image_url ?? null,
    coverImageStatus: parseTrainingCoverImageStatus(row.cover_image_status),
    coverImageError: row.cover_image_error ?? null,
    coverImageGeneratedAt: row.cover_image_generated_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toTrainingSummary(row: TrainingSummaryRow): TrainingSummary {
  return {
    ...toTraining(row),
    moduleCount: row.module_count,
    assignmentCount: row.assignment_count,
    averageProgressPct: row.average_progress_pct,
    viewerAssignmentId: row.viewer_assignment_id,
    viewerAssignmentStatus:
      row.viewer_assignment_status === null
        ? null
        : parseAssignmentStatus(row.viewer_assignment_status),
    viewerProgressPct: row.viewer_progress_pct,
  };
}

function toModule(row: ModuleRow): TrainingModule {
  return {
    id: row.id,
    trainingId: row.training_id,
    title: row.title,
    description: row.description,
    moduleType: parseModuleType(row.module_type),
    sortOrder: row.sort_order,
    contentUrl: row.content_url,
    contentBody: row.content_body,
    isRequired: row.is_required,
    estimatedDurationMinutes: row.estimated_duration_minutes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toAssignment(row: AssignmentRow): TrainingAssignment {
  return {
    id: row.id,
    trainingId: row.training_id,
    userId: row.user_id,
    assignedBy: row.assigned_by,
    displayName: row.display_name ?? null,
    avatarUrl: row.avatar_url ?? null,
    status: parseAssignmentStatus(row.status),
    dueDate: row.due_date,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    progressPct: row.progress_pct,
  };
}

function toProgress(row: ProgressRow): ModuleProgress {
  return {
    id: row.id,
    assignmentId: row.assignment_id,
    moduleId: row.module_id,
    status: parseModuleProgressStatus(row.status),
    progressPct: row.progress_pct,
    lastPositionSeconds: row.last_position_seconds,
    score: row.score,
    maxScore: row.max_score,
    attempts: row.attempts,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  };
}

function toLeaderboardEntry(row: LeaderboardEntryRow): TrainingLeaderboardEntry {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    progressPct: row.progress_pct,
    status: parseAssignmentStatus(row.status),
  };
}

function toOverview(row: TrainingOverviewRow): TrainingOverview {
  return {
    training: toTraining(row.training),
    modules: row.modules.map(toModule),
    viewerAssignment: row.viewer_assignment ? toAssignment(row.viewer_assignment) : null,
    viewerProgress: row.viewer_progress.map(toProgress),
    assignments: row.assignments.map(toAssignment),
    leaderboard: (row.leaderboard ?? []).map(toLeaderboardEntry),
  };
}

function mapResult<TRow, TDomain>(
  result: ServiceResult<TRow>,
  mapper: (row: TRow) => TDomain,
): ServiceResult<TDomain> {
  if (result.errorMessage) {
    return { data: null, errorMessage: result.errorMessage };
  }

  if (result.data === null) {
    return { data: null, errorMessage: 'Training API returned no data' };
  }

  try {
    return {
      data: mapper(result.data),
      errorMessage: null,
    };
  } catch (error) {
    return {
      data: null,
      errorMessage:
        error instanceof Error ? error.message : 'Training API returned an invalid payload',
    };
  }
}

@Injectable({ providedIn: 'root' })
export class TrainingService {
  private readonly api = inject(ApiClient);

  async getTrainingSummariesByOrganization(
    orgId: string,
  ): Promise<ServiceResult<TrainingSummary[]>> {
    return mapResult(
      await this.api.get<TrainingSummaryRow[]>(
        `/api/v1/trainings/?organization_id=${encodeURIComponent(orgId)}`,
      ),
      (rows) => rows.map(toTrainingSummary),
    );
  }

  async getTrainingSummariesByProject(
    projectId: string,
  ): Promise<ServiceResult<TrainingSummary[]>> {
    return mapResult(
      await this.api.get<TrainingSummaryRow[]>(
        `/api/v1/trainings/?project_id=${encodeURIComponent(projectId)}`,
      ),
      (rows) => rows.map(toTrainingSummary),
    );
  }

  async getTrainingOverview(trainingId: string): Promise<ServiceResult<TrainingOverview>> {
    return mapResult(
      await this.api.get<TrainingOverviewRow>(`/api/v1/trainings/${trainingId}/overview`),
      toOverview,
    );
  }

  async createTrainingFromProject(
    projectId: string,
    payload: CreateTrainingFromProjectPayload,
  ): Promise<ServiceResult<Training>> {
    const body = {
      title: payload.title,
      description: payload.description ?? null,
      due_date: payload.dueDate ?? null,
      asset_types: payload.assetTypes,
      assignee_ids: payload.assigneeIds,
      publish: payload.publish ?? true,
    };
    return mapResult(
      await this.api.post<TrainingRow>(`/api/v1/projects/${projectId}/trainings`, body),
      toTraining,
    );
  }

  async updateProgress(
    assignmentId: string,
    moduleId: string,
    payload: UpdateProgressPayload,
  ): Promise<ServiceResult<ModuleProgress>> {
    const body = {
      status: payload.status,
      progress_pct: payload.progressPct,
      last_position_seconds: payload.lastPositionSeconds,
      score: payload.score,
      max_score: payload.maxScore,
    };
    return mapResult(
      await this.api.put<ProgressRow>(
        `/api/v1/assignments/${assignmentId}/modules/${moduleId}/progress`,
        body,
      ),
      toProgress,
    );
  }
}
