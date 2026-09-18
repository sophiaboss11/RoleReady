import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { HlmProgressImports } from '@app/ui/progress';
import type { TrainingAccentTone } from '../../domain/training-presentation';

type AccentProgressBarSize = 'sm' | 'md';

@Component({
  selector: 'app-accent-progress-bar',
  imports: [HlmProgressImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block w-full',
  },
  template: `
    <hlm-progress [class]="progressClass()" [value]="value()">
      <hlm-progress-indicator [style.background]="indicatorBackground()" />
    </hlm-progress>
  `,
  styles: `
    .accent-progress {
      background: var(--dashboard-progress-track);
    }
  `,
})
export class AccentProgressBar {
  readonly value = input.required<number>();
  readonly tone = input<TrainingAccentTone>('ocean');
  readonly size = input<AccentProgressBarSize>('md');

  protected readonly progressClass = computed(() =>
    this.size() === 'sm' ? 'accent-progress h-2.5 w-full' : 'accent-progress h-3 w-full',
  );

  protected readonly indicatorBackground = computed(
    () =>
      `linear-gradient(90deg, var(--dashboard-accent-${this.tone()}-start), var(--dashboard-accent-${this.tone()}-end))`,
  );
}
