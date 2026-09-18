import { computed, inject, Injectable, signal } from '@angular/core';
import { ApiClient } from './api.client';
import { OrganizationFacade } from './organization.facade';
import {
  isLeaderboardPeriod,
  type Leaderboard,
  type LeaderboardEntry,
  type LeaderboardPeriod,
} from '../domain/social.types';

interface LeaderboardEntryRow {
  rank: number;
  user_id: string;
  xp_earned: number;
  display_name: string | null;
  avatar_url: string | null;
}

interface LeaderboardRow {
  organization_id: string;
  period_type: unknown;
  period_start: string;
  period_end: string;
  entries: LeaderboardEntryRow[];
}

interface QueryState {
  readonly isLoading: boolean;
  readonly errorMessage: string | null;
  readonly lastLoadedAt: number | null;
}

const FRESHNESS_WINDOW_MS = 30_000;
const EMPTY_QUERY_STATE: QueryState = {
  isLoading: false,
  errorMessage: null,
  lastLoadedAt: null,
};

function leaderboardQueryKey(orgId: string, period: LeaderboardPeriod): string {
  return `${orgId}:${period}`;
}

function toLeaderboardEntry(row: LeaderboardEntryRow): LeaderboardEntry {
  return {
    rank: row.rank,
    userId: row.user_id,
    xpEarned: row.xp_earned,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
  };
}

function toLeaderboard(row: LeaderboardRow): Leaderboard {
  if (!isLeaderboardPeriod(row.period_type)) {
    throw new Error(`Invalid leaderboard period: ${String(row.period_type)}`);
  }

  return {
    organizationId: row.organization_id,
    periodType: row.period_type,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    entries: row.entries.map(toLeaderboardEntry),
  };
}

@Injectable({ providedIn: 'root' })
export class SocialFacade {
  private readonly api = inject(ApiClient);
  private readonly orgFacade = inject(OrganizationFacade);

  private readonly leaderboardsByKey = signal<Record<string, Leaderboard | undefined>>({});
  private readonly queryStates = signal<Record<string, QueryState>>({});
  private readonly inFlightQueries = new Map<string, Promise<void>>();

  readonly activeOrgId = this.orgFacade.activeOrgId;

  leaderboard(period: LeaderboardPeriod): Leaderboard | null {
    const orgId = this.orgFacade.activeOrgId();
    if (!orgId) return null;
    return this.leaderboardsByKey()[leaderboardQueryKey(orgId, period)] ?? null;
  }

  leaderboardLoading(period: LeaderboardPeriod): boolean {
    const orgId = this.orgFacade.activeOrgId();
    if (!orgId) return false;
    return this.queryState(leaderboardQueryKey(orgId, period)).isLoading;
  }

  leaderboardError(period: LeaderboardPeriod): string | null {
    const orgId = this.orgFacade.activeOrgId();
    if (!orgId) return null;
    return this.queryState(leaderboardQueryKey(orgId, period)).errorMessage;
  }

  readonly hasActiveOrganization = computed(() => !!this.orgFacade.activeOrgId());

  async ensureLeaderboard(
    period: LeaderboardPeriod,
    options: { force?: boolean } = {},
  ): Promise<void> {
    const orgId = this.orgFacade.activeOrgId();
    if (!orgId) return;

    const key = leaderboardQueryKey(orgId, period);
    const queryState = this.queryState(key);
    const hasFreshData =
      !options.force &&
      queryState.lastLoadedAt !== null &&
      Date.now() - queryState.lastLoadedAt < FRESHNESS_WINDOW_MS &&
      this.leaderboardsByKey()[key] !== undefined;

    if (hasFreshData) return;

    const existing = this.inFlightQueries.get(key);
    if (existing) {
      await existing;
      return;
    }

    this.setQueryState(key, {
      ...queryState,
      isLoading: true,
      errorMessage: null,
    });

    const request = this.loadLeaderboard(orgId, period, key);
    this.inFlightQueries.set(key, request);
    try {
      await request;
    } finally {
      this.inFlightQueries.delete(key);
    }
  }

  private async loadLeaderboard(
    orgId: string,
    period: LeaderboardPeriod,
    key: string,
  ): Promise<void> {
    const result = await this.api.get<LeaderboardRow>(
      `/api/v1/social/leaderboard?organization_id=${encodeURIComponent(orgId)}&period_type=${encodeURIComponent(period)}`,
    );

    if (result.errorMessage || !result.data) {
      this.setQueryState(key, {
        isLoading: false,
        errorMessage: result.errorMessage ?? 'Failed to load leaderboard',
        lastLoadedAt: null,
      });
      return;
    }

    try {
      const leaderboard = toLeaderboard(result.data);
      this.leaderboardsByKey.update((record) => ({
        ...record,
        [key]: leaderboard,
      }));
      this.setQueryState(key, {
        isLoading: false,
        errorMessage: null,
        lastLoadedAt: Date.now(),
      });
    } catch (error) {
      this.setQueryState(key, {
        isLoading: false,
        errorMessage: error instanceof Error ? error.message : 'Invalid leaderboard response',
        lastLoadedAt: null,
      });
    }
  }

  private queryState(key: string): QueryState {
    return this.queryStates()[key] ?? EMPTY_QUERY_STATE;
  }

  private setQueryState(key: string, state: QueryState): void {
    this.queryStates.update((record) => ({
      ...record,
      [key]: state,
    }));
  }
}
