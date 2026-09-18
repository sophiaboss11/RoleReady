// ---------------------------------------------------------------------------
// Gamification domain types
//
// XP, levels, streaks, daily goals, and learner profiles.
// ---------------------------------------------------------------------------

export type XpReason =
  | 'lesson_complete'
  | 'step_complete'
  | 'quiz_perfect'
  | 'quiz_pass'
  | 'streak_bonus'
  | 'daily_goal'
  | 'challenge_complete'
  | 'first_lesson'
  | 'training_complete'
  | 'review_complete'
  | 'admin_grant'
  | 'anti_abuse_correction';

const XP_REASONS: ReadonlySet<string> = new Set<XpReason>([
  'lesson_complete',
  'step_complete',
  'quiz_perfect',
  'quiz_pass',
  'streak_bonus',
  'daily_goal',
  'challenge_complete',
  'first_lesson',
  'training_complete',
  'review_complete',
  'admin_grant',
  'anti_abuse_correction',
]);

export function isXpReason(value: unknown): value is XpReason {
  return typeof value === 'string' && XP_REASONS.has(value);
}

export interface GamificationProfile {
  readonly userId: string;
  readonly totalXp: number;
  readonly level: number;
  readonly xpToNextLevel: number;
  readonly currentStreakDays: number;
  readonly longestStreakDays: number;
  readonly totalWatchSeconds: number;
  readonly totalListenSeconds: number;
  readonly totalLessonsCompleted: number;
  readonly totalStepsCompleted: number;
  readonly quizAccuracyPct: number;
  readonly updatedAt: string | null;
}

export interface XpLedgerEntry {
  readonly id: string;
  readonly userId: string;
  readonly amount: number;
  readonly reason: XpReason;
  readonly sourceType: string;
  readonly sourceId: string | null;
  readonly trainingId: string | null;
  readonly createdAt: string;
}

export interface DailyActivity {
  readonly id: string;
  readonly userId: string;
  readonly activityDate: string;
  readonly xpEarned: number;
  readonly lessonsCompleted: number;
  readonly stepsCompleted: number;
  readonly watchSeconds: number;
  readonly listenSeconds: number;
  readonly quizAttempts: number;
}

export interface DailyGoalStatus {
  readonly targetXp: number;
  readonly earnedXp: number;
  readonly completed: boolean;
  readonly streakDays: number;
}

export const XP_REASON_LABELS: Record<XpReason, string> = {
  lesson_complete: 'Lesson Complete',
  step_complete: 'Step Complete',
  quiz_perfect: 'Perfect Quiz',
  quiz_pass: 'Quiz Passed',
  streak_bonus: 'Streak Bonus',
  daily_goal: 'Daily Goal',
  challenge_complete: 'Challenge Complete',
  first_lesson: 'First Lesson',
  training_complete: 'Training Complete',
  review_complete: 'Review Complete',
  admin_grant: 'Admin Grant',
  anti_abuse_correction: 'Correction',
};

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}
