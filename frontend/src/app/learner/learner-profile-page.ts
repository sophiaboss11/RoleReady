import { ChangeDetectionStrategy, Component, computed, inject, OnInit } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBookOpen,
  lucideFlame,
  lucideHeadphones,
  lucidePlay,
  lucideStar,
  lucideTarget,
  lucideTrophy,
  lucideZap,
} from '@ng-icons/lucide';
import { HlmCardImports } from '@app/ui/card';
import { HlmSkeletonImports } from '@app/ui/skeleton';
import { GamificationFacade } from '../services/gamification.facade';
import { formatDuration, isXpReason, XP_REASON_LABELS } from '../domain/gamification.types';

@Component({
  selector: 'app-learner-profile-page',
  standalone: true,
  imports: [DecimalPipe, NgIcon, HlmCardImports, HlmSkeletonImports],
  providers: [
    provideIcons({
      lucideBookOpen,
      lucideFlame,
      lucideHeadphones,
      lucidePlay,
      lucideStar,
      lucideTarget,
      lucideTrophy,
      lucideZap,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-3xl space-y-6 pb-16">
      <h1 class="text-2xl font-bold tracking-tight">My Profile</h1>

      @if (facade.isLoading()) {
        <div class="grid gap-4 sm:grid-cols-3">
          @for (_ of [1, 2, 3]; track $index) {
            <hlm-skeleton class="h-28 rounded-xl" />
          }
        </div>
      } @else if (profile()) {
        <!-- Level & XP Hero -->
        <section
          hlmCard
          class="overflow-hidden border-0 bg-gradient-to-br from-primary/5 via-background to-primary/10 shadow-lg"
        >
          <div
            hlmCardContent
            class="flex flex-col items-center gap-4 p-6 sm:flex-row sm:items-start"
          >
            <div
              class="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
            >
              <span class="text-2xl font-bold">{{ profile()!.level }}</span>
            </div>
            <div class="flex-1 space-y-2 text-center sm:text-left">
              <div>
                <span class="text-3xl font-bold">{{ profile()!.totalXp | number }}</span>
                <span class="ml-1 text-sm text-muted-foreground">XP</span>
              </div>
              <div class="space-y-1">
                <div class="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Level {{ profile()!.level }}</span>
                  <span>{{ profile()!.xpToNextLevel }} XP to next level</span>
                </div>
                <div class="h-2.5 overflow-hidden rounded-full bg-muted/60">
                  <div
                    class="h-full rounded-full bg-gradient-to-r from-primary to-primary/80 transition-all duration-700"
                    [style.width.%]="levelProgressPct()"
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Stats Grid -->
        <div class="grid gap-4 sm:grid-cols-3">
          <!-- Streak -->
          <section hlmCard>
            <div hlmCardContent class="flex items-center gap-3 p-5">
              <div
                class="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/30"
              >
                <ng-icon name="lucideFlame" class="text-orange-500" />
              </div>
              <div>
                <p class="text-2xl font-bold">{{ profile()!.currentStreakDays }}</p>
                <p class="text-xs text-muted-foreground">Day streak</p>
              </div>
            </div>
          </section>

          <!-- Lessons -->
          <section hlmCard>
            <div hlmCardContent class="flex items-center gap-3 p-5">
              <div
                class="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30"
              >
                <ng-icon name="lucideBookOpen" class="text-blue-500" />
              </div>
              <div>
                <p class="text-2xl font-bold">{{ profile()!.totalLessonsCompleted }}</p>
                <p class="text-xs text-muted-foreground">Lessons completed</p>
              </div>
            </div>
          </section>

          <!-- Accuracy -->
          <section hlmCard>
            <div hlmCardContent class="flex items-center gap-3 p-5">
              <div
                class="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30"
              >
                <ng-icon name="lucideTarget" class="text-green-500" />
              </div>
              <div>
                <p class="text-2xl font-bold">{{ profile()!.quizAccuracyPct }}%</p>
                <p class="text-xs text-muted-foreground">Quiz accuracy</p>
              </div>
            </div>
          </section>
        </div>

        <!-- Media Time -->
        <div class="grid gap-4 sm:grid-cols-2">
          <section hlmCard>
            <div hlmCardContent class="flex items-center gap-3 p-5">
              <ng-icon name="lucidePlay" class="text-lg text-muted-foreground" />
              <div>
                <p class="font-semibold">{{ formatDuration(profile()!.totalWatchSeconds) }}</p>
                <p class="text-xs text-muted-foreground">Watch time</p>
              </div>
            </div>
          </section>
          <section hlmCard>
            <div hlmCardContent class="flex items-center gap-3 p-5">
              <ng-icon name="lucideHeadphones" class="text-lg text-muted-foreground" />
              <div>
                <p class="font-semibold">{{ formatDuration(profile()!.totalListenSeconds) }}</p>
                <p class="text-xs text-muted-foreground">Listen time</p>
              </div>
            </div>
          </section>
        </div>

        <!-- Daily Goal -->
        @if (dailyGoal()) {
          <section hlmCard>
            <div hlmCardContent class="p-5">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <ng-icon name="lucideZap" class="text-amber-500" />
                  <span class="font-semibold">Daily Goal</span>
                </div>
                @if (dailyGoal()!.completed) {
                  <span
                    class="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-900 dark:text-green-300"
                  >
                    Completed
                  </span>
                }
              </div>
              <div class="mt-3 space-y-1">
                <div class="flex justify-between text-xs text-muted-foreground">
                  <span>{{ dailyGoal()!.earnedXp }} / {{ dailyGoal()!.targetXp }} XP</span>
                  <span>{{ dailyGoalPct() }}%</span>
                </div>
                <div class="h-3 overflow-hidden rounded-full bg-muted/60">
                  <div
                    class="h-full rounded-full transition-all duration-500"
                    [class.bg-gradient-to-r]="true"
                    [class.from-amber-400]="!dailyGoal()!.completed"
                    [class.to-orange-500]="!dailyGoal()!.completed"
                    [class.from-green-400]="dailyGoal()!.completed"
                    [class.to-emerald-500]="dailyGoal()!.completed"
                    [style.width.%]="dailyGoalPct()"
                  ></div>
                </div>
              </div>
            </div>
          </section>
        }

        <!-- XP History -->
        @if (xpHistory().length > 0) {
          <section hlmCard>
            <div hlmCardHeader>
              <h2 hlmCardTitle>Recent XP</h2>
            </div>
            <div hlmCardContent>
              <div class="space-y-2">
                @for (entry of xpHistory(); track entry.id) {
                  <div class="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p class="text-sm font-medium">{{ reasonLabel(entry.reason) }}</p>
                      <p class="text-xs text-muted-foreground">{{ formatTime(entry.createdAt) }}</p>
                    </div>
                    <span
                      class="text-sm font-bold"
                      [class.text-green-600]="entry.amount > 0"
                      [class.text-red-600]="entry.amount < 0"
                    >
                      {{ entry.amount > 0 ? '+' : '' }}{{ entry.amount }} XP
                    </span>
                  </div>
                }
              </div>
            </div>
          </section>
        }
      }
    </div>
  `,
})
export class LearnerProfilePage implements OnInit {
  protected readonly facade = inject(GamificationFacade);

  protected readonly profile = this.facade.profile;
  protected readonly dailyGoal = this.facade.dailyGoal;
  protected readonly xpHistory = this.facade.xpHistory;

  protected readonly levelProgressPct = computed(() => {
    const p = this.profile();
    if (!p) return 0;
    const currentLevelXp = (p.level - 1) ** 2 * 100;
    const nextLevelXp = p.level ** 2 * 100;
    const range = nextLevelXp - currentLevelXp;
    if (range <= 0) return 100;
    return Math.min(100, Math.round(((p.totalXp - currentLevelXp) / range) * 100));
  });

  protected readonly dailyGoalPct = computed(() => {
    const g = this.dailyGoal();
    if (!g || g.targetXp <= 0) return 0;
    return Math.min(100, Math.round((g.earnedXp / g.targetXp) * 100));
  });

  async ngOnInit(): Promise<void> {
    await Promise.all([
      this.facade.loadProfile(),
      this.facade.loadDailyGoal(),
      this.facade.loadXpHistory(),
    ]);
  }

  protected formatDuration = formatDuration;

  protected reasonLabel(reason: string): string {
    return isXpReason(reason) ? XP_REASON_LABELS[reason] : reason;
  }

  protected formatTime(iso: string): string {
    const ts = Date.parse(iso);
    if (Number.isNaN(ts)) return '';
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(ts);
  }
}
