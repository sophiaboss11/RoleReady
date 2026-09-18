import type {
  AssignmentStatus,
  TrainingCoverImageStatus,
  TrainingStatus,
  TrainingSummary,
} from './training.types';

export type TrainingAccentTone = 'ocean' | 'sky' | 'indigo' | 'cyan';
export type TrainingSortOption = 'recent' | 'progress-desc' | 'progress-asc';

export interface TrainingCardViewModel {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly description: string | null;
  readonly badgeLabel: string;
  readonly detailLabel: string;
  readonly moduleCountLabel: string;
  readonly progress: number;
  readonly accent: TrainingAccentTone;
  readonly imageUrl: string | null;
  readonly imageAlt: string;
  readonly coverImageStatus: TrainingCoverImageStatus;
  readonly updatedAt: string;
}

export interface TrainingEmptyStateViewModel {
  readonly title: string;
  readonly description: string;
}

export interface TrainingSortOptionViewModel {
  readonly value: TrainingSortOption;
  readonly label: string;
}

export const TRAINING_SORT_OPTIONS: readonly TrainingSortOptionViewModel[] = [
  { value: 'recent', label: 'Recently Updated' },
  { value: 'progress-desc', label: 'Progress (descending)' },
  { value: 'progress-asc', label: 'Progress (ascending)' },
] as const;

export function isTrainingSortOption(value: string): value is TrainingSortOption {
  return TRAINING_SORT_OPTIONS.some((option) => option.value === value);
}

export const TRAINING_MANAGER_EMPTY_STATE: TrainingEmptyStateViewModel = {
  title: 'No trainings yet',
  description: 'Create a training from a project to build a curriculum with modules for your team.',
};

export const TRAINING_PUBLISHED_EMPTY_STATE: TrainingEmptyStateViewModel = {
  title: 'No published trainings yet',
  description: 'Published trainings available to you will appear here.',
};

export const TRAINING_ASSIGNED_EMPTY_STATE: TrainingEmptyStateViewModel = {
  title: 'No assigned trainings yet',
  description: 'Trainings assigned to you will appear here once your manager adds them.',
};

export const TRAINING_ARCHIVED_EMPTY_STATE: TrainingEmptyStateViewModel = {
  title: 'No archived trainings yet',
  description: 'Archived trainings will appear here after completion or retirement.',
};

export function trainingStatusToLabel(status: TrainingStatus): string {
  switch (status) {
    case 'draft':
      return 'Draft';
    case 'published':
      return 'Published';
    case 'archived':
      return 'Archived';
  }
}

export function trainingStatusToAccent(status: TrainingStatus): TrainingAccentTone {
  switch (status) {
    case 'published':
      return 'ocean';
    case 'draft':
      return 'sky';
    case 'archived':
      return 'indigo';
  }
}

export function formatModuleCountLabel(moduleCount: number): string {
  if (moduleCount <= 0) return 'No modules';
  return moduleCount === 1 ? '1 module' : `${moduleCount} modules`;
}

export function formatProgressLabel(progressPct: number): string {
  if (progressPct <= 0) return 'Not started';
  if (progressPct >= 100) return 'Completed';
  return `${progressPct}% complete`;
}

export function formatUpdatedAtLabel(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return 'Updated recently';
  }

  return `Updated ${new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(timestamp)}`;
}

export function trainingStatusToHint(
  status: TrainingStatus,
  assignmentStatus: AssignmentStatus | null,
): string {
  if (assignmentStatus === 'completed') {
    return 'You have completed this training.';
  }
  if (assignmentStatus === 'in_progress') {
    return 'Resume where you left off.';
  }
  if (assignmentStatus === 'assigned') {
    return 'You have been assigned this training.';
  }

  switch (status) {
    case 'published':
      return 'This training is published and available for users to complete.';
    case 'draft':
      return 'This training is still in draft. Publish it to make it available.';
    case 'archived':
      return 'This training has been archived and is no longer active.';
  }
}

export function toTrainingCardViewModel(
  summary: TrainingSummary,
  viewerMode: 'admin' | 'member',
): TrainingCardViewModel {
  const moduleCountLabel = formatModuleCountLabel(summary.moduleCount);

  return {
    id: summary.id,
    projectId: summary.projectId,
    title: summary.title,
    description: summary.description,
    badgeLabel: trainingStatusToLabel(summary.status),
    detailLabel:
      viewerMode === 'admin'
        ? moduleCountLabel
        : memberDetailLabel(summary.moduleCount, summary.viewerAssignmentStatus),
    moduleCountLabel,
    progress: resolveViewerTrainingProgress(summary),
    accent: trainingStatusToAccent(summary.status),
    imageUrl: summary.coverImageUrl,
    imageAlt: summary.coverImageUrl
      ? `${summary.title} generated training cover`
      : `Generated cover image is not available for ${summary.title}`,
    coverImageStatus: summary.coverImageStatus,
    updatedAt: summary.updatedAt,
  };
}

export function compareTrainingCards(
  left: TrainingCardViewModel,
  right: TrainingCardViewModel,
  sortOption: TrainingSortOption,
): number {
  switch (sortOption) {
    case 'progress-desc':
      return right.progress - left.progress;
    case 'progress-asc':
      return left.progress - right.progress;
    default:
      return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  }
}

export function matchesTrainingCardQuery(training: TrainingCardViewModel, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length === 0) return true;

  return [
    training.title,
    training.badgeLabel,
    training.detailLabel,
    training.description ?? '',
  ].some((value) => value.toLowerCase().includes(normalizedQuery));
}

export function resolveTrainingProgress(
  summary: Pick<TrainingSummary, 'viewerProgressPct'>,
): number {
  // Card and player surfaces must reflect the authenticated viewer's own progress.
  // Aggregate org progress belongs in analytics-specific UI instead.
  return summary.viewerProgressPct ?? 0;
}

export const resolveViewerTrainingProgress = resolveTrainingProgress;

export function isViewerAssignedToTraining(
  summary: Pick<TrainingSummary, 'viewerAssignmentId'>,
): boolean {
  return summary.viewerAssignmentId !== null;
}

function memberDetailLabel(moduleCount: number, assignmentStatus: AssignmentStatus | null): string {
  const moduleLabel = formatModuleCountLabel(moduleCount);
  if (!assignmentStatus) {
    return moduleLabel;
  }

  switch (assignmentStatus) {
    case 'completed':
      return `${moduleLabel} · Completed`;
    case 'in_progress':
      return `${moduleLabel} · In progress`;
    case 'assigned':
      return `${moduleLabel} · Assigned`;
  }
}
