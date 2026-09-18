export interface Video {
  readonly id: string;
  readonly projectId: string;
  readonly videoUrl: string | null;
  readonly prompt: string;
  readonly retrievedCount: number;
  readonly slideCount: number;
  readonly warning: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly isProcessed: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}
