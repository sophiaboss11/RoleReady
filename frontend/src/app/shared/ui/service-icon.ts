import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-service-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'aria-hidden': 'true',
    class: 'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md',
  },
  template: `
    <img
      src="/icon.svg"
      alt=""
      class="h-[70%] w-[70%] translate-x-[5%] object-contain"
      decoding="async"
    />
  `,
  styles: `
    :host {
      background:
        linear-gradient(
          135deg,
          rgba(248, 250, 252, 0.72),
          rgba(226, 232, 240, 0.58) 48%,
          rgba(186, 230, 253, 0.34) 100%
        ),
        rgba(203, 213, 225, 0.28);
      border: 1px solid rgba(148, 163, 184, 0.36);
      box-shadow:
        0 10px 24px rgba(15, 23, 42, 0.12),
        inset 0 1px 0 rgba(255, 255, 255, 0.42);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
    }
  `,
})
export class ServiceIcon {}
