import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideSearch } from '@ng-icons/lucide';
import { HlmCardImports } from '@app/ui/card';
import { HlmEmptyImports } from '@app/ui/empty';
import { HlmInputImports } from '@app/ui/input';
import { HlmSelectImports } from '@app/ui/select';
import { HlmSkeletonImports } from '@app/ui/skeleton';
import { AccentProgressBar } from '../accent-progress-bar';
import { TrainingCoverImage } from '../training-cover-image';
import {
  compareTrainingCards,
  isTrainingSortOption,
  matchesTrainingCardQuery,
  TRAINING_SORT_OPTIONS,
  type TrainingCardViewModel,
  type TrainingEmptyStateViewModel,
  type TrainingSortOption,
  type TrainingSortOptionViewModel,
} from '../../../domain/training-presentation';

@Component({
  selector: 'app-training-card-grid',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    NgIcon,
    HlmCardImports,
    HlmEmptyImports,
    HlmInputImports,
    HlmSelectImports,
    HlmSkeletonImports,
    AccentProgressBar,
    TrainingCoverImage,
  ],
  providers: [provideIcons({ lucideSearch })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
      <hlm-select [ngModel]="sortValue()" (ngModelChange)="onSortChange($event)">
        <hlm-select-trigger class="w-full min-w-52 bg-card/80 sm:w-56">
          <hlm-select-value />
        </hlm-select-trigger>
        <hlm-select-content>
          @for (option of sortOptions(); track option.value) {
            <hlm-option [value]="option.value">{{ option.label }}</hlm-option>
          }
        </hlm-select-content>
      </hlm-select>

      <div class="relative w-full sm:w-64">
        <ng-icon
          name="lucideSearch"
          class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          hlmInput
          type="search"
          class="w-full bg-card/80 pl-9"
          placeholder="Search trainings"
          [ngModel]="searchValue()"
          (ngModelChange)="searchValue.set($event)"
        />
      </div>

      <ng-content select="[toolbar-actions]" />
    </div>

    @if (isLoading()) {
      <div
        class="mt-6 grid gap-6"
        [class.md:grid-cols-2]="true"
        [class.xl:grid-cols-3]="columns() === 3"
        [class.xl:grid-cols-4]="columns() === 4"
        role="status"
        aria-label="Loading trainings"
      >
        @for (_ of skeletons(); track $index) {
          <section hlmCard class="training-card overflow-hidden border-0 shadow-lg">
            <hlm-skeleton class="h-48 w-full rounded-none" />
            <div class="space-y-4 p-5">
              <hlm-skeleton class="h-6 w-40" />
              <hlm-skeleton class="h-4 w-full" />
              <hlm-skeleton class="h-4 w-32" />
              <hlm-skeleton class="h-3 w-full rounded-full" />
            </div>
          </section>
        }
      </div>
    } @else if (displayTrainings().length > 0) {
      <div
        class="mt-6 grid gap-6"
        [class.md:grid-cols-2]="true"
        [class.xl:grid-cols-3]="columns() === 3"
        [class.xl:grid-cols-4]="columns() === 4"
      >
        @for (training of displayTrainings(); track training.id) {
          <article
            hlmCard
            class="training-card flex h-full overflow-hidden border-0 shadow-lg cursor-pointer py-0 gap-0"
            [attr.data-tone]="training.accent"
            [routerLink]="linkFn()(training)"
          >
            <div class="relative">
              <app-training-cover-image
                [imageUrl]="training.imageUrl"
                [imageAlt]="training.imageAlt"
                [imageStatus]="training.coverImageStatus"
                imageClass="training-image aspect-video w-full object-cover"
                placeholderClass="training-image aspect-video w-full"
              />
              @if (training.imageUrl) {
                <div class="image-overlay" aria-hidden="true"></div>
              }
            </div>

            <div hlmCardContent class="card-panel flex min-h-[13rem] flex-1 flex-col gap-4 p-5">
              <div class="space-y-2">
                <h3 class="min-h-14 text-lg font-semibold leading-7 tracking-tight line-clamp-2">
                  {{ training.title }}
                </h3>
                <p
                  class="min-h-12 text-sm leading-6 text-muted-foreground line-clamp-2"
                  [class.invisible]="!training.description"
                  [attr.aria-hidden]="training.description ? null : 'true'"
                >
                  {{ training.description || '' }}
                </p>
              </div>

              <div class="mt-auto space-y-2">
                <div
                  class="flex items-center justify-between text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase"
                >
                  <span>Progress</span>
                  <span>{{ training.progress }}%</span>
                </div>
                <app-accent-progress-bar [value]="training.progress" [tone]="training.accent" />
              </div>
            </div>
          </article>
        }
      </div>
    } @else {
      <section hlmEmpty class="mt-6 rounded-2xl border border-dashed border-border/80 bg-card/70">
        <div hlmEmptyHeader>
          <div hlmEmptyMedia variant="icon">
            <ng-icon name="lucideSearch" />
          </div>
          <h3 hlmEmptyTitle>{{ emptyState().title }}</h3>
          <p hlmEmptyDescription>{{ emptyState().description }}</p>
        </div>
      </section>
    }
  `,
  styles: `
    :host {
      display: block;
    }

    .training-card {
      border: 1px solid var(--dashboard-border-strong, var(--border));
      background: var(--card);
      transition:
        transform 180ms ease,
        box-shadow 180ms ease;
    }

    .training-card:hover {
      transform: translateY(-2px);
    }

    .training-image {
      transition: transform 220ms ease;
    }

    .training-card:hover .training-image {
      transform: scale(1.03);
    }

    .card-panel {
      background: var(--dashboard-card-panel, var(--card));
    }

    .image-overlay {
      position: absolute;
      inset: 0;
      pointer-events: none;
      background: linear-gradient(180deg, transparent 42%, rgba(15, 23, 42, 0.48) 100%);
    }

    .tone-chip {
      background: var(--dashboard-tone-soft);
      color: var(--dashboard-tone-foreground);
    }
  `,
})
export class TrainingCardGrid {
  readonly trainings = input.required<readonly TrainingCardViewModel[]>();
  readonly isLoading = input(false);
  readonly emptyState = input<TrainingEmptyStateViewModel>({
    title: 'No trainings',
    description: '',
  });
  readonly columns = input<3 | 4>(3);
  readonly sortOptions = input<readonly TrainingSortOptionViewModel[]>(TRAINING_SORT_OPTIONS);
  readonly linkFn = input.required<(training: TrainingCardViewModel) => string>();

  readonly sortValue = signal<TrainingSortOption>('recent');
  readonly searchValue = signal('');

  protected readonly skeletons = computed(() => Array.from({ length: this.columns() + 1 }));
  protected readonly displayTrainings = computed(() => {
    const query = this.searchValue();
    return [...this.trainings()]
      .filter((training) => matchesTrainingCardQuery(training, query))
      .sort((left, right) => compareTrainingCards(left, right, this.sortValue()));
  });

  protected onSortChange(value: string): void {
    if (isTrainingSortOption(value)) {
      this.sortValue.set(value);
    }
  }
}
