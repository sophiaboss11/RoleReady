// ---------------------------------------------------------------------------
// Curriculum domain types
//
// Represents the hierarchical learning structure:
//   Training -> Lesson -> Step
// ---------------------------------------------------------------------------

export type LessonUnlockRule = 'sequential' | 'manual' | 'always_open';

const LESSON_UNLOCK_RULES: ReadonlySet<string> = new Set<LessonUnlockRule>([
  'sequential',
  'manual',
  'always_open',
]);

export function isLessonUnlockRule(value: unknown): value is LessonUnlockRule {
  return typeof value === 'string' && LESSON_UNLOCK_RULES.has(value);
}

export type StepType =
  | 'video'
  | 'audio'
  | 'document'
  | 'quiz'
  | 'infographic'
  | 'mindmap'
  | 'summary'
  | 'exercise';

const STEP_TYPES: ReadonlySet<string> = new Set<StepType>([
  'video',
  'audio',
  'document',
  'quiz',
  'infographic',
  'mindmap',
  'summary',
  'exercise',
]);

export function isStepType(value: unknown): value is StepType {
  return typeof value === 'string' && STEP_TYPES.has(value);
}

export interface TrainingLesson {
  readonly id: string;
  readonly trainingId: string;
  readonly title: string;
  readonly description: string | null;
  readonly sortOrder: number;
  readonly isRequired: boolean;
  readonly unlockRule: LessonUnlockRule;
  readonly estimatedDurationMinutes: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface LessonStep {
  readonly id: string;
  readonly lessonId: string;
  readonly title: string;
  readonly description: string | null;
  readonly stepType: StepType;
  readonly sortOrder: number;
  readonly contentUrl: string | null;
  readonly contentBody: string | null;
  readonly isRequired: boolean;
  readonly isScorable: boolean;
  readonly maxScore: number | null;
  readonly passThreshold: number | null;
  readonly estimatedDurationMinutes: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface LessonWithSteps extends TrainingLesson {
  readonly steps: readonly LessonStep[];
  readonly prerequisites: readonly string[];
}

export interface CurriculumOverview {
  readonly trainingId: string;
  readonly lessons: readonly LessonWithSteps[];
}
