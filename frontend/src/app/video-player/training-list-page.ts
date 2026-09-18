import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCircleAlert } from '@ng-icons/lucide';
import { HlmAlertImports } from '@app/ui/alert';
import { TrainingCardGrid } from '../shared/ui/training-card-grid/training-card-grid';
import { OrganizationFacade } from '../services/organization.facade';
import {
  isViewerAssignedToTraining,
  toTrainingCardViewModel,
  TRAINING_MANAGER_EMPTY_STATE,
  TRAINING_ASSIGNED_EMPTY_STATE,
  type TrainingEmptyStateViewModel,
  type TrainingCardViewModel,
} from '../domain/training-presentation';
import { TrainingFacade } from '../services/training.facade';

@Component({
  selector: 'app-training-list-page',
  standalone: true,
  imports: [NgIcon, HlmAlertImports, TrainingCardGrid],
  providers: [provideIcons({ lucideCircleAlert })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-7xl space-y-8 px-4 pb-16 sm:px-6 lg:px-8">
      <header class="space-y-2 pt-6">
        <h1 class="text-3xl font-semibold tracking-tight">Trainings</h1>
      </header>

      @if (errorMessage()) {
        <div hlmAlert variant="destructive">
          <ng-icon hlm hlmAlertIcon name="lucideCircleAlert" />
          <p hlmAlertDescription>{{ errorMessage() }}</p>
        </div>
      }

      <app-training-card-grid
        [trainings]="trainings()"
        [isLoading]="isLoading()"
        [emptyState]="emptyState()"
        [columns]="3"
        [linkFn]="trainingLinkFn"
      />
    </div>
  `,
})
export class TrainingListPage {
  private readonly trainingFacade = inject(TrainingFacade);
  private readonly orgFacade = inject(OrganizationFacade);

  protected readonly emptyState = computed<TrainingEmptyStateViewModel>(() =>
    this.orgFacade.isAdmin() ? TRAINING_MANAGER_EMPTY_STATE : TRAINING_ASSIGNED_EMPTY_STATE,
  );
  protected readonly trainings = computed(() => {
    const viewerMode = this.orgFacade.isAdmin() ? 'admin' : 'member';
    return this.trainingFacade
      .organizationTrainings()
      .filter((training) => viewerMode === 'admin' || isViewerAssignedToTraining(training))
      .map((training) => toTrainingCardViewModel(training, viewerMode));
  });
  protected readonly isLoading = this.trainingFacade.organizationTrainingsLoading;
  protected readonly errorMessage = computed(
    () => this.trainingFacade.organizationTrainingsError()?.message ?? null,
  );

  protected readonly trainingLinkFn = (training: TrainingCardViewModel): string => {
    const orgSlug = this.orgFacade.activeOrgSlug();
    return `/${orgSlug}/projects/${training.projectId}/trainings/${training.id}`;
  };
}
