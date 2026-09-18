import { isPlatformBrowser } from '@angular/common';
import {
  computed,
  DestroyRef,
  effect,
  inject,
  Injectable,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type {
  CreateTrainingFromProjectPayload,
  Training,
  TrainingOverview,
  TrainingSummary,
} from '../domain/training.types';
import { infraError, validationError, type TrainingError } from '../domain/training.errors';
import { getSupabaseClientState } from '../lib/supabase.client';
import { OrganizationFacade } from './organization.facade';
import { TrainingService } from './training.service';

interface QueryState {
  readonly isLoading: boolean;
  readonly isRefreshing: boolean;
  readonly error: TrainingError | null;
  readonly lastLoadedAt: number | null;
}

const FRESHNESS_WINDOW_MS = 30_000;
const EMPTY_QUERY_STATE: QueryState = {
  isLoading: false,
  isRefreshing: false,
  error: null,
  lastLoadedAt: null,
};

function organizationQueryKey(orgId: string): string {
  return `org:${orgId}`;
}

function projectQueryKey(projectId: string): string {
  return `project:${projectId}`;
}

function overviewQueryKey(trainingId: string): string {
  return `overview:${trainingId}`;
}

@Injectable({ providedIn: 'root' })
export class TrainingFacade {
  private readonly destroyRef = inject(DestroyRef);
  private readonly orgFacade = inject(OrganizationFacade);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly trainingService = inject(TrainingService);

  private readonly organizationSummariesByOrgId = signal<
    Record<string, readonly TrainingSummary[]>
  >({});
  private readonly projectSummariesByProjectId = signal<Record<string, readonly TrainingSummary[]>>(
    {},
  );
  private readonly overviewsByTrainingId = signal<Record<string, TrainingOverview | undefined>>({});
  private readonly queryStates = signal<Record<string, QueryState>>({});
  private readonly inFlightQueries = new Map<string, Promise<void>>();
  private trainingRealtimeChannel: RealtimeChannel | null = null;
  private trainingRealtimeOrgId: string | null = null;

  readonly isCreating = signal(false);
  readonly createError = signal<TrainingError | null>(null);

  readonly viewerMode = computed<'admin' | 'member'>(() =>
    this.orgFacade.isAdmin() ? 'admin' : 'member',
  );
  readonly organizationTrainings = computed<readonly TrainingSummary[]>(() => {
    const orgId = this.orgFacade.activeOrgId();
    if (!orgId) return [];
    return this.organizationSummariesByOrgId()[orgId] ?? [];
  });
  readonly organizationTrainingsLoading = computed(() => {
    const orgId = this.orgFacade.activeOrgId();
    if (!orgId) return false;
    return this.queryState(organizationQueryKey(orgId)).isLoading;
  });
  readonly organizationTrainingsRefreshing = computed(() => {
    const orgId = this.orgFacade.activeOrgId();
    if (!orgId) return false;
    return this.queryState(organizationQueryKey(orgId)).isRefreshing;
  });
  readonly organizationTrainingsError = computed<TrainingError | null>(() => {
    const orgId = this.orgFacade.activeOrgId();
    if (!orgId) return null;
    return this.queryState(organizationQueryKey(orgId)).error;
  });

  constructor() {
    effect(() => {
      const orgId = this.orgFacade.activeOrgId();
      if (!orgId) {
        this.unsubscribeTrainingChanges();
        return;
      }
      void this.ensureOrganizationTrainings(orgId);
      this.subscribeToTrainingChanges(orgId);
    });

    if (isPlatformBrowser(this.platformId)) {
      const handleWindowFocus = () => {
        void this.revalidateCachedQueries();
      };
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          void this.revalidateCachedQueries();
        }
      };

      window.addEventListener('focus', handleWindowFocus);
      document.addEventListener('visibilitychange', handleVisibilityChange);
      this.destroyRef.onDestroy(() => {
        window.removeEventListener('focus', handleWindowFocus);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        this.unsubscribeTrainingChanges();
      });
    }
  }

  projectTrainings(projectId: string): readonly TrainingSummary[] {
    if (!projectId) return [];
    return this.projectSummariesByProjectId()[projectId] ?? [];
  }

  projectTrainingsLoading(projectId: string): boolean {
    if (!projectId) return false;
    return this.queryState(projectQueryKey(projectId)).isLoading;
  }

  projectTrainingsRefreshing(projectId: string): boolean {
    if (!projectId) return false;
    return this.queryState(projectQueryKey(projectId)).isRefreshing;
  }

  projectTrainingsError(projectId: string): TrainingError | null {
    if (!projectId) return null;
    return this.queryState(projectQueryKey(projectId)).error;
  }

  trainingOverview(trainingId: string): TrainingOverview | null {
    if (!trainingId) return null;
    return this.overviewsByTrainingId()[trainingId] ?? null;
  }

  trainingOverviewLoading(trainingId: string): boolean {
    if (!trainingId) return false;
    return this.queryState(overviewQueryKey(trainingId)).isLoading;
  }

  trainingOverviewRefreshing(trainingId: string): boolean {
    if (!trainingId) return false;
    return this.queryState(overviewQueryKey(trainingId)).isRefreshing;
  }

  trainingOverviewError(trainingId: string): TrainingError | null {
    if (!trainingId) return null;
    return this.queryState(overviewQueryKey(trainingId)).error;
  }

  async ensureOrganizationTrainings(
    orgId: string | null,
    options: { force?: boolean } = {},
  ): Promise<void> {
    if (!orgId) return;
    await this.runQuery(
      organizationQueryKey(orgId),
      options.force ?? false,
      async () => this.trainingService.getTrainingSummariesByOrganization(orgId),
      (data) => {
        this.organizationSummariesByOrgId.update((record) => ({
          ...record,
          [orgId]: data,
        }));
      },
    );
  }

  async ensureProjectTrainings(
    projectId: string,
    options: { force?: boolean } = {},
  ): Promise<void> {
    if (!projectId) return;
    await this.runQuery(
      projectQueryKey(projectId),
      options.force ?? false,
      async () => this.trainingService.getTrainingSummariesByProject(projectId),
      (data) => {
        this.projectSummariesByProjectId.update((record) => ({
          ...record,
          [projectId]: data,
        }));
      },
    );
  }

  async ensureTrainingOverview(
    trainingId: string,
    options: { force?: boolean } = {},
  ): Promise<void> {
    if (!trainingId) return;
    await this.runQuery(
      overviewQueryKey(trainingId),
      options.force ?? false,
      async () => this.trainingService.getTrainingOverview(trainingId),
      (data) => {
        this.overviewsByTrainingId.update((record) => ({
          ...record,
          [trainingId]: data,
        }));
      },
    );
  }

  async createTrainingFromProject(
    projectId: string,
    payload: CreateTrainingFromProjectPayload,
  ): Promise<TrainingError | null> {
    if (!projectId) {
      return validationError('Project is required');
    }
    if (payload.title.trim().length === 0) {
      return validationError('Title is required');
    }
    if (payload.assetTypes.length === 0) {
      return validationError('Select at least one module');
    }

    this.isCreating.set(true);
    this.createError.set(null);

    const result = await this.trainingService.createTrainingFromProject(projectId, payload);
    this.isCreating.set(false);

    if (result.errorMessage) {
      const error = infraError(result.errorMessage);
      this.createError.set(error);
      return error;
    }

    const orgId = this.orgFacade.activeOrgId();
    if (result.data) {
      this.commitCreatedTraining(projectId, result.data, payload);
    }

    void Promise.all([
      orgId ? this.ensureOrganizationTrainings(orgId, { force: true }) : Promise.resolve(),
      this.ensureProjectTrainings(projectId, { force: true }),
      result.data
        ? this.ensureTrainingOverview(result.data.id, { force: true })
        : Promise.resolve(),
    ]);

    return null;
  }

  private async runQuery<TData>(
    key: string,
    force: boolean,
    loader: () => Promise<{ data: TData | null; errorMessage: string | null }>,
    commit: (data: TData) => void,
  ): Promise<void> {
    if (!force && !this.isStale(key)) {
      return;
    }

    const existingQuery = this.inFlightQueries.get(key);
    if (existingQuery) {
      await existingQuery;
      return;
    }

    const hasCachedData = this.queryState(key).lastLoadedAt !== null;
    this.patchQueryState(key, {
      isLoading: !hasCachedData,
      isRefreshing: hasCachedData,
      error: null,
    });

    const queryPromise = (async () => {
      const { data, errorMessage } = await loader();

      if (errorMessage) {
        this.patchQueryState(key, {
          isLoading: false,
          isRefreshing: false,
          error: infraError(errorMessage),
        });
        return;
      }

      if (data !== null) {
        commit(data);
      }

      this.patchQueryState(key, {
        isLoading: false,
        isRefreshing: false,
        error: null,
        lastLoadedAt: Date.now(),
      });
    })();

    this.inFlightQueries.set(key, queryPromise);

    try {
      await queryPromise;
    } finally {
      this.inFlightQueries.delete(key);
    }
  }

  private isStale(key: string): boolean {
    const { lastLoadedAt } = this.queryState(key);
    if (lastLoadedAt === null) return true;
    return Date.now() - lastLoadedAt > FRESHNESS_WINDOW_MS;
  }

  private queryState(key: string): QueryState {
    return this.queryStates()[key] ?? EMPTY_QUERY_STATE;
  }

  private patchQueryState(key: string, patch: Partial<QueryState>): void {
    this.queryStates.update((record) => ({
      ...record,
      [key]: {
        ...this.queryState(key),
        ...patch,
      },
    }));
  }

  private async revalidateCachedQueries(options: { force?: boolean } = {}): Promise<void> {
    const orgId = this.orgFacade.activeOrgId();
    const projectIds = Object.keys(this.projectSummariesByProjectId());
    const trainingIds = Object.keys(this.overviewsByTrainingId());

    await Promise.all([
      orgId ? this.ensureOrganizationTrainings(orgId, { force: options.force }) : Promise.resolve(),
      ...projectIds.map((projectId) =>
        this.ensureProjectTrainings(projectId, { force: options.force }),
      ),
      ...trainingIds.map((trainingId) =>
        this.ensureTrainingOverview(trainingId, { force: options.force }),
      ),
    ]);
  }

  private commitCreatedTraining(
    projectId: string,
    training: Training,
    payload: CreateTrainingFromProjectPayload,
  ): void {
    const orgId = this.orgFacade.activeOrgId();
    const summary: TrainingSummary = {
      ...training,
      moduleCount: payload.assetTypes.length,
      assignmentCount: payload.assigneeIds.length,
      averageProgressPct: 0,
      viewerAssignmentId: null,
      viewerAssignmentStatus: null,
      viewerProgressPct: null,
    };

    if (orgId) {
      this.organizationSummariesByOrgId.update((record) => ({
        ...record,
        [orgId]: upsertTrainingSummary(record[orgId] ?? [], summary),
      }));
    }

    this.projectSummariesByProjectId.update((record) => ({
      ...record,
      [projectId]: upsertTrainingSummary(record[projectId] ?? [], summary),
    }));
  }

  private subscribeToTrainingChanges(orgId: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (this.trainingRealtimeChannel && this.trainingRealtimeOrgId === orgId) {
      return;
    }

    this.unsubscribeTrainingChanges();

    const { client } = getSupabaseClientState();
    if (!client) return;

    this.trainingRealtimeChannel = client
      .channel(`training-changes:${orgId}`)
      .on<Record<string, unknown>>(
        'postgres_changes',
        {
          event: '*',
          schema: 'RoleReady',
          table: 'training',
        },
        (payload) => {
          const projectId = readProjectIdFromTrainingPayload(payload.new, payload.old);
          void this.ensureOrganizationTrainings(orgId, { force: true });
          if (projectId && this.projectSummariesByProjectId()[projectId]) {
            void this.ensureProjectTrainings(projectId, { force: true });
          }
        },
      )
      .subscribe();
    this.trainingRealtimeOrgId = orgId;
  }

  private unsubscribeTrainingChanges(): void {
    if (!this.trainingRealtimeChannel) return;
    this.trainingRealtimeChannel.unsubscribe();
    this.trainingRealtimeChannel = null;
    this.trainingRealtimeOrgId = null;
  }
}

function upsertTrainingSummary(
  current: readonly TrainingSummary[],
  next: TrainingSummary,
): readonly TrainingSummary[] {
  const existingIndex = current.findIndex((training) => training.id === next.id);
  if (existingIndex < 0) {
    return [next, ...current];
  }

  return current.map((training, index) => (index === existingIndex ? next : training));
}

function readProjectIdFromTrainingPayload(
  next: Record<string, unknown>,
  previous: Record<string, unknown>,
): string | null {
  const projectId = next['project_id'] ?? previous['project_id'];
  return typeof projectId === 'string' ? projectId : null;
}
