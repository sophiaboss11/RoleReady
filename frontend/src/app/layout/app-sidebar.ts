import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { HlmSidebarImports } from '@app/ui/sidebar';
import { NavMain } from './nav-main';
import { NavUser } from './nav-user';
import { OrgSwitcher } from './org-switcher';
import { buildAdminNavItem, buildNavItems } from './nav.config';
import type { Organization, OrganizationMembership } from '../domain/organization.types';

@Component({
  selector: 'app-sidebar',
  imports: [HlmSidebarImports, NavMain, NavUser, OrgSwitcher],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div hlmSidebarWrapper class="flex-col">
      <ng-content select="[header]" />
      <div class="flex flex-1">
        <hlm-sidebar
          sidebarContainerClass="top-(--header-height) h-[calc(100svh-var(--header-height))]"
        >
          <hlm-sidebar-header>
            <app-org-switcher
              [activeOrg]="activeOrg()"
              [memberships]="memberships()"
              (orgSelected)="orgSelected.emit($event)"
            />
          </hlm-sidebar-header>

          <hlm-sidebar-content>
            <app-nav-main [items]="navItems()" />
          </hlm-sidebar-content>

          <hlm-sidebar-footer>
            <app-nav-user
              [userName]="userName()"
              [userEmail]="userEmail()"
              [avatarUrl]="avatarUrl()"
              [isAdmin]="isAdmin()"
              (signOutClicked)="signOutClicked.emit()"
              (accountClicked)="accountClicked.emit()"
              (settingsClicked)="settingsClicked.emit()"
            />
          </hlm-sidebar-footer>
        </hlm-sidebar>
        <ng-content />
      </div>
    </div>
  `,
})
export class AppSidebar {
  readonly orgSlug = input.required<string>();
  readonly activeOrg = input.required<Organization | null>();
  readonly memberships = input.required<OrganizationMembership[]>();
  readonly isAdmin = input.required<boolean>();
  readonly userName = input.required<string>();
  readonly userEmail = input.required<string>();
  readonly avatarUrl = input<string | null>(null);
  readonly signOutClicked = output<void>();
  readonly accountClicked = output<void>();
  readonly settingsClicked = output<void>();
  readonly orgSelected = output<string>();

  protected readonly navItems = computed(() => {
    const slug = this.orgSlug();
    const items = [...buildNavItems(slug)];
    if (this.isAdmin()) {
      items.push(buildAdminNavItem(slug));
    }
    return items;
  });
}
