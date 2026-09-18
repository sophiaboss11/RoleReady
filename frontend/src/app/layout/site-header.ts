import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { HlmSidebarImports } from '@app/ui/sidebar';
import { HlmSeparatorImports } from '@app/ui/separator';
import { ServiceIcon } from '../shared/ui/service-icon';

@Component({
  selector: 'app-site-header',
  imports: [HlmSidebarImports, HlmSeparatorImports, ServiceIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="fixed inset-x-0 top-0 z-50" style="height: var(--header-height);">
      <div
        class="h-full w-full border-b border-border/70 bg-card/95 text-foreground shadow-sm backdrop-blur"
      >
        <div class="px-6 h-full flex items-center">
          <button hlmSidebarTrigger aria-label="Toggle sidebar"></button>
          <hlm-separator orientation="vertical" class="mr-2 data-[orientation=vertical]:h-4" />

          <div class="flex items-center gap-3">
            <app-service-icon class="h-8 w-8" />
            <span class="text-lg font-semibold tracking-wide text-foreground">
              {{ pageTitle() }}
            </span>
          </div>
        </div>
      </div>
    </header>
  `,
})
export class SiteHeader {
  readonly pageTitle = input('');
}
