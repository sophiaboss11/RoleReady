// ---------------------------------------------------------------------------
// Learner progress domain types
//
// Snapshot-based progress at training / lesson / step granularity.
// ---------------------------------------------------------------------------

export type LearnerTrainingStatus = 'not_started' | 'in_progress' | 'completed';
export type LearnerLessonStatus = 'locked' | 'available' | 'in_progress' | 'completed' | 'mastered';
export type LearnerStepStatus = 'not_started' | 'in_progress' | 'completed';

export interface LearnerTrainingProgress {
  readonly userId: string;
  readonly trainingId: string;
  readonly status: LearnerTrainingStatus;
  readonly progressPct: number;
  readonly completedLessons: number;
  readonly totalLessons: number;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly lastActiveAt: string | null;
  readonly updatedAt: string | null;
}

export interface LearnerLessonProgress {
  readonly userId: string;
  readonly lessonId: string;
  readonly trainingId: string;
  readonly status: LearnerLessonStatus;
  readonly progressPct: number;
  readonly completedSteps: number;
  readonly totalSteps: number;
  readonly bestScore: number | null;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly updatedAt: string | null;
}

export interface LearnerStepProgress {
  readonly userId: string;
  readonly stepId: string;
  readonly lessonId: string;
  readonly status: LearnerStepStatus;
  readonly progressPct: number;
  readonly bestScore: number | null;
  readonly bestMaxScore: number | null;
  readonly attempts: number;
  readonly watchSeconds: number;
  readonly listenSeconds: number;
  readonly lastPositionSeconds: number | null;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly updatedAt: string | null;
}

export interface LearnerPathOverview {
  readonly trainingProgress: LearnerTrainingProgress;
  readonly lessonProgress: readonly LearnerLessonProgress[];
}

export const LESSON_STATUS_LABELS: Record<LearnerLessonStatus, string> = {
  locked: 'Locked',
  available: 'Available',
  in_progress: 'In Progress',
  completed: 'Completed',
  mastered: 'Mastered',
};
