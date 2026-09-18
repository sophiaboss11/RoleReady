export interface Infographic {
  readonly id: string;
  readonly projectId: string;
  readonly imageUrl: string | null;
  readonly isProcessed: boolean;
  readonly infographicText: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}
