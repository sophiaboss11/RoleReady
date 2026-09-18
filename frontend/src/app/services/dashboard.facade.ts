import { computed, effect, inject, Injectable, signal } from '@angular/core';
import {
  toTrainingCardViewModel,
  type TrainingCardViewModel,
} from '../domain/training-presentation';
import type { ManagerDashboardAnalytics } from '../domain/dashboard-analytics.types';
import type {
  DashboardAttentionLearnerViewModel,
  DashboardSummaryCardViewModel,
} from '../dashboard/dashboard.models';
import { OrganizationFacade } from './organization.facade';
import { DashboardAnalyticsService } from './dashboard-analytics.service';
import { TrainingFacade } from './training.facade';

const DASHBOARD_ANALYTICS_FRESHNESS_WINDOW_MS = 30_000;

@Injectable({ providedIn: 'root' })
export class DashboardFacade {
  private readonly orgFacade = inject(OrganizationFacade);
  private readonly dashboardAnalyticsService = inject(DashboardAnalyticsService);
  private readonly trainingFacade = inject(TrainingFacade);
  private readonly analyticsByOrgId = signal<Record<string, ManagerDashboardAnalytics | undefined>>(
    {},
  );
  private readonly analyticsLoading = signal(false);
  private readonly analyticsError = signal<string | null>(null);
  private readonly analyticsLastLoadedAtByOrgId = new Map<string, number>();
  private readonly inFlightAnalyticsQueries = new Map<string, Promise<void>>();

  readonly trainings = this.trainingFacade.organizationTrainings;
  readonly managerAnalytics = computed<ManagerDashboardAnalytics | null>(() => {
    const orgId = this.orgFacade.activeOrgId();
    if (!orgId) return null;
    return this.analyticsByOrgId()[orgId] ?? null;
  });
  readonly isLoading = computed(
    () =>
      this.trainingFacade.organizationTrainingsLoading() ||
      (this.orgFacade.isAdmin() &&
        (this.analyticsLoading() || !this.managerAnalytics()) &&
        !this.analyticsError()),
  );
  readonly errorMessage = computed(
    () =>
      this.trainingFacade.organizationTrainingsError()?.message ??
      this.analyticsError() ??
      this.orgFacade.errorMessage(),
  );
  readonly managerSummaryCards = computed(() => buildManagerSummaryCards(this.managerAnalytics()));
  readonly managerTrainings = computed<readonly TrainingCardViewModel[]>(() =>
    this.trainings().map((training) => toTrainingCardViewModel(training, 'admin')),
  );
  readonly internInProgressTrainings = computed<readonly TrainingCardViewModel[]>(() =>
    this.trainings()
      .filter(
        (training) => training.viewerAssignmentStatus !== null && training.status !== 'archived',
      )
      .map((training) => toTrainingCardViewModel(training, 'member')),
  );
  readonly internCompletedTrainings = computed<readonly TrainingCardViewModel[]>(() =>
    this.trainings()
      .filter(
        (training) =>
          training.viewerAssignmentStatus === 'completed' || training.status === 'archived',
      )
      .map((training) => toTrainingCardViewModel(training, 'member')),
  );
  readonly overallProgress = computed(() => {
    const summaries = this.trainings();
    if (summaries.length === 0) return 0;

    if (this.orgFacade.isAdmin()) {
      return averagePercent(summaries.map((summary) => summary.averageProgressPct));
    }

    const assignedTrainings = summaries.filter((summary) => summary.viewerProgressPct !== null);
    if (assignedTrainings.length === 0) return 0;
    return averagePercent(assignedTrainings.map((summary) => summary.viewerProgressPct ?? 0));
  });

  constructor() {
    effect(() => {
      if (!this.orgFacade.isAdmin() || !this.orgFacade.activeOrgId()) {
        this.analyticsError.set(null);
        return;
      }

      void this.ensureManagerAnalytics(this.orgFacade.activeOrgId());
    });
  }

  private async ensureManagerAnalytics(orgId: string | null, force = false): Promise<void> {
    if (!orgId) return;
    if (!force && !this.isAnalyticsStale(orgId)) {
      return;
    }

    const existingQuery = this.inFlightAnalyticsQueries.get(orgId);
    if (existingQuery) {
      await existingQuery;
      return;
    }

    this.analyticsLoading.set(true);
    this.analyticsError.set(null);

    const query = (async () => {
      const result = await this.dashboardAnalyticsService.getManagerDashboard(orgId);
      if (result.errorMessage || !result.data) {
        this.analyticsError.set(result.errorMessage ?? 'Failed to load dashboard analytics');
        return;
      }

      this.analyticsByOrgId.update((record) => ({
        ...record,
        [orgId]: result.data ?? undefined,
      }));
      this.analyticsLastLoadedAtByOrgId.set(orgId, Date.now());
    })();

    this.inFlightAnalyticsQueries.set(orgId, query);

    try {
      await query;
    } finally {
      this.inFlightAnalyticsQueries.delete(orgId);
      this.analyticsLoading.set(false);
    }
  }

  private isAnalyticsStale(orgId: string): boolean {
    const lastLoadedAt = this.analyticsLastLoadedAtByOrgId.get(orgId);
    if (lastLoadedAt === undefined) return true;
    return Date.now() - lastLoadedAt > DASHBOARD_ANALYTICS_FRESHNESS_WINDOW_MS;
  }
}

function buildManagerSummaryCards(
  analytics: ManagerDashboardAnalytics | null,
): readonly DashboardSummaryCardViewModel[] {
  const resolvedAnalytics = analytics ?? EMPTY_MANAGER_ANALYTICS;

  return [
    {
      id: 'average-progress',
      title: 'Training progress',
      metric: `${resolvedAnalytics.averageProgressPct}%`,
      metricLabel: 'Average training progress',
      progressLabel: `${resolvedAnalytics.averageProgressPct}% average module completion`,
      progress: resolvedAnalytics.averageProgressPct,
      accent: 'ocean',
      supportingStats: [
        {
          label: 'Completed',
          value: formatNumber(resolvedAnalytics.completedAssignments),
          segmentId: 'completed',
        },
        {
          label: 'In progress',
          value: formatNumber(resolvedAnalytics.inProgressAssignments),
          segmentId: 'in-progress',
        },
        {
          label: 'Not started',
          value: formatNumber(resolvedAnalytics.notStartedAssignments),
          segmentId: 'not-started',
        },
        { label: 'Total assigned', value: formatNumber(resolvedAnalytics.totalAssignments) },
      ],
      segments: buildAssignmentStatusSegments(resolvedAnalytics),
      secondaryMetric: {
        title: 'Weekly active assigned learners',
        metric: formatNumber(resolvedAnalytics.activeLearners7d),
        metricLabel: 'Active assigned learners',
        progressLabel: `${resolvedAnalytics.engagementRate7dPct}% of assigned learners active`,
        progress: resolvedAnalytics.engagementRate7dPct,
        accent: 'indigo',
        supportingStats: [
          { label: 'Assigned', value: formatNumber(resolvedAnalytics.assignedLearners) },
          { label: 'Engagement', value: `${resolvedAnalytics.engagementRate7dPct}%` },
          { label: 'Sessions', value: formatNumber(resolvedAnalytics.sessionsStarted7d) },
          { label: 'Abandoned', value: formatNumber(resolvedAnalytics.abandonedSessions7d) },
        ],
      },
    },
    {
      id: 'needs-attention',
      title: 'Learners needing attention',
      metric: formatNumber(resolvedAnalytics.needsAttentionLearners),
      metricLabel: 'Assigned learners to follow up',
      progressLabel: `${resolvedAnalytics.needsAttentionLearners} assigned learners need follow-up`,
      progress: percentage(
        resolvedAnalytics.needsAttentionLearners,
        resolvedAnalytics.assignedLearners,
      ),
      accent: 'sky',
      supportingStats: [
        { label: 'Overdue', value: formatNumber(resolvedAnalytics.overdueAssignments) },
        { label: 'Not started', value: formatNumber(resolvedAnalytics.notStartedAssignments) },
        { label: 'Due in 7d', value: formatNumber(resolvedAnalytics.dueSoonAssignments) },
        { label: 'Assigned learners', value: formatNumber(resolvedAnalytics.assignedLearners) },
      ],
      attentionLearners: buildAttentionLearnerViewModels(resolvedAnalytics),
    },
  ];
}

function averagePercent(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

const EMPTY_MANAGER_ANALYTICS: ManagerDashboardAnalytics = {
  activeLearners7d: 0,
  totalAssignments: 0,
  assignedLearners: 0,
  averageProgressPct: 0,
  completedAssignments: 0,
  inProgressAssignments: 0,
  notStartedAssignments: 0,
  overdueAssignments: 0,
  dueSoonAssignments: 0,
  needsAttentionLearners: 0,
  engagementRate7dPct: 0,
  sessionsStarted7d: 0,
  abandonedSessions7d: 0,
  attentionLearners: [],
};

function buildAssignmentStatusSegments(
  analytics: ManagerDashboardAnalytics,
): DashboardSummaryCardViewModel['segments'] {
  return [
    {
      id: 'completed',
      label: 'Completed',
      value: analytics.completedAssignments,
      percent: percentage(analytics.completedAssignments, analytics.totalAssignments),
    },
    {
      id: 'in-progress',
      label: 'In progress',
      value: analytics.inProgressAssignments,
      percent: percentage(analytics.inProgressAssignments, analytics.totalAssignments),
    },
    {
      id: 'not-started',
      label: 'Not started',
      value: analytics.notStartedAssignments,
      percent: percentage(analytics.notStartedAssignments, analytics.totalAssignments),
    },
  ];
}

function buildAttentionLearnerViewModels(
  analytics: ManagerDashboardAnalytics,
): readonly DashboardAttentionLearnerViewModel[] {
  return analytics.attentionLearners.slice(0, 4).map((learner) => {
    const displayName = learner.displayName?.trim() || 'Unnamed learner';

    return {
      id: learner.userId,
      displayName,
      avatarUrl: learner.avatarUrl,
      issueLabel: getAttentionIssueLabel(learner),
    };
  });
}

function getAttentionIssueLabel(
  learner: ManagerDashboardAnalytics['attentionLearners'][number],
): string {
  if (learner.overdueAssignments > 0) {
    return `${formatNumber(learner.overdueAssignments)} overdue`;
  }
  return `${formatNumber(learner.notStartedAssignments)} not started`;
}

function percentage(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.min(100, Math.round((numerator / denominator) * 100));
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}
