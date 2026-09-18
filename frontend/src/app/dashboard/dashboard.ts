import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCircleAlert, lucidePlay, lucideVideo, lucideX } from '@ng-icons/lucide';
import { HlmAlertImports } from '@app/ui/alert';
import { HlmButtonImports } from '@app/ui/button';
import { HlmCardImports } from '@app/ui/card';
import { HlmDialogImports } from '@app/ui/dialog';
import { HlmSkeletonImports } from '@app/ui/skeleton';
import { AuthFacade } from '../services/auth.facade';
import { OrganizationFacade } from '../services/organization.facade';
import { ProfileFacade } from '../services/profile.facade';
import { DashboardFacade } from '../services/dashboard.facade';
import {
  TRAINING_MANAGER_EMPTY_STATE,
  TRAINING_PUBLISHED_EMPTY_STATE,
  type TrainingCardViewModel,
} from '../domain/training-presentation';
import type { DashboardAccentTone } from './dashboard.models';
import { getDashboardWelcomeIdentity } from './dashboard.presentation';
import { TrainingCardGrid } from '../shared/ui/training-card-grid/training-card-grid';
import { TrainingCoverImage } from '../shared/ui/training-cover-image';

type DialogState = 'open' | 'closed';

@Component({
  selector: 'app-dashboard',
  imports: [
    NgIcon,
    HlmAlertImports,
    HlmButtonImports,
    HlmCardImports,
    HlmDialogImports,
    HlmSkeletonImports,
    TrainingCardGrid,
    TrainingCoverImage,
  ],
  providers: [
    provideIcons({
      lucideCircleAlert,
      lucidePlay,
      lucideVideo,
      lucideX,
    }),
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dashboard {
  private readonly authFacade = inject(AuthFacade);
  protected readonly dashboardFacade = inject(DashboardFacade);
  protected readonly orgFacade = inject(OrganizationFacade);
  private readonly profileFacade = inject(ProfileFacade);

  private readonly overallDonut = viewChild<ElementRef<HTMLDivElement>>('overallDonut');

  protected readonly previewTraining = signal<TrainingCardViewModel | null>(null);

  protected readonly managerEmptyState = TRAINING_MANAGER_EMPTY_STATE;
  protected readonly inProgressEmptyState = TRAINING_PUBLISHED_EMPTY_STATE;
  protected readonly summaryCards = this.dashboardFacade.managerSummaryCards;
  protected readonly overallProgress = this.dashboardFacade.overallProgress;
  protected readonly dashboardError = this.dashboardFacade.errorMessage;
  protected readonly isLoading = this.dashboardFacade.isLoading;
  protected readonly welcomeIdentity = computed(() =>
    getDashboardWelcomeIdentity(
      this.orgFacade.activeRole(),
      this.profileFacade.profile()?.displayName,
      this.authFacade.user()?.email,
    ),
  );
  protected readonly summarySkeletons = Array.from({ length: 2 });
  protected readonly managerTrainings = this.dashboardFacade.managerTrainings;
  protected readonly inProgressInternTrainings = this.dashboardFacade.internInProgressTrainings;

  constructor() {
    effect(() => {
      if (this.orgFacade.isAdmin()) {
        return;
      }

      const overallDonut = this.overallDonut();
      if (!overallDonut) return;

      this.renderFullDonut(overallDonut, this.overallProgress(), 'ocean');
    });
  }

  protected openPreview(training: TrainingCardViewModel): void {
    this.previewTraining.set(training);
  }

  protected readonly trainingLinkFn = (training: TrainingCardViewModel): string => {
    const orgSlug = this.orgFacade.activeOrgSlug();
    return `/${orgSlug}/projects/${training.projectId}/trainings/${training.id}`;
  };

  protected resumeTraining(): void {
    const nextTraining = this.dashboardFacade.internInProgressTrainings()[0];
    if (!nextTraining) return;
    this.openPreview(nextTraining);
  }

  protected handlePreviewStateChange(state: DialogState): void {
    if (state === 'closed') {
      this.previewTraining.set(null);
    }
  }

  private renderFullDonut(
    element: ElementRef<HTMLDivElement>,
    percent: number,
    tone: DashboardAccentTone,
  ): void {
    const size = 80;
    const stroke = 8;
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference * (1 - percent / 100);
    const gradientId = `g-full-${tone}`;

    element.nativeElement.innerHTML = `
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
        <defs>
          <linearGradient id="${gradientId}" x1="0" x2="1">
            <stop offset="0%" style="stop-color: var(--dashboard-accent-${tone}-start)" />
            <stop offset="100%" style="stop-color: var(--dashboard-accent-${tone}-end)" />
          </linearGradient>
        </defs>
        <g transform="rotate(-90 ${size / 2} ${size / 2})">
          <circle
            cx="${size / 2}"
            cy="${size / 2}"
            r="${radius}"
            fill="none"
            stroke-width="${stroke}"
            style="stroke: var(--dashboard-donut-track)"
          />
          <circle
            cx="${size / 2}"
            cy="${size / 2}"
            r="${radius}"
            fill="none"
            stroke="url(#${gradientId})"
            stroke-dasharray="${circumference}"
            stroke-dashoffset="${offset}"
            stroke-linecap="round"
            stroke-width="${stroke}"
          />
        </g>
      </svg>
    `;
  }
}
