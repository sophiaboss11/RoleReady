import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideImageOff, lucideLoaderCircle } from '@ng-icons/lucide';
import type { TrainingCoverImageStatus } from '../../domain/training.types';

@Component({
  selector: 'app-training-cover-image',
  standalone: true,
  imports: [NgIcon],
  providers: [provideIcons({ lucideImageOff, lucideLoaderCircle })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (imageUrl(); as url) {
      <img [src]="url" [alt]="imageAlt()" [class]="imageClass()" />
    } @else {
      <div
        [class]="placeholderClasses()"
        [attr.data-generating]="isGenerating()"
        [attr.role]="isGenerating() ? 'status' : 'img'"
        [attr.aria-label]="imageAlt()"
      >
        <div class="flex min-w-0 flex-col items-center gap-2 px-3 text-muted-foreground">
          @if (isGenerating()) {
            <ng-icon name="lucideLoaderCircle" class="text-3xl animate-spin" aria-hidden="true" />
            @if (showLabel()) {
              <span class="text-center text-xs font-semibold uppercase tracking-[0.14em]">
                Generating cover
              </span>
            }
          } @else {
            <ng-icon name="lucideImageOff" class="text-3xl" aria-hidden="true" />
            @if (showLabel()) {
              <span class="text-center text-xs font-semibold uppercase tracking-[0.14em]">
                No cover image
              </span>
            }
          }
        </div>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
    }

    .training-cover-placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px dashed var(--border);
      background: linear-gradient(135deg, var(--muted) 0%, var(--card) 100%), var(--muted);
    }

    .training-cover-placeholder[data-generating='true'] {
      background:
        linear-gradient(
          90deg,
          transparent,
          color-mix(in srgb, var(--primary) 12%, transparent),
          transparent
        ),
        linear-gradient(135deg, var(--muted) 0%, var(--card) 100%), var(--muted);
      background-size:
        200% 100%,
        auto,
        auto;
      animation: training-cover-pulse 1400ms ease-in-out infinite;
    }

    @keyframes training-cover-pulse {
      0% {
        background-position:
          200% 0,
          0 0,
          0 0;
      }
      100% {
        background-position:
          -200% 0,
          0 0,
          0 0;
      }
    }
  `,
})
export class TrainingCoverImage {
  readonly imageUrl = input<string | null>(null);
  readonly imageAlt = input('Training cover image');
  readonly imageStatus = input<TrainingCoverImageStatus>('pending');
  readonly imageClass = input('aspect-video w-full object-cover');
  readonly placeholderClass = input<string | null>(null);
  readonly showLabel = input(true);

  protected readonly isGenerating = computed(() => this.imageStatus() === 'generating');

  protected readonly placeholderClasses = computed(() => {
    const baseClass = this.placeholderClass() ?? this.imageClass();
    return `training-cover-placeholder ${baseClass}`;
  });
}
