import { computed, inject, Injectable } from '@angular/core';
import {
  formatModuleCountLabel,
  formatUpdatedAtLabel,
  isViewerAssignedToTraining,
  resolveViewerTrainingProgress,
  trainingStatusToAccent,
  trainingStatusToHint,
  trainingStatusToLabel,
} from '../domain/training-presentation';
import type { TrainingSummary } from '../domain/training.types';
import type { TrainingPlayerViewModel } from '../video-player/video-player.models';
import { TrainingFacade } from './training.facade';

@Injectable({ providedIn: 'root' })
export class TrainingPlayerFacade {
  private readonly trainingFacade = inject(TrainingFacade);

  readonly isLoading = this.trainingFacade.organizationTrainingsLoading;
  readonly errorMessage = computed(
    () => this.trainingFacade.organizationTrainingsError()?.message ?? null,
  );
  readonly trainingLibrary = computed(() =>
    [...this.trainingFacade.organizationTrainings()]
      .filter(isViewerAssignedToTraining)
      .sort(compareTrainingsForLibrary)
      .map((training) => toTrainingPlayerViewModel(training)),
  );
}

function toTrainingPlayerViewModel(training: TrainingSummary): TrainingPlayerViewModel {
  const progress = resolveViewerTrainingProgress(training);

  return {
    id: training.id,
    projectId: training.projectId,
    title: training.title,
    description: training.description?.trim() || 'No description provided yet.',
    badgeLabel: trainingStatusToLabel(training.status),
    detailLabel: formatModuleCountLabel(training.moduleCount),
    progress,
    progressLabel: progress <= 0 ? 'Not started' : `${progress}% complete`,
    progressHint: trainingStatusToHint(training.status, training.viewerAssignmentStatus),
    accent: trainingStatusToAccent(training.status),
    imageUrl: training.coverImageUrl,
    imageAlt: training.coverImageUrl
      ? `${training.title} generated training cover`
      : `Generated cover image is not available for ${training.title}`,
    coverImageStatus: training.coverImageStatus,
    updatedAtLabel: formatUpdatedAtLabel(training.updatedAt),
    updatedAt: training.updatedAt,
    resources: [],
  };
}

function compareTrainingsForLibrary(left: TrainingSummary, right: TrainingSummary): number {
  const priorityDelta = trainingStatusPriority(left.status) - trainingStatusPriority(right.status);
  if (priorityDelta !== 0) {
    return priorityDelta;
  }
  return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
}

function trainingStatusPriority(status: TrainingSummary['status']): number {
  switch (status) {
    case 'published':
      return 0;
    case 'draft':
      return 1;
    case 'archived':
      return 2;
  }
}
