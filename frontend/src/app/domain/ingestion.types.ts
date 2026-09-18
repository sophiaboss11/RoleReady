export type JobType =
  | 'github_ingestion'
  | 'document_ingestion'
  | 'infographic_generation'
  | 'mindmap_generation'
  | 'tts_generation'
  | 'video_generation'
  | 'training_cover_generation';
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';
export type GenerationStatus = 'idle' | JobStatus;

const JOB_TYPES: ReadonlySet<string> = new Set<JobType>([
  'github_ingestion',
  'document_ingestion',
  'infographic_generation',
  'mindmap_generation',
  'tts_generation',
  'video_generation',
  'training_cover_generation',
]);
const JOB_STATUSES: ReadonlySet<string> = new Set<JobStatus>([
  'pending',
  'running',
  'completed',
  'failed',
]);

export function isJobType(value: string): value is JobType {
  return JOB_TYPES.has(value);
}

export function isJobStatus(value: string): value is JobStatus {
  return JOB_STATUSES.has(value);
}

export interface Job {
  readonly id: string;
  readonly projectId: string;
  readonly userId: string;
  readonly jobType: JobType;
  readonly status: JobStatus;
  readonly errorMessage: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface StartIngestionResponse {
  readonly message: string;
  readonly projectId: string;
  readonly jobId: string;
}
