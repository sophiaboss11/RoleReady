export type LeaderboardPeriod = 'weekly' | 'monthly' | 'all_time';

const LEADERBOARD_PERIODS: ReadonlySet<string> = new Set<LeaderboardPeriod>([
  'weekly',
  'monthly',
  'all_time',
]);

export function isLeaderboardPeriod(value: unknown): value is LeaderboardPeriod {
  return typeof value === 'string' && LEADERBOARD_PERIODS.has(value);
}

export interface LeaderboardEntry {
  readonly rank: number;
  readonly userId: string;
  readonly xpEarned: number;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
}

export interface Leaderboard {
  readonly organizationId: string;
  readonly periodType: LeaderboardPeriod;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly entries: readonly LeaderboardEntry[];
}

export const LEADERBOARD_PERIOD_LABELS: Record<LeaderboardPeriod, string> = {
  weekly: 'This Week',
  monthly: 'This Month',
  all_time: 'All Time',
};
