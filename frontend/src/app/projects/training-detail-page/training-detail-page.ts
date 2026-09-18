import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { DecimalPipe, TitleCasePipe, CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeft,
  lucideCalendar,
  lucideCheck,
  lucideChevronDown,
  lucideCircleAlert,
  lucideCrown,
  lucideFileText,
  lucideFlag,
  lucideFlame,
  lucideHeadphones,
  lucideImage,
  lucideLayoutDashboard,
  lucideLock,
  lucideMedal,
  lucidePlay,
  lucideShield,
  lucideStar,
  lucideTarget,
  lucideTrophy,
  lucideUsers,
  lucideX,
  lucideZap,
} from '@ng-icons/lucide';
import { HlmAlertImports } from '@app/ui/alert';
import { HlmBadgeImports } from '@app/ui/badge';
import { HlmButtonImports } from '@app/ui/button';
import { HlmCardImports } from '@app/ui/card';
import { HlmSkeletonImports } from '@app/ui/skeleton';
import { HlmSpinnerImports } from '@app/ui/spinner';
import { OrganizationFacade } from '../../services/organization.facade';
import { TrainingFacade } from '../../services/training.facade';
import { TrainingService } from '../../services/training.service';
import { ApiClient } from '../../services/api.client';
import { GamificationFacade } from '../../services/gamification.facade';
import { LearningSessionService } from '../../shared/learning/learning-session.service';
import { MediaTracker } from '../../shared/learning/media-tracker';
import {
  ProjectAssetContentViewer,
  type ProjectAssetContent,
} from '../../shared/ui/project-asset-content-viewer';
import type { TrainingAssignment, TrainingModule, Training } from '../../domain/training.types';

type ModuleNodeStatus = 'completed' | 'current' | 'locked';
type GameMode = 'pinpoint' | 'architecture' | null;
type ArchitectureTier = 'frontend' | 'application' | 'data';

interface ModuleNode {
  readonly module: TrainingModule;
  readonly index: number;
  readonly status: ModuleNodeStatus;
  readonly icon: string;
}

interface RankedLearner {
  readonly rank: number;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly progressPct: number;
  readonly status: string;
  readonly isViewer: boolean;
}

interface ArchitectureResponse {
  readonly id: string;
  readonly project_id: string;
  readonly timestamp: string;
  readonly frontend: string[];
  readonly application: string[];
  readonly data: string[];
}

interface PinpointQuestion {
  readonly id: string;
  readonly project_id: string;
  readonly timestamp: string;
  readonly clue_1: string;
  readonly clue_2: string;
  readonly clue_3: string;
  readonly answer: string;
}

interface PinpointGenerationResponse {
  readonly project_id: string;
  readonly question_count: number;
  readonly questions: PinpointQuestion[];
}

interface ArchitecturePlacement {
  frontend: string[];
  application: string[];
  data: string[];
}

interface ArchitectureResultEntry {
  component: string;
  correctTier: ArchitectureTier;
  placedTier: ArchitectureTier | null;
  correct: boolean;
}

const MODULE_ICON: Record<string, string> = {
  summary: 'lucideFileText',
  infographic: 'lucideImage',
  mindmap: 'lucideLayoutDashboard',
  audio: 'lucideHeadphones',
  video: 'lucidePlay',
  document: 'lucideFileText',
  quiz: 'lucideCheck',
};

const RANK_ICON: Record<number, string> = {
  1: 'lucideCrown',
  2: 'lucideMedal',
  3: 'lucideShield',
};

@Component({
  selector: 'app-training-detail-page',
  standalone: true,
  imports: [
    DecimalPipe,
    TitleCasePipe,
    RouterLink,
    NgIcon,
    CommonModule,
    FormsModule,
    HlmAlertImports,
    HlmBadgeImports,
    HlmButtonImports,
    HlmCardImports,
    HlmSkeletonImports,
    HlmSpinnerImports,
    ProjectAssetContentViewer,
  ],
  providers: [
    provideIcons({
      lucideArrowLeft,
      lucideCalendar,
      lucideCheck,
      lucideChevronDown,
      lucideCircleAlert,
      lucideCrown,
      lucideFileText,
      lucideFlag,
      lucideFlame,
      lucideHeadphones,
      lucideImage,
      lucideLayoutDashboard,
      lucideLock,
      lucideMedal,
      lucidePlay,
      lucideShield,
      lucideStar,
      lucideTarget,
      lucideTrophy,
      lucideUsers,
      lucideX,
      lucideZap,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }

    .path-connector {
      width: 3px;
      background: repeating-linear-gradient(
        to bottom,
        var(--border) 0px, var(--border) 6px,
        transparent 6px, transparent 12px
      );
    }
    .path-connector-solid {
      width: 3px;
      background: var(--primary);
    }
    .node-completed { background: var(--primary); color: var(--primary-foreground); }
    .node-current {
      background: var(--background);
      border: 3px solid var(--primary);
      color: var(--primary);
      animation: pulse-ring 2s ease-in-out infinite;
    }
    .node-locked { background: var(--muted); color: var(--muted-foreground); }

    @keyframes pulse-ring {
      0%, 100% { box-shadow: 0 0 0 0 rgba(59 130 246 / 0.4); }
      50%       { box-shadow: 0 0 0 8px rgba(59 130 246 / 0); }
    }

    .drag-over {
      border-color: var(--primary) !important;
      background: rgba(59, 130, 246, 0.12) !important;
    }
  `,
  template: `
    <div class="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
      <!-- Gamification Status Bar -->
      <div class="mb-4 flex items-center justify-between">
        <a hlmBtn variant="ghost" size="sm" class="-ml-2" [routerLink]="backLink()">
          <ng-icon name="lucideArrowLeft" />
          Back to training
        </a>

        <nav class="flex items-center gap-1" aria-label="Your learning stats">
          <div class="group relative flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-primary/5 hover:border-primary/30 cursor-default"
            role="status" [attr.aria-label]="'Level ' + gamification.level()">
            <div class="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold"
              style="background: var(--brand-gradient); color: white;">
              {{ gamification.level() }}
            </div>
            <span class="hidden text-muted-foreground sm:inline">Level</span>
            <span class="pointer-events-none absolute -bottom-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background opacity-0 shadow-lg transition-opacity group-hover:opacity-100">Your current level</span>
          </div>

          <div class="group relative flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-amber-50 hover:border-amber-300 dark:hover:bg-amber-950/20 dark:hover:border-amber-700 cursor-default"
            role="status" [attr.aria-label]="gamification.totalXp() + ' experience points'">
            <ng-icon name="lucideZap" class="text-amber-500" />
            <span class="tabular-nums">{{ gamification.totalXp() | number }}</span>
            <span class="pointer-events-none absolute -bottom-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background opacity-0 shadow-lg transition-opacity group-hover:opacity-100">Total XP earned</span>
          </div>

          <div class="group relative flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-orange-50 hover:border-orange-300 dark:hover:bg-orange-950/20 dark:hover:border-orange-700 cursor-default"
            role="status" [attr.aria-label]="gamification.streakDays() + ' day streak'">
            <ng-icon name="lucideFlame" class="text-orange-500" />
            <span class="tabular-nums">{{ gamification.streakDays() }}</span>
            <span class="pointer-events-none absolute -bottom-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background opacity-0 shadow-lg transition-opacity group-hover:opacity-100">Day streak</span>
          </div>

          @if (quizAccuracy() > 0) {
            <div class="group relative hidden items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-green-50 hover:border-green-300 dark:hover:bg-green-950/20 dark:hover:border-green-700 cursor-default sm:flex"
              role="status" [attr.aria-label]="quizAccuracy() + ' percent quiz accuracy'">
              <ng-icon name="lucideTarget" class="text-green-500" />
              <span class="tabular-nums">{{ quizAccuracy() }}%</span>
              <span class="pointer-events-none absolute -bottom-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background opacity-0 shadow-lg transition-opacity group-hover:opacity-100">Quiz accuracy</span>
            </div>
          }
        </nav>
      </div>

      @if (isLoading()) {
        <div class="space-y-3">
          <hlm-skeleton class="h-8 w-64" />
          <hlm-skeleton class="h-4 w-96" />
        </div>
      } @else if (!training()) {
        <div hlmAlert variant="destructive">
          <ng-icon hlmAlertIcon name="lucideCircleAlert" />
          <h4 hlmAlertTitle>Not Found</h4>
          <p hlmAlertDesc>{{ errorMessage() ?? 'Training not found.' }}</p>
        </div>
      }

      @if (training(); as t) {
        <div class="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">

          <!-- ============ LEFT COLUMN ============ -->
          <div class="space-y-6">

            <!-- Progress Hero -->
            <section hlmCard class="overflow-hidden border-0 bg-gradient-to-br from-primary/5 via-background to-primary/10 shadow-lg">
              <div hlmCardContent class="p-6 sm:p-8">
                <div class="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
                  <div class="relative flex shrink-0 items-center justify-center">
                    <svg width="110" height="110" viewBox="0 0 120 120" class="drop-shadow-lg">
                      <circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" stroke-width="8" class="text-muted/40" />
                      <circle cx="60" cy="60" r="52" fill="none" stroke="url(#pg)" stroke-width="8" stroke-linecap="round"
                        [attr.stroke-dasharray]="circumference"
                        [attr.stroke-dashoffset]="progressOffset()"
                        transform="rotate(-90 60 60)"
                        class="transition-all duration-700" />
                      <defs>
                        <linearGradient id="pg" x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0%" stop-color="hsl(var(--primary))" />
                          <stop offset="100%" stop-color="hsl(262 83% 58%)" />
                        </linearGradient>
                      </defs>
                    </svg>
                    <div class="absolute inset-0 flex flex-col items-center justify-center">
                      <span class="text-2xl font-bold tracking-tight">{{ overallProgress() }}%</span>
                      <span class="text-[0.6rem] font-semibold uppercase tracking-widest text-muted-foreground">complete</span>
                    </div>
                  </div>

                  <div class="flex-1 space-y-3 text-center sm:text-left">
                    <div>
                      <h1 class="text-xl font-bold tracking-tight sm:text-2xl">{{ t.title }}</h1>
                      @if (t.description) {
                        <p class="mt-1 text-sm text-muted-foreground">{{ t.description }}</p>
                      }
                    </div>
                    <div class="flex flex-wrap justify-center gap-4 sm:justify-start">
                      <div class="flex items-center gap-1.5 text-sm">
                        <ng-icon name="lucideFlag" class="text-primary" />
                        <span class="font-semibold">{{ completedModuleCount() }}/{{ modules().length }}</span>
                        <span class="text-muted-foreground">modules</span>
                      </div>
                      <div class="flex items-center gap-1.5 text-sm">
                        <ng-icon name="lucideUsers" class="text-blue-500" />
                        <span class="font-semibold">{{ allAssignments().length }}</span>
                        <span class="text-muted-foreground">learners</span>
                      </div>
                      @if (dueLabel()) {
                        <div class="flex items-center gap-1.5 text-sm">
                          <ng-icon name="lucideCalendar" class="text-rose-500" />
                          <span class="text-muted-foreground">Due {{ dueLabel() }}</span>
                        </div>
                      }
                    </div>
                    @if (modules().length > 0) {
                      <div class="space-y-1">
                        <div class="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{{ completedModuleCount() }} of {{ modules().length }} modules completed</span>
                        </div>
                        <div class="h-2 w-full overflow-hidden rounded-full bg-muted/60">
                          <div class="h-full rounded-full bg-gradient-to-r from-primary to-primary/80 transition-all duration-700"
                            [style.width.%]="overallProgress()"></div>
                        </div>
                      </div>
                    }
                  </div>
                </div>
              </div>
            </section>

            <!-- Active Module or Game Viewer -->
            @if (activeModule() || activeGameMode()) {
              <section hlmCard class="overflow-hidden border-primary/30 shadow-lg">
                <div class="flex items-center justify-between border-b px-5 py-3">
                  <div class="flex items-center gap-2">
                    @if (activeModule()) {
                      <ng-icon [name]="moduleIcon(activeModule()!.moduleType)" class="text-primary" />
                      <h3 class="font-semibold">{{ activeModule()!.title }}</h3>
                      <span hlmBadge variant="outline" class="text-xs">{{ activeModule()!.moduleType | titlecase }}</span>
                    } @else if (activeGameMode() === 'architecture') {
                      <ng-icon name="lucideLayoutDashboard" class="text-primary" />
                      <h3 class="font-semibold">Architectural Deployment</h3>
                      <span hlmBadge variant="outline" class="text-xs">Game</span>
                    } @else if (activeGameMode() === 'pinpoint') {
                      <ng-icon name="lucideTarget" class="text-primary" />
                      <h3 class="font-semibold">Mission: Pinpoint</h3>
                      <span hlmBadge variant="outline" class="text-xs">Game</span>
                    }
                  </div>
                  <button hlmBtn variant="ghost" size="icon-sm" (click)="closeModule()">
                    <ng-icon name="lucideX" />
                  </button>
                </div>

                <div hlmCardContent class="p-5">
                  @if (contentLoading()) {
                    <div class="flex flex-col items-center gap-3 py-8">
                      <hlm-spinner />
                      <p class="text-sm text-muted-foreground">Loading content...</p>
                    </div>

                  } @else if (activeGameMode() === 'architecture') {
                    <!-- ===== ARCHITECTURE GAME ===== -->
                    @if (architectureLoadError()) {
                      <div class="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-center text-sm text-destructive">
                        {{ architectureLoadError() }}
                      </div>
                    } @else if (architectureApiData()) {
                      <div class="space-y-5">
                        <p class="text-sm text-muted-foreground">
                          Drag each component from the toolbox into the correct tier. Place all components before submitting.
                        </p>

                        <div class="grid grid-cols-1 gap-4 sm:grid-cols-[180px_1fr]">
                          <!-- Toolbox -->
                          <div class="rounded-lg border border-dashed border-border bg-muted/20 p-3">
                            <h4 class="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Component Toolbox
                            </h4>
                            <div class="space-y-2">
                              @for (comp of architectureToolbox(); track comp) {
                                <div
                                  draggable="true"
                                  (dragstart)="dragStart($event, comp)"
                                  class="cursor-grab select-none rounded border border-border bg-background px-3 py-2 text-sm font-medium shadow-sm transition hover:border-primary/40 hover:bg-primary/5 active:cursor-grabbing"
                                >
                                  {{ comp }}
                                </div>
                              }
                              @if (architectureToolbox().length === 0) {
                                <p class="text-xs italic text-muted-foreground">All components placed</p>
                              }
                            </div>
                          </div>

                          <!-- Drop Zones -->
                          <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            @for (tier of architectureTiers; track tier.key) {
                              <div
                                (drop)="dropComponent($event, tier.key)"
                                (dragover)="dragOver($event)"
                                (dragleave)="dragLeave($event)"
                                class="min-h-[130px] rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 p-3 transition-colors"
                              >
                                <h4 class="mb-3 text-xs font-semibold uppercase tracking-wide text-primary">
                                  {{ tier.label }}
                                </h4>
                                <div class="space-y-2">
                                  @for (comp of architecturePlacement()[tier.key]; track $index) {
                                    <div
                                      draggable="true"
                                      (dragstart)="dragStartFromTier($event, comp, tier.key)"
                                      class="flex cursor-grab select-none items-center justify-between rounded border border-blue-300 bg-blue-100 px-3 py-2 text-xs text-blue-900 dark:bg-blue-950/40 dark:border-blue-700 dark:text-blue-300"
                                    >
                                      <span>{{ comp }}</span>
                                      <button type="button" class="ml-1 opacity-50 hover:opacity-100" (click)="removeFromTier(comp, tier.key)">
                                        <ng-icon name="lucideX" class="text-xs" />
                                      </button>
                                    </div>
                                  }
                                </div>
                              </div>
                            }
                          </div>
                        </div>

                        <!-- Results -->
                        @if (architectureResults()) {
                          <div class="rounded-lg border bg-muted/20 p-4 space-y-3">
                            <h4 class="text-sm font-semibold">Results</h4>
                            <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                              @for (entry of architectureResults()!; track entry.component) {
                                <div class="flex items-start gap-2 rounded border px-3 py-2 text-sm"
                                  [class.border-green-300]="entry.correct"
                                  [class.bg-green-50]="entry.correct"
                                  [class.text-green-800]="entry.correct"
                                  [class.dark:bg-green-950/30]="entry.correct"
                                  [class.border-red-300]="!entry.correct"
                                  [class.bg-red-50]="!entry.correct"
                                  [class.text-red-800]="!entry.correct"
                                  [class.dark:bg-red-950/30]="!entry.correct"
                                >
                                  <ng-icon [name]="entry.correct ? 'lucideCheck' : 'lucideX'" class="mt-0.5 shrink-0" />
                                  <div class="min-w-0">
                                    <p class="font-medium truncate">{{ entry.component }}</p>
                                    @if (!entry.correct) {
                                      <p class="text-xs opacity-75">
                                        Correct tier: <span class="font-semibold capitalize">{{ entry.correctTier }}</span>
                                        @if (entry.placedTier) { · you placed: {{ entry.placedTier }} }
                                        @else { · not placed }
                                      </p>
                                    }
                                  </div>
                                </div>
                              }
                            </div>
                            <div class="flex items-center justify-between border-t pt-3">
                              <p class="text-sm font-semibold">
                                Score: {{ architectureScore() }} / {{ architectureTotalComponents() }}
                              </p>
                              <div class="flex gap-2">
                                <button hlmBtn variant="outline" size="sm" (click)="resetArchitecture()">Try Again</button>
                                <button hlmBtn variant="outline" size="sm" (click)="rerollArchitecture()">New Game</button>
                              </div>
                            </div>
                          </div>
                        } @else {
                          <div class="flex items-center gap-3">
                            <button hlmBtn (click)="submitArchitecture()" [disabled]="architectureToolbox().length > 0">
                              Submit Deployment
                            </button>
                            @if (architectureToolbox().length > 0) {
                              <p class="text-xs text-muted-foreground">
                                {{ architectureToolbox().length }} component(s) remaining in toolbox.
                              </p>
                            }
                          </div>
                        }
                      </div>
                    }

                  } @else if (activeGameMode() === 'pinpoint') {
                    <!-- ===== PINPOINT GAME ===== -->
                    @if (pinpointLoadError()) {
                      <div class="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-center text-sm text-destructive">
                        {{ pinpointLoadError() }}
                      </div>
                    } @else if (pinpointQuestions() && pinpointQuestions()!.length > 0) {
                      <div class="space-y-5">
                        <!-- Progress bar -->
                        <div class="space-y-1.5">
                          <div class="flex items-center justify-between text-xs text-muted-foreground">
                            <span>Question {{ pinpointCurrentQuestionIndex() + 1 }} of {{ pinpointQuestions()!.length }}</span>
                            <span>{{ pinpointCorrectCount() }} correct</span>
                          </div>
                          <div class="h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
                            <div class="h-full rounded-full bg-primary transition-all duration-500"
                              [style.width.%]="(pinpointCurrentQuestionIndex() / pinpointQuestions()!.length) * 100">
                            </div>
                          </div>
                        </div>

                        @if (pinpointComplete()) {
                          <div class="py-10 text-center space-y-3">
                            <div class="text-5xl">🎉</div>
                            <h4 class="text-lg font-bold">Mission Complete!</h4>
                            <p class="text-sm text-muted-foreground">
                              You got {{ pinpointCorrectCount() }} out of {{ pinpointQuestions()!.length }} correct.
                            </p>
                            <div class="flex justify-center gap-2">
                              <button hlmBtn variant="outline" (click)="resetPinpoint()">Play Again</button>
                              <button hlmBtn variant="outline" (click)="rerollPinpoint()">New Questions</button>
                            </div>
                          </div>
                        } @else if (pinpointCurrentQuestion(); as question) {
                          <!-- Clues -->
                          <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            @for (clue of [question.clue_1, question.clue_2, question.clue_3]; track $index) {
                              <div class="rounded-lg border border-border bg-muted/50 p-4">
                                <div class="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">Clue {{ $index + 1 }}</div>
                                <p class="text-sm leading-relaxed">{{ clue }}</p>
                              </div>
                            }
                          </div>

                          <!-- Answer input -->
                          <div class="space-y-2">
                            <label class="text-sm font-semibold">Your Answer</label>
                            <input
                              type="text"
                              [ngModel]="pinpointGuess"
                              (ngModelChange)="pinpointGuess = $event"
                              placeholder="What do all three clues point to?"
                              class="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50"
                              (keyup.enter)="checkPinpointAnswer()"
                              [disabled]="!!pinpointFeedback()"
                            />
                          </div>

                          @if (!pinpointFeedback()) {
                            <button hlmBtn (click)="checkPinpointAnswer()" [disabled]="!pinpointGuess.trim()">
                              Submit Answer
                            </button>
                          } @else {
                            <div class="rounded-lg border p-4 text-sm font-medium"
                              [class.border-green-300]="pinpointFeedback()!.correct"
                              [class.bg-green-50]="pinpointFeedback()!.correct"
                              [class.text-green-800]="pinpointFeedback()!.correct"
                              [class.border-red-300]="!pinpointFeedback()!.correct"
                              [class.bg-red-50]="!pinpointFeedback()!.correct"
                              [class.text-red-800]="!pinpointFeedback()!.correct"
                            >
                              {{ pinpointFeedback()!.message }}
                            </div>
                            <button hlmBtn variant="outline" (click)="advancePinpoint()">
                              @if (pinpointCurrentQuestionIndex() + 1 < pinpointQuestions()!.length) {
                                Next Question →
                              } @else {
                                See Results
                              }
                            </button>
                          }
                        }
                      </div>
                    } @else {
                      <p class="py-8 text-center text-sm text-muted-foreground">
                        No questions available for this project.
                      </p>
                    }

                  } @else if (activeContent()) {
                    <app-project-asset-content-viewer [content]="activeContent()" />

                    @if (!isActiveModuleCompleted()) {
                      <div class="mt-6 flex justify-center">
                        <button
                          hlmBtn
                          size="lg"
                          class="w-full sm:w-auto"
                          [disabled]="isCompleting()"
                          (click)="completeModule()"
                        >
                          @if (isCompleting()) {
                            <hlm-spinner class="mr-2" />
                            Saving...
                          } @else {
                            <ng-icon name="lucideCheck" class="mr-1" />
                            Complete Module
                          }
                        </button>
                      </div>
                    }
                  } @else {
                    <p class="py-4 text-center text-sm text-muted-foreground">No content available yet.</p>
                  }
                </div>
              </section>
            }

            <!-- Learning Path -->
            <section class="px-2">
              <h2 class="mb-6 text-center text-lg font-semibold tracking-tight">Learning Path</h2>
              @if (modulesLoading()) {
                <div class="flex flex-col items-center gap-4">
                  @for (_ of skeletonRows; track $index) {
                    <hlm-skeleton class="h-16 w-16 rounded-full" />
                    <hlm-skeleton class="h-8 w-1 rounded" />
                  }
                </div>
              } @else if (moduleNodes().length === 0) {
                <p class="py-8 text-center text-sm text-muted-foreground">No modules configured yet.</p>
              } @else {
                <div class="flex flex-col items-center">
                  <div class="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-green-500 text-white shadow-md">
                    <ng-icon name="lucideFlag" />
                  </div>
                  @for (node of moduleNodes(); track node.module.id; let last = $last) {
                    <div class="h-10"
                      [class.path-connector-solid]="node.status === 'completed'"
                      [class.path-connector]="node.status !== 'completed'">
                    </div>
                    <div class="flex w-full max-w-md items-center gap-4"
                      [class.flex-row]="node.index % 2 === 0"
                      [class.flex-row-reverse]="node.index % 2 !== 0">
                      <button type="button"
                        class="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full transition-transform hover:scale-110"
                        [class.node-completed]="node.status === 'completed'"
                        [class.node-current]="node.status === 'current'"
                        [class.node-locked]="node.status === 'locked'"
                        [disabled]="node.status === 'locked'"
                        (click)="openModule(node)">
                        @if (node.status === 'completed') {
                          <ng-icon name="lucideCheck" class="text-xl" />
                        } @else if (node.status === 'locked') {
                          <ng-icon name="lucideLock" class="text-lg" />
                        } @else {
                          <ng-icon [name]="node.icon" class="text-xl" />
                        }
                        @if (node.status === 'completed') {
                          <span class="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-amber-400 text-amber-900 shadow">
                            <ng-icon name="lucideStar" class="text-xs" />
                          </span>
                        }
                      </button>
                      <div class="flex-1 rounded-xl border p-3 transition-colors cursor-pointer"
                        role="button"
                        [tabindex]="node.status === 'locked' ? -1 : 0"
                        [class.border-primary/30]="node.status === 'current' || isActiveNode(node)"
                        [class.bg-primary/5]="node.status === 'current' || isActiveNode(node)"
                        [class.border-border]="node.status !== 'current' && !isActiveNode(node)"
                        (click)="openModule(node)"
                        (keydown.enter)="openModule(node)"
                        (keydown.space)="openModule(node); $event.preventDefault()">
                        <div class="flex items-center justify-between gap-2">
                          <div class="min-w-0">
                            <p class="text-sm font-semibold truncate"
                              [class.text-muted-foreground]="node.status === 'locked'"
                              [class.line-through]="node.status === 'completed'">
                              {{ node.module.title }}
                            </p>
                            <p class="text-xs text-muted-foreground">
                              {{ node.module.moduleType | titlecase }}
                              @if (node.module.estimatedDurationMinutes) {
                                · {{ node.module.estimatedDurationMinutes }} min
                              }
                            </p>
                          </div>
                          @if (node.status === 'completed') {
                            <ng-icon name="lucideCheck" class="text-green-600" />
                          } @else if (node.status === 'current') {
                            <button hlmBtn size="sm" class="shrink-0"
                              (click)="openModule(node); $event.stopPropagation()">
                              Start
                            </button>
                          }
                        </div>
                      </div>
                    </div>
                    @if (last) {
                      <div class="h-10"
                        [class.path-connector-solid]="node.status === 'completed'"
                        [class.path-connector]="node.status !== 'completed'">
                      </div>
                      <div class="flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all"
                        [class.bg-amber-400]="overallProgress() >= 100"
                        [class.text-amber-900]="overallProgress() >= 100"
                        [class.bg-muted]="overallProgress() < 100"
                        [class.text-muted-foreground]="overallProgress() < 100">
                        <ng-icon name="lucideTrophy" class="text-2xl" />
                      </div>
                      @if (overallProgress() >= 100) {
                        <p class="mt-2 text-center text-sm font-bold text-primary">Training Complete!</p>
                      } @else {
                        <p class="mt-2 text-center text-xs text-muted-foreground">
                          {{ modules().length - completedModuleCount() }} module{{ modules().length - completedModuleCount() !== 1 ? 's' : '' }} remaining
                        </p>
                      }
                    }
                  }
                </div>
              }
            </section>
          </div>

          <!-- ============ RIGHT COLUMN ============ -->
          <aside class="space-y-5">
            <!-- Leaderboard -->
            <section hlmCard class="overflow-hidden">
              <div hlmCardHeader class="pb-3">
                <div class="flex items-center gap-2">
                  <ng-icon name="lucideTrophy" class="text-amber-500" />
                  <h2 hlmCardTitle class="text-base">Leaderboard</h2>
                </div>
                <p class="text-xs text-muted-foreground">Ranked by training progress</p>
              </div>
              <div hlmCardContent class="px-4 pb-4">
                @if (assignmentsLoading()) {
                  <div class="space-y-3">
                    @for (_ of skeletonRows; track $index) {
                      <hlm-skeleton class="h-12 w-full rounded-lg" />
                    }
                  </div>
                } @else if (rankedLearners().length === 0) {
                  <p class="py-6 text-center text-sm text-muted-foreground">No learners assigned yet.</p>
                } @else {
                  <div class="space-y-1.5">
                    @for (learner of rankedLearners(); track learner.rank) {
                      <div class="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors"
                        [class.bg-primary/5]="learner.isViewer"
                        [class.border]="learner.isViewer"
                        [class.border-primary/20]="learner.isViewer">
                        <div class="flex h-7 w-7 shrink-0 items-center justify-center">
                          @if (learner.rank <= 3) {
                            <ng-icon [name]="rankIcon(learner.rank)" [class]="rankIconClass(learner.rank)" />
                          } @else {
                            <span class="text-xs font-bold text-muted-foreground">{{ learner.rank }}</span>
                          }
                        </div>
                        @if (learner.avatarUrl) {
                          <img [src]="learner.avatarUrl" [alt]="learner.displayName" class="h-8 w-8 rounded-full object-cover" />
                        } @else {
                          <div class="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-bold uppercase">
                            {{ learner.displayName.charAt(0) }}
                          </div>
                        }
                        <div class="flex-1 min-w-0">
                          <p class="text-sm font-medium truncate">
                            {{ learner.displayName }}
                            @if (learner.isViewer) { <span class="text-xs text-muted-foreground">(you)</span> }
                          </p>
                          <div class="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
                            <div class="h-full rounded-full transition-all duration-500"
                              [class.bg-amber-400]="learner.rank === 1"
                              [class.bg-slate-400]="learner.rank === 2"
                              [class.bg-amber-600]="learner.rank === 3"
                              [class.bg-primary/60]="learner.rank > 3"
                              [style.width.%]="learner.progressPct">
                            </div>
                          </div>
                        </div>
                        <div class="shrink-0 text-right">
                          <span class="text-sm font-bold tabular-nums">{{ learner.progressPct }}%</span>
                          @if (learner.status === 'completed') {
                            <p class="text-[0.6rem] font-semibold text-green-600">Done</p>
                          }
                        </div>
                      </div>
                    }
                  </div>
                }
              </div>
            </section>

            <!-- Games -->
            <section hlmCard class="overflow-hidden">
              <div hlmCardHeader class="pb-3">
                <div class="flex items-center gap-2">
                  <ng-icon name="lucideZap" class="text-blue-500" />
                  <h2 hlmCardTitle class="text-base">Games</h2>
                </div>
                <p class="text-xs text-muted-foreground">Test your knowledge</p>
              </div>
              <div hlmCardContent class="flex flex-col gap-3 px-4 pb-4">
                <button hlmBtn variant="outline"
                  class="w-full justify-center bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 dark:bg-blue-950/20 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-900/30"
                  (click)="openGame('architecture')">
                  Architecture
                </button>
                <button hlmBtn variant="outline"
                  class="w-full justify-center bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 dark:bg-blue-950/20 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-900/30"
                  (click)="openGame('pinpoint')">
                  Pinpoint
                </button>
              </div>
            </section>
          </aside>
        </div>
      }
    </div>
  `,
})
export class TrainingDetailPage implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly orgFacade = inject(OrganizationFacade);
  private readonly trainingFacade = inject(TrainingFacade);
  private readonly trainingService = inject(TrainingService);
  private readonly api = inject(ApiClient);
  protected readonly gamification = inject(GamificationFacade);
  private readonly sessionService = inject(LearningSessionService);
  private readonly mediaTracker = inject(MediaTracker);

  private activeSessionId: string | null = null;

  protected readonly circumference = 2 * Math.PI * 52;
  protected readonly skeletonRows = Array.from({ length: 4 });

  protected readonly architectureTiers: { key: ArchitectureTier; label: string }[] = [
    { key: 'frontend', label: 'Frontend Tier' },
    { key: 'application', label: 'Application Tier' },
    { key: 'data', label: 'Data Tier' },
  ];

  // ── Routing / overview ───────────────────────────────────────────────────
  private readonly trainingId = computed(() => this.route.snapshot.paramMap.get('trainingId') ?? '');
  private readonly overview = computed(() => this.trainingFacade.trainingOverview(this.trainingId()));

  protected readonly isLoading = computed(() => this.trainingFacade.trainingOverviewLoading(this.trainingId()));
  protected readonly errorMessage = computed(() => this.trainingFacade.trainingOverviewError(this.trainingId())?.message ?? null);
  protected readonly training = computed<Training | null>(() => this.overview()?.training ?? null);
  protected readonly modules = computed<readonly TrainingModule[]>(() => this.overview()?.modules ?? []);
  protected readonly viewerAssignment = computed<TrainingAssignment | null>(() => this.overview()?.viewerAssignment ?? null);
  protected readonly allAssignments = computed<readonly TrainingAssignment[]>(() => this.overview()?.assignments ?? []);
  protected readonly assignments = computed<readonly TrainingAssignment[]>(() => {
    const overview = this.overview();
    if (!overview) return [];
    if (this.orgFacade.isAdmin()) return overview.assignments;
    return overview.viewerAssignment ? [overview.viewerAssignment] : [];
  });
  protected readonly viewerProgress = computed(() => this.overview()?.viewerProgress ?? []);
  protected readonly modulesLoading = this.isLoading;
  protected readonly assignmentsLoading = this.isLoading;

  protected readonly quizAccuracy = computed(() => this.gamification.profile()?.quizAccuracyPct ?? 0);
  protected readonly levelProgressPct = computed(() => {
    const p = this.gamification.profile();
    if (!p) return 0;
    const currentLevelXp = (p.level - 1) ** 2 * 100;
    const nextLevelXp = p.level ** 2 * 100;
    const range = nextLevelXp - currentLevelXp;
    if (range <= 0) return 100;
    return Math.min(100, Math.round(((p.totalXp - currentLevelXp) / range) * 100));
  });

  protected readonly rankedLearners = computed<readonly RankedLearner[]>(() => {
    const overview = this.overview();
    if (!overview) return [];
    const entries = overview.leaderboard.slice().sort((a, b) => b.progressPct - a.progressPct);
    const viewerId = overview.viewerAssignment?.userId;
    return entries.map((entry, i) => ({
      rank: i + 1,
      displayName: entry.displayName || entry.userId.substring(0, 8),
      avatarUrl: entry.avatarUrl,
      progressPct: entry.progressPct,
      status: entry.status,
      isViewer: entry.userId === viewerId,
    }));
  });

  // ── Module viewer state ──────────────────────────────────────────────────
  protected readonly activeModule = signal<TrainingModule | null>(null);
  protected readonly activeContent = signal<ProjectAssetContent | null>(null);
  protected readonly activeGameMode = signal<GameMode>(null);
  protected readonly contentLoading = signal(false);
  protected readonly isCompleting = signal(false);

  // ── Architecture game state ──────────────────────────────────────────────
  protected readonly architectureApiData = signal<ArchitectureResponse | null>(null);
  protected readonly architectureLoadError = signal<string | null>(null);
  protected readonly architectureToolbox = signal<string[]>([]);
  protected readonly architecturePlacement = signal<ArchitecturePlacement>({ frontend: [], application: [], data: [] });
  protected readonly architectureResults = signal<ArchitectureResultEntry[] | null>(null);

  protected readonly architectureTotalComponents = computed(() => {
    const d = this.architectureApiData();
    if (!d) return 0;
    return (d.frontend?.length ?? 0) + (d.application?.length ?? 0) + (d.data?.length ?? 0);
  });
  protected readonly architectureScore = computed(() => this.architectureResults()?.filter(r => r.correct).length ?? 0);

  private draggedComponent: string | null = null;
  private draggedFromTier: ArchitectureTier | null = null;

  // ── Pinpoint game state ──────────────────────────────────────────────────
  protected readonly pinpointQuestions = signal<PinpointQuestion[] | null>(null);
  protected readonly pinpointLoadError = signal<string | null>(null);
  protected readonly pinpointCurrentQuestionIndex = signal(0);
  protected readonly pinpointCorrectCount = signal(0);
  protected readonly pinpointComplete = signal(false);
  protected readonly pinpointFeedback = signal<{ message: string; correct: boolean } | null>(null);

  protected pinpointGuess = '';

  protected readonly pinpointCurrentQuestion = computed<PinpointQuestion | null>(() =>
    this.pinpointQuestions()?.[this.pinpointCurrentQuestionIndex()] ?? null,
  );

  protected readonly backLink = computed(() => {
    const orgSlug = this.orgFacade.activeOrgSlug();
    return `/${orgSlug}/training`;
  });

  protected readonly completedIds = computed<ReadonlySet<string>>(
    () => new Set(this.viewerProgress().filter(p => p.status === 'completed').map(p => p.moduleId)),
  );
  protected readonly isActiveModuleCompleted = computed(() => {
    const activeModule = this.activeModule();
    return activeModule ? this.completedIds().has(activeModule.id) : false;
  });
  protected readonly completedModuleCount = computed(() => this.completedIds().size);
  protected readonly overallProgress = computed(() => {
    const assignment = this.viewerAssignment();
    if (assignment) return assignment.progressPct;
    const total = this.modules().length;
    if (total === 0) return 0;
    return Math.round((this.completedModuleCount() / total) * 100);
  });
  protected readonly progressOffset = computed(() => this.circumference * (1 - this.overallProgress() / 100));
  protected readonly dueLabel = computed(() => {
    const withDue = this.assignments().filter(x => x.dueDate);
    if (withDue.length === 0) return null;
    const earliest = withDue.reduce((min, x) => (x.dueDate! < min.dueDate! ? x : min));
    return this.formatDate(earliest.dueDate!);
  });

  protected readonly moduleNodes = computed<ModuleNode[]>(() => {
    const mods = this.modules();
    const done = this.completedIds();
    let firstIncomplete = mods.length;
    for (let i = 0; i < mods.length; i++) {
      if (!done.has(mods[i].id)) { firstIncomplete = i; break; }
    }
    return mods.map((mod, i) => {
      const status: ModuleNodeStatus = done.has(mod.id) ? 'completed' : i === firstIncomplete ? 'current' : 'locked';
      return { module: mod, index: i, status, icon: MODULE_ICON[mod.moduleType] ?? 'lucideFileText' };
    });
  });

  private get myAssignment(): TrainingAssignment | null { return this.viewerAssignment(); }

  // ── Game entry ───────────────────────────────────────────────────────────

  protected openGame(mode: GameMode): void {
    this.mediaTracker.detach();
    this.activeModule.set(null);
    this.activeContent.set(null);
    this.activeGameMode.set(mode);
    this.contentLoading.set(true);

    if (mode === 'architecture') this.loadArchitectureData();
    else if (mode === 'pinpoint') this.loadPinpointQuestions();

    setTimeout(() => {
      document
        .querySelector('app-training-detail-page section[hlmCard].border-primary\\/30')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }

  // ── Architecture ─────────────────────────────────────────────────────────

  private loadArchitectureData(): void {
    const projectId = this.training()?.projectId;
    if (!projectId) {
      this.architectureLoadError.set('No project ID available.');
      this.contentLoading.set(false);
      return;
    }
    this.architectureLoadError.set(null);
    this.architectureResults.set(null);

    this.api.get<ArchitectureResponse>(`/api/v1/architecture/${projectId}`)
      .then(result => {
        const d = result.data;
        const hasComponents = d && (
          (d.frontend?.length ?? 0) + (d.application?.length ?? 0) + (d.data?.length ?? 0) > 0
        );
        if (hasComponents) {
          this.applyArchitectureData(d!);
          this.contentLoading.set(false);
          return undefined;
        } else {
          return this.generateArchitectureWithRetry(projectId, 3);
        }
      })
      .catch(() => {
        this.architectureLoadError.set('Failed to load architecture data.');
        this.contentLoading.set(false);
      });
  }

  private async generateArchitectureWithRetry(projectId: string, attemptsLeft: number): Promise<void> {
    try {
      const genResult = await this.api.post<ArchitectureResponse>('/api/v1/architecture/generate', { project_id: projectId });
      if (genResult.data) {
        this.applyArchitectureData(genResult.data);
      } else {
        throw new Error('Empty response');
      }
    } catch {
      if (attemptsLeft > 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return this.generateArchitectureWithRetry(projectId, attemptsLeft - 1);
      }
      this.architectureLoadError.set('Could not generate architecture data for this project.');
    } finally {
      this.contentLoading.set(false);
    }
  }

  private applyArchitectureData(d: ArchitectureResponse): void {
    this.architectureApiData.set(d);
    const all = [...(d.frontend ?? []), ...(d.application ?? []), ...(d.data ?? [])];
    this.architectureToolbox.set(this.shuffle(all));
    this.architecturePlacement.set({ frontend: [], application: [], data: [] });
  }

  protected dragStart(event: DragEvent, component: string): void {
    this.draggedComponent = component;
    this.draggedFromTier = null;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', component);
    }
  }

  protected dragStartFromTier(event: DragEvent, component: string, tier: ArchitectureTier): void {
    this.draggedComponent = component;
    this.draggedFromTier = tier;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', component);
    }
  }

  protected dragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    (event.currentTarget as HTMLElement).classList.add('drag-over');
  }

  protected dragLeave(event: DragEvent): void {
    event.preventDefault();
    (event.currentTarget as HTMLElement).classList.remove('drag-over');
  }

  protected dropComponent(event: DragEvent, targetTier: ArchitectureTier): void {
    event.preventDefault();
    (event.currentTarget as HTMLElement).classList.remove('drag-over');

    const comp = this.draggedComponent;
    if (!comp) return;

    if (this.draggedFromTier) {
      this.architecturePlacement.update(p => ({
        ...p,
        [this.draggedFromTier!]: p[this.draggedFromTier!].filter(c => c !== comp),
      }));
    } else {
      this.architectureToolbox.update(t => t.filter(c => c !== comp));
    }

    this.architecturePlacement.update(p => ({
      ...p,
      [targetTier]: p[targetTier].includes(comp) ? p[targetTier] : [...p[targetTier], comp],
    }));

    this.draggedComponent = null;
    this.draggedFromTier = null;
  }

  protected removeFromTier(component: string, tier: ArchitectureTier): void {
    this.architecturePlacement.update(p => ({ ...p, [tier]: p[tier].filter(c => c !== component) }));
    this.architectureToolbox.update(t => [...t, component]);
  }

  protected submitArchitecture(): void {
    const apiData = this.architectureApiData();
    if (!apiData) return;

    const placement = this.architecturePlacement();
    const tiers: ArchitectureTier[] = ['frontend', 'application', 'data'];
    const results: ArchitectureResultEntry[] = [];

    for (const tier of tiers) {
      for (const comp of apiData[tier] ?? []) {
        const placedTier = tiers.find(t => placement[t].includes(comp)) ?? null;
        results.push({ component: comp, correctTier: tier, placedTier, correct: placedTier === tier });
      }
    }

    this.architectureResults.set(results);
  }

  /** Replay the same data, reset placement */
  protected resetArchitecture(): void {
    const apiData = this.architectureApiData();
    if (!apiData) return;
    const all = [...(apiData.frontend ?? []), ...(apiData.application ?? []), ...(apiData.data ?? [])];
    this.architectureToolbox.set(this.shuffle(all));
    this.architecturePlacement.set({ frontend: [], application: [], data: [] });
    this.architectureResults.set(null);
  }

  /** Generate a brand-new set of components from the server */
  protected rerollArchitecture(): void {
    const projectId = this.training()?.projectId;
    if (!projectId) return;
    this.architectureLoadError.set(null);
    this.architectureResults.set(null);
    this.contentLoading.set(true);
    this.generateArchitectureWithRetry(projectId, 3);
  }

  // ── Pinpoint ─────────────────────────────────────────────────────────────

  private loadPinpointQuestions(): void {
    const projectId = this.training()?.projectId;
    if (!projectId) {
      this.pinpointLoadError.set('No project ID available.');
      this.contentLoading.set(false);
      return;
    }
    this.pinpointLoadError.set(null);

    this.api.get<PinpointGenerationResponse>(`/api/v1/pinpoint/${projectId}`)
      .then(result => {
        if (result.data?.questions?.length) {
          this.pinpointQuestions.set(result.data.questions);
          this.resetPinpointState();
          this.contentLoading.set(false);
          return undefined;
        } else {
          return this.generatePinpointWithRetry(projectId, 3);
        }
      })
      .catch(() => {
        this.pinpointLoadError.set('Failed to load questions.');
        this.contentLoading.set(false);
      });
  }

  private async generatePinpointWithRetry(projectId: string, attemptsLeft: number): Promise<void> {
    try {
      const genResult = await this.api.post<PinpointGenerationResponse>('/api/v1/pinpoint/generate', { project_id: projectId });
      if (genResult.data?.questions?.length) {
        this.pinpointQuestions.set(genResult.data.questions);
        this.resetPinpointState();
      } else {
        throw new Error('Empty response');
      }
    } catch {
      if (attemptsLeft > 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return this.generatePinpointWithRetry(projectId, attemptsLeft - 1);
      }
      this.pinpointQuestions.set([]);
      this.pinpointLoadError.set('Could not generate questions for this project.');
    } finally {
      this.contentLoading.set(false);
    }
  }

  protected checkPinpointAnswer(): void {
    const guess = this.pinpointGuess.toLowerCase().trim();
    const question = this.pinpointCurrentQuestion();
    if (!question || !guess) return;

    const correct = guess === question.answer.toLowerCase().trim();
    if (correct) this.pinpointCorrectCount.update(n => n + 1);

    this.pinpointFeedback.set({
      message: correct
        ? `✓ Correct! The answer was "${question.answer}".`
        : `✗ Not quite. The answer was "${question.answer}".`,
      correct,
    });
  }

  protected advancePinpoint(): void {
    const questions = this.pinpointQuestions();
    if (!questions) return;

    const next = this.pinpointCurrentQuestionIndex() + 1;
    this.pinpointFeedback.set(null);
    this.pinpointGuess = '';

    if (next >= questions.length) {
      this.pinpointComplete.set(true);
    } else {
      this.pinpointCurrentQuestionIndex.set(next);
    }
  }

  /** Replay the same questions from the top */
  protected resetPinpoint(): void {
    this.resetPinpointState();
  }

  /** Generate brand-new questions from the server */
  protected rerollPinpoint(): void {
    const projectId = this.training()?.projectId;
    if (!projectId) return;
    this.pinpointLoadError.set(null);
    this.contentLoading.set(true);
    this.generatePinpointWithRetry(projectId, 3);
  }

  private resetPinpointState(): void {
    this.pinpointCurrentQuestionIndex.set(0);
    this.pinpointCorrectCount.set(0);
    this.pinpointComplete.set(false);
    this.pinpointFeedback.set(null);
    this.pinpointGuess = '';
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  async ngOnInit(): Promise<void> {
    const trainingId = this.trainingId();
    if (!trainingId) return;
    await Promise.all([
      this.trainingFacade.ensureTrainingOverview(trainingId),
      this.gamification.loadProfile(),
    ]);
  }

  ngOnDestroy(): void {
    this.mediaTracker.detach();
    void this.endLearningSession();
  }

  // ── Module helpers ───────────────────────────────────────────────────────

  protected moduleIcon(type: string): string { return MODULE_ICON[type] ?? 'lucideFileText'; }
  protected rankIcon(rank: number): string { return RANK_ICON[rank] ?? 'lucideStar'; }
  protected rankIconClass(rank: number): string {
    switch (rank) {
      case 1: return 'text-amber-400 text-lg';
      case 2: return 'text-slate-400 text-lg';
      case 3: return 'text-amber-600 text-lg';
      default: return 'text-muted-foreground';
    }
  }

  protected isActiveNode(node: ModuleNode): boolean { return this.activeModule()?.id === node.module.id; }

  protected async openModule(node: ModuleNode): Promise<void> {
    if (node.status === 'locked') return;

    const mod = node.module;
    this.mediaTracker.detach();
    this.activeModule.set(mod);
    this.activeContent.set(null);
    this.activeGameMode.set(null);
    this.contentLoading.set(true);

    const projectId = this.training()?.projectId;
    if (!projectId) { this.contentLoading.set(false); return; }

    await this.startLearningSession();

    const content = await this.fetchModuleContent(mod.moduleType, projectId);
    this.contentLoading.set(false);
    this.activeContent.set(content);

    if (mod.moduleType === 'audio' && this.activeSessionId) this.attachAudioTracker(mod.id);
    if (mod.moduleType === 'video' && this.activeSessionId) this.attachVideoTracker(mod.id);

    setTimeout(() => {
      document
        .querySelector('app-training-detail-page section[hlmCard].border-primary\\/30')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }

  protected async closeModule(): Promise<void> {
    this.mediaTracker.detach();
    await this.endLearningSession();
    this.activeModule.set(null);
    this.activeContent.set(null);
    this.activeGameMode.set(null);
  }

  protected async completeModule(): Promise<void> {
    const mod = this.activeModule();
    const assignment = this.myAssignment;
    if (!mod || !assignment || this.completedIds().has(mod.id)) return;

    this.isCompleting.set(true);
    const result = await this.trainingService.updateProgress(assignment.id, mod.id, { status: 'completed', progressPct: 100 });
    this.isCompleting.set(false);

    if (!result.errorMessage) {
      this.mediaTracker.detach();
      await this.endLearningSession();
      await Promise.all([
        this.trainingFacade.ensureTrainingOverview(this.trainingId(), { force: true }),
        this.gamification.loadProfile(),
      ]);
      this.activeModule.set(null);
      this.activeContent.set(null);
    }
  }

  private async startLearningSession(): Promise<void> {
    if (this.activeSessionId) return;
    const trainingId = this.trainingId();
    if (!trainingId) return;
    const result = await this.sessionService.startSession(trainingId);
    this.activeSessionId = result.data?.id ?? null;
  }

  private async endLearningSession(): Promise<void> {
    if (!this.activeSessionId) return;
    await this.sessionService.endSession(this.activeSessionId);
    this.activeSessionId = null;
  }

  private attachAudioTracker(moduleId: string): void {
    if (!this.activeSessionId) return;
    this.mediaTracker.attach({ sessionId: this.activeSessionId, stepId: moduleId, mediaType: 'audio' });
    setTimeout(() => {
      const audio = document.querySelector<HTMLAudioElement>('app-training-detail-page audio');
      if (!audio) return;
      audio.addEventListener('play', () => this.mediaTracker.onPlay(audio.currentTime));
      audio.addEventListener('pause', () => this.mediaTracker.onPause(audio.currentTime));
      audio.addEventListener('seeked', () => this.mediaTracker.onSeek(audio.currentTime, audio.currentTime));
      audio.addEventListener('ended', () => this.mediaTracker.onPlaybackEnd(audio.duration));
      audio.addEventListener('timeupdate', () => this.mediaTracker.updatePosition(audio.currentTime));
    }, 100);
  }

  private attachVideoTracker(moduleId: string): void {
    if (!this.activeSessionId) return;
    this.mediaTracker.attach({ sessionId: this.activeSessionId, stepId: moduleId, mediaType: 'video' });
    setTimeout(() => {
      const video = document.querySelector<HTMLVideoElement>('app-training-detail-page video');
      if (!video) return;
      video.addEventListener('play', () => this.mediaTracker.onPlay(video.currentTime));
      video.addEventListener('pause', () => this.mediaTracker.onPause(video.currentTime));
      video.addEventListener('seeked', () => this.mediaTracker.onSeek(video.currentTime, video.currentTime));
      video.addEventListener('ended', () => this.mediaTracker.onPlaybackEnd(video.duration));
      video.addEventListener('timeupdate', () => this.mediaTracker.updatePosition(video.currentTime));
    }, 100);
  }

  private async fetchModuleContent(
    type: string,
    projectId: string,
  ): Promise<ProjectAssetContent | null> {
    switch (type) {
      case 'summary': {
        const r = await this.api.get<{ content: string | null }>(`/api/v1/summarization/${projectId}`);
        return r.data ? { type, text: r.data.content, imageUrl: null, audioUrl: null, audioFormat: null, videoUrl: null } : null;
      }
      case 'infographic': {
        const r = await this.api.get<{ image_url: string | null; infographic_text: string | null }>(`/api/v1/infographics/${projectId}`);
        return r.data ? { type, text: r.data.infographic_text, imageUrl: r.data.image_url, audioUrl: null, audioFormat: null, videoUrl: null } : null;
      }
      case 'mindmap': {
        const r = await this.api.get<{ mermaid: string | null }>(`/api/v1/mindmap/${projectId}`);
        return r.data ? { type, text: r.data.mermaid, imageUrl: null, audioUrl: null, audioFormat: null, videoUrl: null } : null;
      }
      case 'audio': {
        const r = await this.api.get<{ audio_url: string | null; script: string | null; format: string }>(`/api/v1/tts/${projectId}`);
        return r.data ? { type, text: r.data.script, imageUrl: null, audioUrl: r.data.audio_url, audioFormat: r.data.format, videoUrl: null } : null;
      }
      case 'video': {
        const r = await this.api.get<{ video_url: string | null }>(`/api/v1/video/${projectId}`);
        return r.data ? { type, text: null, imageUrl: null, audioUrl: null, audioFormat: null, videoUrl: r.data.video_url } : null;
      }
      default:
        return { type, text: null, imageUrl: null, audioUrl: null, audioFormat: null, videoUrl: null };
    }
  }

  protected formatDate(iso: string): string {
    const ts = Date.parse(iso);
    if (Number.isNaN(ts)) return '';
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(ts);
  }

  private shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}
