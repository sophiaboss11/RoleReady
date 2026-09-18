import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCircleAlert,
  lucideMedal,
  lucideRefreshCw,
  lucideTrophy,
  lucideUsers,
} from '@ng-icons/lucide';
import { HlmAlertImports } from '@app/ui/alert';
import { HlmAvatarImports } from '@app/ui/avatar';
import { HlmBadgeImports } from '@app/ui/badge';
import { HlmButtonImports } from '@app/ui/button';
import { HlmCardImports } from '@app/ui/card';
import { HlmSkeletonImports } from '@app/ui/skeleton';
import { HlmTableImports } from '@app/ui/table';
import { AuthFacade } from '../services/auth.facade';
import { OrganizationFacade } from '../services/organization.facade';
import { SocialFacade } from '../services/social.facade';
import {
  LEADERBOARD_PERIOD_LABELS,
  type LeaderboardEntry,
  type LeaderboardPeriod,
} from '../domain/social.types';

interface PeriodOption {
  readonly value: LeaderboardPeriod;
  readonly label: string;
}

const PERIOD_OPTIONS: readonly PeriodOption[] = [
  { value: 'weekly', label: LEADERBOARD_PERIOD_LABELS.weekly },
  { value: 'monthly', label: LEADERBOARD_PERIOD_LABELS.monthly },
  { value: 'all_time', label: LEADERBOARD_PERIOD_LABELS.all_time },
] as const;

const STANDINGS_SKELETONS = [1, 2, 3, 4, 5, 6] as const;

@Component({
  selector: 'app-leaderboard-page',
  standalone: true,
  imports: [
    DecimalPipe,
    NgIcon,
    HlmAlertImports,
    HlmAvatarImports,
    HlmBadgeImports,
    HlmButtonImports,
    HlmCardImports,
    HlmSkeletonImports,
    HlmTableImports,
  ],
  providers: [
    provideIcons({
      lucideCircleAlert,
      lucideMedal,
      lucideRefreshCw,
      lucideTrophy,
      lucideUsers,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
    }
  `,
  template: `
    <div class="mx-auto max-w-5xl space-y-6 px-4 pb-16 pt-6 sm:px-6 lg:px-8">
      <section
        hlmCard
        class="overflow-hidden border-0 bg-gradient-to-br from-primary/5 via-background to-primary/10 shadow-lg"
      >
        <div hlmCardContent class="space-y-6 p-6 sm:p-8">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div class="space-y-3">
              <div
                class="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-primary"
              >
                <ng-icon name="lucideTrophy" class="text-sm" />
                Cohort League
              </div>
              <div class="space-y-1">
                <h1 class="text-3xl font-bold tracking-tight sm:text-4xl">Cohort League</h1>
                <p class="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                  Track XP earned inside {{ organizationName() }}.
                </p>
              </div>
            </div>

            <div class="flex flex-wrap gap-2">
              @for (option of periodOptions; track option.value) {
                <button
                  hlmBtn
                  type="button"
                  [variant]="selectedPeriod() === option.value ? 'default' : 'outline'"
                  class="rounded-full px-5"
                  [attr.aria-pressed]="selectedPeriod() === option.value"
                  (click)="selectPeriod(option.value)"
                >
                  {{ option.label }}
                </button>
              }
              <button
                hlmBtn
                type="button"
                variant="outline"
                class="rounded-full px-4"
                [disabled]="isLoading()"
                (click)="refresh()"
              >
                <ng-icon name="lucideRefreshCw" class="mr-2" />
                Refresh
              </button>
            </div>
          </div>

          <div
            class="flex flex-col gap-2 rounded-xl border bg-background/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Current Window
              </p>
              <p class="font-medium">{{ selectedPeriodLabel() }}</p>
            </div>
            <p class="text-sm text-muted-foreground">
              {{ leaderboardWindowLabel() || 'Waiting for activity' }}
            </p>
          </div>

          <div class="grid gap-4 sm:grid-cols-3">
            <section hlmCard size="sm" class="border-primary/20 bg-primary/5">
              <div hlmCardContent class="flex items-center gap-3 px-5 py-4">
                <div
                  class="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"
                >
                  <ng-icon name="lucideTrophy" />
                </div>
                <div>
                  <p class="text-2xl font-bold">{{ viewerRankLabel() }}</p>
                  <p class="text-xs text-muted-foreground">{{ viewerSummaryLabel() }}</p>
                </div>
              </div>
            </section>

            <section hlmCard size="sm">
              <div hlmCardContent class="flex items-center gap-3 px-5 py-4">
                <div
                  class="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300"
                >
                  <ng-icon name="lucideUsers" />
                </div>
                <div>
                  <p class="text-2xl font-bold">{{ entries().length }}</p>
                  <p class="text-xs text-muted-foreground">Ranked learners</p>
                </div>
              </div>
            </section>

            <section hlmCard size="sm">
              <div hlmCardContent class="flex items-center gap-3 px-5 py-4">
                <div
                  class="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300"
                >
                  <ng-icon name="lucideMedal" />
                </div>
                <div>
                  <p class="text-2xl font-bold">{{ topXp() | number }}</p>
                  <p class="text-xs text-muted-foreground">Top XP in this window</p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </section>

      @if (errorMessage() && !hasLeaderboard()) {
        <div hlmAlert variant="destructive">
          <ng-icon hlmAlertIcon name="lucideCircleAlert" />
          <p hlmAlertDescription>{{ errorMessage() }}</p>
        </div>
      }

      @if (isLoading() && !hasLeaderboard()) {
        <div>
          <section hlmCard>
            <div hlmCardContent class="space-y-4 p-5 sm:p-6">
              <hlm-skeleton class="h-5 w-36" />
              @for (_ of standingsSkeletons; track $index) {
                <div class="flex items-center gap-4">
                  <hlm-skeleton class="h-4 w-8" />
                  <hlm-skeleton class="h-8 w-8 rounded-full" />
                  <div class="flex-1 space-y-2">
                    <hlm-skeleton class="h-4 w-40" />
                    <hlm-skeleton class="h-3 w-28" />
                  </div>
                  <hlm-skeleton class="h-4 w-16" />
                </div>
              }
            </div>
          </section>
        </div>
      } @else if (!hasEntries()) {
        <section hlmCard class="border-dashed">
          <div hlmCardContent class="space-y-3 p-8 text-center">
            <div
              class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary"
            >
              <ng-icon name="lucideTrophy" class="text-2xl" />
            </div>
            <div class="space-y-1">
              <h2 class="text-xl font-semibold tracking-tight">
                League starts with the first learner
              </h2>
              <p class="text-sm text-muted-foreground">
                No XP has been recorded for this organization yet in the selected window.
              </p>
            </div>
          </div>
        </section>
      } @else {
        <div>
          <section hlmCard>
            <div hlmCardHeader class="space-y-1">
              <div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 hlmCardTitle>Standings</h2>
                  <p hlmCardDescription>
                    {{ selectedPeriodLabel() }} inside {{ organizationName() }}
                  </p>
                </div>
                <p class="text-sm text-muted-foreground">{{ leaderboardWindowLabel() }}</p>
              </div>
            </div>

            <div hlmCardContent class="space-y-4">
              @if (errorMessage() && hasLeaderboard()) {
                <div hlmAlert variant="destructive">
                  <ng-icon hlmAlertIcon name="lucideCircleAlert" />
                  <p hlmAlertDescription>{{ errorMessage() }}</p>
                </div>
              }

              <div hlmTableContainer>
                <table hlmTable>
                  <thead hlmTHead>
                    <tr hlmTr>
                      <th hlmTh class="w-16">Rank</th>
                      <th hlmTh>Learner</th>
                      <th hlmTh class="w-28 text-right">XP</th>
                    </tr>
                  </thead>
                  <tbody hlmTBody>
                    @for (entry of entries(); track entry.userId) {
                      <tr hlmTr class="transition-colors" [class]="standingsRowClass(entry)">
                        <td hlmTd class="font-semibold">#{{ entry.rank }}</td>
                        <td hlmTd>
                          <div class="flex items-center gap-3">
                            <hlm-avatar class="size-8">
                              @if (entry.avatarUrl) {
                                <img
                                  [src]="entry.avatarUrl"
                                  [alt]="displayName(entry)"
                                  hlmAvatarImage
                                />
                              }
                              <span class="bg-muted text-xs" hlmAvatarFallback>
                                {{ initials(entry) }}
                              </span>
                            </hlm-avatar>
                            <div class="min-w-0 space-y-1">
                              <div class="flex flex-wrap items-center gap-2">
                                <span class="truncate font-medium">{{ displayName(entry) }}</span>
                                @if (isViewer(entry)) {
                                  <span
                                    hlmBadge
                                    class="border-primary/20 bg-primary/10 text-primary hover:bg-primary/10"
                                  >
                                    You
                                  </span>
                                }
                                @if (entry.rank <= 3) {
                                  <span hlmBadge variant="secondary">{{
                                    podiumLabel(entry.rank)
                                  }}</span>
                                }
                              </div>
                              <p class="text-xs text-muted-foreground">
                                {{ entrySummary(entry) }}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td hlmTd class="text-right font-semibold">
                          {{ entry.xpEarned | number }}
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
      }
    </div>
  `,
})
export class LeaderboardPage {
  private readonly authFacade = inject(AuthFacade);
  private readonly orgFacade = inject(OrganizationFacade);
  private readonly socialFacade = inject(SocialFacade);

  protected readonly periodOptions = PERIOD_OPTIONS;
  protected readonly standingsSkeletons = STANDINGS_SKELETONS;
  protected readonly selectedPeriod = signal<LeaderboardPeriod>('weekly');

  protected readonly leaderboard = computed(() =>
    this.socialFacade.leaderboard(this.selectedPeriod()),
  );
  protected readonly entries = computed(() => this.leaderboard()?.entries ?? []);
  protected readonly isLoading = computed(() =>
    this.socialFacade.leaderboardLoading(this.selectedPeriod()),
  );
  protected readonly errorMessage = computed(() =>
    this.socialFacade.leaderboardError(this.selectedPeriod()),
  );
  protected readonly selectedPeriodLabel = computed(
    () => LEADERBOARD_PERIOD_LABELS[this.selectedPeriod()],
  );
  protected readonly organizationName = computed(
    () => this.orgFacade.activeOrganization()?.name ?? 'your organization',
  );
  protected readonly viewerId = computed(() => this.authFacade.user()?.id ?? null);
  protected readonly viewerEntry = computed(
    () => this.entries().find((entry) => entry.userId === this.viewerId()) ?? null,
  );
  protected readonly topXp = computed(() => this.entries()[0]?.xpEarned ?? 0);
  protected readonly hasLeaderboard = computed(() => this.leaderboard() !== null);
  protected readonly hasEntries = computed(() => this.entries().length > 0);
  protected readonly viewerRankLabel = computed(() => {
    const entry = this.viewerEntry();
    return entry ? `#${entry.rank}` : '—';
  });
  protected readonly viewerSummaryLabel = computed(() => {
    const entry = this.viewerEntry();
    if (!entry) return 'Complete modules to enter the league';
    return `${entry.xpEarned.toLocaleString('en-US')} XP earned`;
  });
  protected readonly leaderboardWindowLabel = computed(() => {
    const board = this.leaderboard();
    if (!board) return '';
    return `${this.formatDate(board.periodStart)} - ${this.formatDate(board.periodEnd)}`;
  });

  constructor() {
    effect(() => {
      const orgId = this.orgFacade.activeOrgId();
      const period = this.selectedPeriod();
      if (!orgId) return;
      void this.socialFacade.ensureLeaderboard(period);
    });
  }

  protected selectPeriod(period: LeaderboardPeriod): void {
    this.selectedPeriod.set(period);
  }

  protected async refresh(): Promise<void> {
    await this.socialFacade.ensureLeaderboard(this.selectedPeriod(), { force: true });
  }

  protected isViewer(entry: LeaderboardEntry): boolean {
    return entry.userId === this.viewerId();
  }

  protected displayName(entry: LeaderboardEntry): string {
    const name = entry.displayName?.trim();
    if (name) return name;
    return `Learner ${entry.userId.slice(0, 8)}`;
  }

  protected initials(entry: LeaderboardEntry): string {
    const source = this.displayName(entry);
    const parts = source.split(/\s+/).filter(Boolean).slice(0, 2);
    const initials = parts.map((part) => part.charAt(0)).join('');
    return initials.slice(0, 2).toUpperCase();
  }

  protected podiumLabel(rank: number): string {
    switch (rank) {
      case 1:
        return 'Champion';
      case 2:
        return 'Runner-up';
      case 3:
        return 'Third Place';
      default:
        return 'League Rank';
    }
  }

  protected standingsRowClass(entry: LeaderboardEntry): string {
    return this.isViewer(entry) ? 'bg-primary/5' : '';
  }

  protected entrySummary(entry: LeaderboardEntry): string {
    if (entry.rank === 1) return 'Leading this window';
    if (entry.rank <= 3) return 'Inside the top 3';
    return 'Earning XP this period';
  }

  private formatDate(value: string): string {
    const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (dateOnlyMatch) {
      const [, year, month, day] = dateOnlyMatch;
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
      }).format(new Date(Number(year), Number(month) - 1, Number(day)));
    }

    const timestamp = Date.parse(value);
    if (Number.isNaN(timestamp)) return value;
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
    }).format(timestamp);
  }
}
