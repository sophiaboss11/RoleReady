import { computed, inject, Injectable, signal } from '@angular/core';
import { ApiClient } from './api.client';
import type { ServiceResult } from '../domain/service-result';
import { isXpReason } from '../domain/gamification.types';
import type {
  DailyActivity,
  DailyGoalStatus,
  GamificationProfile,
  XpLedgerEntry,
} from '../domain/gamification.types';

interface ProfileRow {
  user_id: string;
  total_xp: number;
  level: number;
  xp_to_next_level: number;
  current_streak_days: number;
  longest_streak_days: number;
  total_watch_seconds: number;
  total_listen_seconds: number;
  total_lessons_completed: number;
  total_steps_completed: number;
  quiz_accuracy_pct: number;
  updated_at: string | null;
}

interface XpEntryRow {
  id: string;
  user_id: string;
  amount: number;
  reason: string;
  source_type: string;
  source_id: string | null;
  training_id: string | null;
  created_at: string;
}

interface DailyActivityRow {
  id: string;
  user_id: string;
  activity_date: string;
  xp_earned: number;
  lessons_completed: number;
  steps_completed: number;
  watch_seconds: number;
  listen_seconds: number;
  quiz_attempts: number;
}

interface DailyGoalRow {
  target_xp: number;
  earned_xp: number;
  completed: boolean;
  streak_days: number;
}

function toProfile(row: ProfileRow): GamificationProfile {
  return {
    userId: row.user_id,
    totalXp: row.total_xp,
    level: row.level,
    xpToNextLevel: row.xp_to_next_level,
    currentStreakDays: row.current_streak_days,
    longestStreakDays: row.longest_streak_days,
    totalWatchSeconds: row.total_watch_seconds,
    totalListenSeconds: row.total_listen_seconds,
    totalLessonsCompleted: row.total_lessons_completed,
    totalStepsCompleted: row.total_steps_completed,
    quizAccuracyPct: row.quiz_accuracy_pct,
    updatedAt: row.updated_at,
  };
}

function toXpEntry(row: XpEntryRow): XpLedgerEntry {
  const reason = isXpReason(row.reason) ? row.reason : 'admin_grant';
  return {
    id: row.id,
    userId: row.user_id,
    amount: row.amount,
    reason,
    sourceType: row.source_type,
    sourceId: row.source_id,
    trainingId: row.training_id,
    createdAt: row.created_at,
  };
}

function toDailyActivity(row: DailyActivityRow): DailyActivity {
  return {
    id: row.id,
    userId: row.user_id,
    activityDate: row.activity_date,
    xpEarned: row.xp_earned,
    lessonsCompleted: row.lessons_completed,
    stepsCompleted: row.steps_completed,
    watchSeconds: row.watch_seconds,
    listenSeconds: row.listen_seconds,
    quizAttempts: row.quiz_attempts,
  };
}

function toDailyGoal(row: DailyGoalRow): DailyGoalStatus {
  return {
    targetXp: row.target_xp,
    earnedXp: row.earned_xp,
    completed: row.completed,
    streakDays: row.streak_days,
  };
}

@Injectable({ providedIn: 'root' })
export class GamificationFacade {
  private readonly api = inject(ApiClient);

  private readonly _profile = signal<GamificationProfile | null>(null);
  private readonly _dailyGoal = signal<DailyGoalStatus | null>(null);
  private readonly _xpHistory = signal<readonly XpLedgerEntry[]>([]);
  private readonly _isLoading = signal(false);

  readonly profile = this._profile.asReadonly();
  readonly dailyGoal = this._dailyGoal.asReadonly();
  readonly xpHistory = this._xpHistory.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();

  readonly level = computed(() => this._profile()?.level ?? 1);
  readonly totalXp = computed(() => this._profile()?.totalXp ?? 0);
  readonly streakDays = computed(() => this._profile()?.currentStreakDays ?? 0);

  async loadProfile(): Promise<void> {
    this._isLoading.set(true);
    const result = await this.api.get<ProfileRow>('/api/v1/gamification/profile');
    if (result.data) {
      this._profile.set(toProfile(result.data));
    }
    this._isLoading.set(false);
  }

  async loadDailyGoal(): Promise<void> {
    const result = await this.api.get<DailyGoalRow>('/api/v1/gamification/daily-goal');
    if (result.data) {
      this._dailyGoal.set(toDailyGoal(result.data));
    }
  }

  async loadXpHistory(limit = 50): Promise<void> {
    const result = await this.api.get<XpEntryRow[]>(
      `/api/v1/gamification/xp-history?limit=${limit}`,
    );
    if (result.data) {
      this._xpHistory.set(result.data.map(toXpEntry));
    }
  }

  async loadDailyActivity(
    fromDate: string,
    toDate: string,
  ): Promise<ServiceResult<DailyActivity[]>> {
    const result = await this.api.get<DailyActivityRow[]>(
      `/api/v1/gamification/daily-activity?from_date=${encodeURIComponent(fromDate)}&to_date=${encodeURIComponent(toDate)}`,
    );
    if (result.errorMessage) {
      return { data: null, errorMessage: result.errorMessage };
    }
    return { data: (result.data ?? []).map(toDailyActivity), errorMessage: null };
  }

  async recalculateStreak(): Promise<number> {
    const result = await this.api.post<{ streak_days: number }>(
      '/api/v1/gamification/streak/recalculate',
      {},
    );
    const streak = result.data?.streak_days ?? 0;
    const current = this._profile();
    if (current) {
      this._profile.set({
        ...current,
        currentStreakDays: streak,
        longestStreakDays: Math.max(current.longestStreakDays, streak),
      });
    }
    return streak;
  }
}
