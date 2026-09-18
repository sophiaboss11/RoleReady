export interface Audio {
  readonly id: string;
  readonly projectId: string;
  readonly audioUrl: string | null;
  readonly voice: string;
  readonly model: string;
  readonly format: string;
  readonly script: string | null;
  readonly isProcessed: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}
