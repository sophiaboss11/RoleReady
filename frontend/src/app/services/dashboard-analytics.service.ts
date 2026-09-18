import { inject, Injectable } from '@angular/core';
import type {
  ManagerDashboardAnalytics,
  ManagerDashboardAttentionLearner,
} from '../domain/dashboard-analytics.types';
import type { ServiceResult } from '../domain/service-result';
import { ApiClient } from './api.client';

interface ManagerDashboardAttentionLearnerRow {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  overdue_assignments: number;
  not_started_assignments: number;
}

interface ManagerDashboardAnalyticsRow {
  active_learners_7d: number;
  total_assignments: number;
  completed_assignments: number;
  in_progress_assignments: number;
  assigned_learners: number;
  average_progress_pct: number;
  not_started_assignments: number;
  overdue_assignments: number;
  due_soon_assignments: number;
  needs_attention_learners: number;
  engagement_rate_7d_pct: number;
  sessions_started_7d: number;
  abandoned_sessions_7d: number;
  attention_learners: ManagerDashboardAttentionLearnerRow[];
}

function toAttentionLearner(
  row: ManagerDashboardAttentionLearnerRow,
): ManagerDashboardAttentionLearner {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    overdueAssignments: row.overdue_assignments,
    notStartedAssignments: row.not_started_assignments,
  };
}

function toAnalytics(row: ManagerDashboardAnalyticsRow): ManagerDashboardAnalytics {
  return {
    activeLearners7d: row.active_learners_7d,
    totalAssignments: row.total_assignments,
    completedAssignments: row.completed_assignments,
    inProgressAssignments: row.in_progress_assignments,
    assignedLearners: row.assigned_learners,
    averageProgressPct: row.average_progress_pct,
    notStartedAssignments: row.not_started_assignments,
    overdueAssignments: row.overdue_assignments,
    dueSoonAssignments: row.due_soon_assignments,
    needsAttentionLearners: row.needs_attention_learners,
    engagementRate7dPct: row.engagement_rate_7d_pct,
    sessionsStarted7d: row.sessions_started_7d,
    abandonedSessions7d: row.abandoned_sessions_7d,
    attentionLearners: row.attention_learners.map(toAttentionLearner),
  };
}

function mapResult<TRow, TDomain>(
  result: ServiceResult<TRow>,
  mapper: (row: TRow) => TDomain,
): ServiceResult<TDomain> {
  if (result.errorMessage) {
    return { data: null, errorMessage: result.errorMessage };
  }

  if (result.data === null) {
    return { data: null, errorMessage: 'Dashboard analytics API returned no data' };
  }

  return {
    data: mapper(result.data),
    errorMessage: null,
  };
}

@Injectable({ providedIn: 'root' })
export class DashboardAnalyticsService {
  private readonly api = inject(ApiClient);

  async getManagerDashboard(
    organizationId: string,
  ): Promise<ServiceResult<ManagerDashboardAnalytics>> {
    return mapResult(
      await this.api.get<ManagerDashboardAnalyticsRow>(
        `/api/v1/analytics/dashboard?organization_id=${encodeURIComponent(organizationId)}`,
      ),
      toAnalytics,
    );
  }
}
