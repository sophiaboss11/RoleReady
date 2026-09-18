// ---------------------------------------------------------------------------
// Training domain types
//
// These types represent the real training system backed by dedicated DB tables,
// replacing the previous project-proxied placeholder types.
// ---------------------------------------------------------------------------

export type TrainingStatus = 'draft' | 'published' | 'archived';
export type TrainingCoverImageStatus = 'pending' | 'generating' | 'ready' | 'failed';

const TRAINING_STATUSES: ReadonlySet<string> = new Set<TrainingStatus>([
  'draft',
  'published',
  'archived',
]);

export function isTrainingStatus(value: unknown): value is TrainingStatus {
  return typeof value === 'string' && TRAINING_STATUSES.has(value);
}

const TRAINING_COVER_IMAGE_STATUSES: ReadonlySet<string> = new Set<TrainingCoverImageStatus>([
  'pending',
  'generating',
  'ready',
  'failed',
]);

export function isTrainingCoverImageStatus(value: unknown): value is TrainingCoverImageStatus {
  return typeof value === 'string' && TRAINING_COVER_IMAGE_STATUSES.has(value);
}

export interface Training {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly description: string | null;
  readonly status: TrainingStatus;
  readonly createdBy: string;
  readonly coverImageUrl: string | null;
  readonly coverImageStatus: TrainingCoverImageStatus;
  readonly coverImageError: string | null;
  readonly coverImageGeneratedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TrainingSummary extends Training {
  readonly moduleCount: number;
  readonly assignmentCount: number;
  readonly averageProgressPct: number;
  readonly viewerAssignmentId: string | null;
  readonly viewerAssignmentStatus: AssignmentStatus | null;
  readonly viewerProgressPct: number | null;
}

// ---------------------------------------------------------------------------
// Training Module
// ---------------------------------------------------------------------------

export type ModuleType =
  | 'video'
  | 'audio'
  | 'document'
  | 'quiz'
  | 'infographic'
  | 'mindmap'
  | 'summary';

const MODULE_TYPES: ReadonlySet<string> = new Set<ModuleType>([
  'video',
  'audio',
  'document',
  'quiz',
  'infographic',
  'mindmap',
  'summary',
]);

export function isModuleType(value: unknown): value is ModuleType {
  return typeof value === 'string' && MODULE_TYPES.has(value);
}

export type ProjectBackedTrainingAssetType = Extract<
  ModuleType,
  'audio' | 'video' | 'infographic' | 'mindmap' | 'summary'
>;

const PROJECT_BACKED_TRAINING_ASSET_TYPES: ReadonlySet<string> =
  new Set<ProjectBackedTrainingAssetType>(['audio', 'video', 'infographic', 'mindmap', 'summary']);

export function isProjectBackedTrainingAssetType(
  value: unknown,
): value is ProjectBackedTrainingAssetType {
  return typeof value === 'string' && PROJECT_BACKED_TRAINING_ASSET_TYPES.has(value);
}

export interface TrainingModule {
  readonly id: string;
  readonly trainingId: string;
  readonly title: string;
  readonly description: string | null;
  readonly moduleType: ModuleType;
  readonly sortOrder: number;
  readonly contentUrl: string | null;
  readonly contentBody: string | null;
  readonly isRequired: boolean;
  readonly estimatedDurationMinutes: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// ---------------------------------------------------------------------------
// Training Assignment
// ---------------------------------------------------------------------------

export type AssignmentStatus = 'assigned' | 'in_progress' | 'completed';

const ASSIGNMENT_STATUSES: ReadonlySet<string> = new Set<AssignmentStatus>([
  'assigned',
  'in_progress',
  'completed',
]);

export function isAssignmentStatus(value: unknown): value is AssignmentStatus {
  return typeof value === 'string' && ASSIGNMENT_STATUSES.has(value);
}

export interface TrainingAssignment {
  readonly id: string;
  readonly trainingId: string;
  readonly userId: string;
  readonly assignedBy: string;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
  readonly status: AssignmentStatus;
  readonly dueDate: string | null;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly progressPct: number;
}

// ---------------------------------------------------------------------------
// Module Progress
// ---------------------------------------------------------------------------

export type ModuleProgressStatus = 'not_started' | 'in_progress' | 'completed';

const MODULE_PROGRESS_STATUSES: ReadonlySet<string> = new Set<ModuleProgressStatus>([
  'not_started',
  'in_progress',
  'completed',
]);

export function isModuleProgressStatus(value: unknown): value is ModuleProgressStatus {
  return typeof value === 'string' && MODULE_PROGRESS_STATUSES.has(value);
}

export interface ModuleProgress {
  readonly id: string;
  readonly assignmentId: string;
  readonly moduleId: string;
  readonly status: ModuleProgressStatus;
  readonly progressPct: number;
  readonly lastPositionSeconds: number | null;
  readonly score: number | null;
  readonly maxScore: number | null;
  readonly attempts: number;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly updatedAt: string;
}

export interface TrainingLeaderboardEntry {
  readonly userId: string;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
  readonly progressPct: number;
  readonly status: AssignmentStatus;
}

export interface TrainingOverview {
  readonly training: Training;
  readonly modules: readonly TrainingModule[];
  readonly viewerAssignment: TrainingAssignment | null;
  readonly viewerProgress: readonly ModuleProgress[];
  readonly assignments: readonly TrainingAssignment[];
  readonly leaderboard: readonly TrainingLeaderboardEntry[];
}

export interface CreateTrainingFromProjectPayload {
  readonly title: string;
  readonly description?: string | null;
  readonly dueDate?: string | null;
  readonly assetTypes: readonly ProjectBackedTrainingAssetType[];
  readonly assigneeIds: readonly string[];
  readonly publish?: boolean;
}

export interface UpdateProgressPayload {
  readonly status?: ModuleProgressStatus;
  readonly progressPct?: number;
  readonly lastPositionSeconds?: number;
  readonly score?: number;
  readonly maxScore?: number;
}
