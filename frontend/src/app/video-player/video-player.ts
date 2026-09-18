import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeft,
  lucideCircleAlert,
  lucideExternalLink,
  lucideFileText,
  lucideGitBranch,
  lucideGithub,
  lucideMaximize,
  lucidePlay,
  lucideSettings,
  lucideSkipBack,
  lucideSubtitles,
  lucideX,
} from '@ng-icons/lucide';
import { HlmAlertImports } from '@app/ui/alert';
import { HlmButtonImports } from '@app/ui/button';
import { HlmCardImports } from '@app/ui/card';
import { HlmDialogImports } from '@app/ui/dialog';
import { HlmEmptyImports } from '@app/ui/empty';
import { HlmIconImports } from '@app/ui/icon';
import { HlmSkeletonImports } from '@app/ui/skeleton';
import { OrganizationFacade } from '../services/organization.facade';
import { TrainingPlayerFacade } from '../services/training-player.facade';
import { AccentProgressBar } from '../shared/ui/accent-progress-bar';
import { TrainingCoverImage } from '../shared/ui/training-cover-image';
import {
  TRAINING_LIBRARY_EMPTY_STATE,
  TRAINING_RESOURCES_EMPTY_STATE,
  type TrainingPlayerViewModel,
} from './video-player.models';

type DialogState = 'open' | 'closed';

@Component({
  selector: 'app-video-player',
  imports: [
    RouterLink,
    NgIcon,
    HlmAlertImports,
    HlmButtonImports,
    HlmCardImports,
    HlmDialogImports,
    HlmEmptyImports,
    HlmIconImports,
    HlmSkeletonImports,
    AccentProgressBar,
    TrainingCoverImage,
  ],
  providers: [
    provideIcons({
      lucideArrowLeft,
      lucideCircleAlert,
      lucideExternalLink,
      lucideFileText,
      lucideGitBranch,
      lucideGithub,
      lucideMaximize,
      lucidePlay,
      lucideSettings,
      lucideSkipBack,
      lucideSubtitles,
      lucideX,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './video-player.html',
})
export class VideoPlayer {
  protected readonly orgFacade = inject(OrganizationFacade);
  protected readonly trainingPlayerFacade = inject(TrainingPlayerFacade);

  protected readonly selectedTrainingId = signal<string | null>(null);
  protected readonly previewTraining = signal<TrainingPlayerViewModel | null>(null);

  protected readonly trainingLibrary = this.trainingPlayerFacade.trainingLibrary;
  protected readonly isLoading = this.trainingPlayerFacade.isLoading;
  protected readonly errorMessage = this.trainingPlayerFacade.errorMessage;
  protected readonly emptyState = TRAINING_LIBRARY_EMPTY_STATE;
  protected readonly resourcesEmptyState = TRAINING_RESOURCES_EMPTY_STATE;
  protected readonly sidebarSkeletons = Array.from({ length: 3 });
  protected readonly metadataSkeletons = Array.from({ length: 3 });

  protected readonly dashboardLink = computed<readonly string[]>(() => {
    const orgSlug = this.orgFacade.activeOrgSlug();
    return orgSlug ? ['/', orgSlug, 'dashboard'] : ['/no-organization'];
  });

  protected readonly activeTraining = computed(() => {
    const trainingLibrary = this.trainingLibrary();
    const selectedTrainingId = this.selectedTrainingId();

    return (
      trainingLibrary.find((training) => training.id === selectedTrainingId) ??
      trainingLibrary[0] ??
      null
    );
  });

  protected readonly upNextTrainings = computed(() => {
    const activeTraining = this.activeTraining();
    if (!activeTraining) return [];
    return this.trainingLibrary().filter((training) => training.id !== activeTraining.id);
  });

  protected selectTraining(trainingId: string): void {
    this.selectedTrainingId.set(trainingId);
  }

  protected openPreview(training: TrainingPlayerViewModel | null): void {
    if (!training) return;
    this.previewTraining.set(training);
  }

  protected handlePreviewStateChange(state: DialogState): void {
    if (state === 'closed') {
      this.previewTraining.set(null);
    }
  }

  protected projectLink(projectId: string): readonly string[] {
    const orgSlug = this.orgFacade.activeOrgSlug();
    return orgSlug ? ['/', orgSlug, 'projects', projectId] : ['/no-organization'];
  }

  protected resourceIconName(kind: string): string {
    switch (kind) {
      case 'video':
        return 'lucidePlay';
      case 'audio':
        return 'lucideHeadphones';
      case 'document':
        return 'lucideFileText';
      case 'quiz':
        return 'lucideClipboardCheck';
      default:
        return 'lucideFile';
    }
  }
}
