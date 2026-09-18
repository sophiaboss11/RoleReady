import { ChangeDetectionStrategy, Component, input, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideFolder,
  lucideHome,
  lucideLayoutDashboard,
  lucidePlay,
  lucideSettings,
  lucideTrophy,
} from '@ng-icons/lucide';
import { HlmSidebarImports } from '@app/ui/sidebar';
import { filter, map, startWith } from 'rxjs';
import { isNavItemActive, type NavItem } from './nav.config';

@Component({
  selector: 'app-nav-main',
  imports: [HlmSidebarImports, NgIcon, RouterLink],
  providers: [
    provideIcons({
      lucideFolder,
      lucideHome,
      lucideLayoutDashboard,
      lucidePlay,
      lucideSettings,
      lucideTrophy,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hlm-sidebar-group>
      <div hlmSidebarGroupLabel>Navigation</div>
      <ul hlmSidebarMenu>
        @for (item of items(); track item.url) {
          <li hlmSidebarMenuItem>
            <a
              hlmSidebarMenuButton
              [routerLink]="item.url"
              [isActive]="isActive(item)"
            >
              <ng-icon [name]="item.icon" />
              <span>{{ item.title }}</span>
            </a>
          </li>
        }
      </ul>
    </hlm-sidebar-group>
  `,
})
export class NavMain {
  private readonly router = inject(Router);
  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { requireSync: true },
  );

  readonly items = input.required<readonly NavItem[]>();

  protected isActive(item: NavItem): boolean {
    return isNavItemActive(item, this.currentUrl());
  }
}
