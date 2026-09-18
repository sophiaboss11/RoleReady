export type ProjectStatus =
  | 'created'
  | 'ingesting'
  | 'ingestion_completed'
  | 'generating_assets'
  | 'completed'
  | 'failed';

const PROJECT_STATUSES: ReadonlySet<string> = new Set<ProjectStatus>([
  'created',
  'ingesting',
  'ingestion_completed',
  'generating_assets',
  'completed',
  'failed',
]);

export function isProjectStatus(value: unknown): value is ProjectStatus {
  return typeof value === 'string' && PROJECT_STATUSES.has(value);
}

export interface Project {
  readonly id: string;
  readonly projectName: string;
  readonly projectDescription: string | null;
  readonly githubLink: string | null;
  readonly jiraLink: string | null;
  readonly confluenceLink: string | null;
  readonly organizationId: string;
  readonly status: ProjectStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateProjectPayload {
  readonly projectName: string;
  readonly projectDescription: string;
  readonly organizationId: string;
  readonly githubLink?: string | null;
  readonly jiraLink?: string | null;
  readonly confluenceLink?: string | null;
  readonly repositoryToken?: string | null;
}

export type ProjectAssetType = 'summary' | 'infographic' | 'mindmap' | 'audio' | 'video';
export type ProjectAssetVisualPreviewType = 'image' | 'mermaid';

export interface ProjectAsset {
  readonly assetType: ProjectAssetType;
  readonly title: string;
  readonly available: boolean;
  readonly preview: string | null;
  readonly visualPreview: string | null;
  readonly visualPreviewType: ProjectAssetVisualPreviewType | null;
}

export interface UpdateProjectPayload {
  readonly projectName: string;
  readonly projectDescription: string;
  readonly githubLink: string | null;
  readonly jiraLink: string | null;
  readonly confluenceLink: string | null;
  readonly repositoryToken?: string | null;
}

export interface ProjectDocument {
  readonly id: string;
  readonly projectId: string;
  readonly filename: string;
  readonly contentType?: string;
  readonly size?: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}
