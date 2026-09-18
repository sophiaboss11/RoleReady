export interface ManagerDashboardAttentionLearner {
  readonly userId: string;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
  readonly overdueAssignments: number;
  readonly notStartedAssignments: number;
}

export interface ManagerDashboardAnalytics {
  readonly activeLearners7d: number;
  readonly totalAssignments: number;
  readonly completedAssignments: number;
  readonly inProgressAssignments: number;
  readonly assignedLearners: number;
  readonly averageProgressPct: number;
  readonly notStartedAssignments: number;
  readonly overdueAssignments: number;
  readonly dueSoonAssignments: number;
  readonly needsAttentionLearners: number;
  readonly engagementRate7dPct: number;
  readonly sessionsStarted7d: number;
  readonly abandonedSessions7d: number;
  readonly attentionLearners: readonly ManagerDashboardAttentionLearner[];
}
