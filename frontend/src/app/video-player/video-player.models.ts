import type { TrainingAccentTone } from '../domain/training-presentation';
import type { TrainingCoverImageStatus } from '../domain/training.types';

export interface TrainingPlayerResourceViewModel {
  readonly id: string;
  readonly label: string;
  readonly href: string;
}

export interface TrainingPlayerViewModel {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly description: string;
  readonly badgeLabel: string;
  readonly detailLabel: string;
  readonly progress: number;
  readonly progressLabel: string;
  readonly progressHint: string;
  readonly accent: TrainingAccentTone;
  readonly imageUrl: string | null;
  readonly imageAlt: string;
  readonly coverImageStatus: TrainingCoverImageStatus;
  readonly updatedAtLabel: string;
  readonly updatedAt: string;
  readonly resources: readonly TrainingPlayerResourceViewModel[];
}

export interface TrainingPlayerEmptyStateViewModel {
  readonly title: string;
  readonly description: string;
}

export const TRAINING_LIBRARY_EMPTY_STATE: TrainingPlayerEmptyStateViewModel = {
  title: 'No assigned trainings yet',
  description: 'Trainings assigned to you will appear here once your manager adds them.',
};

export const TRAINING_RESOURCES_EMPTY_STATE: TrainingPlayerEmptyStateViewModel = {
  title: 'No modules yet',
  description:
    'Training modules such as videos, documents, and quizzes will appear here once added.',
};
