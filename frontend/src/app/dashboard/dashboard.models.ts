export type DashboardAccentTone = 'ocean' | 'sky' | 'indigo';
export type DashboardBadgeVariant = 'default' | 'secondary' | 'outline' | 'destructive';
export type DashboardStatusSegmentId = 'completed' | 'in-progress' | 'not-started';

export interface DashboardSummaryStatViewModel {
  readonly label: string;
  readonly value: string;
  readonly segmentId?: DashboardStatusSegmentId;
}

export interface DashboardAttentionLearnerViewModel {
  readonly id: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly issueLabel: string;
}

export interface DashboardSecondaryMetricViewModel {
  readonly title: string;
  readonly metric: string;
  readonly metricLabel: string;
  readonly progressLabel: string;
  readonly progress: number;
  readonly accent: DashboardAccentTone;
  readonly supportingStats: readonly DashboardSummaryStatViewModel[];
}

export interface DashboardLearnerSnapshotViewModel {
  readonly id: string;
  readonly displayName: string;
  readonly email: string;
  readonly avatarUrl: string | null;
  readonly progress: number;
  readonly assignmentLabel: string;
  readonly focusLabel: string;
  readonly statusLabel: string;
  readonly statusVariant: DashboardBadgeVariant;
}

export interface DashboardStatusBarSegmentViewModel {
  readonly id: DashboardStatusSegmentId;
  readonly label: string;
  readonly value: number;
  readonly percent: number;
}

export interface DashboardSummaryCardViewModel {
  readonly id: string;
  readonly title: string;
  readonly metric: string;
  readonly metricLabel: string;
  readonly progressLabel: string;
  readonly progress: number;
  readonly accent: DashboardAccentTone;
  readonly supportingStats: readonly DashboardSummaryStatViewModel[];
  readonly learnerSnapshots?: readonly DashboardLearnerSnapshotViewModel[];
  readonly emptyStateDescription?: string;
  readonly segments?: readonly DashboardStatusBarSegmentViewModel[];
  readonly secondaryMetric?: DashboardSecondaryMetricViewModel;
  readonly attentionLearners?: readonly DashboardAttentionLearnerViewModel[];
}
