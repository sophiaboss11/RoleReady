export interface Profile {
  readonly id: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface UpdateProfilePayload {
  readonly displayName: string;
  readonly avatarUrl: string | null;
}
