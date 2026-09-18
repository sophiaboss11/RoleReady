import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { HlmSidebarImports } from '@app/ui/sidebar';
import { AuthFacade } from '../services/auth.facade';
import { OrganizationFacade } from '../services/organization.facade';
import { ProfileFacade } from '../services/profile.facade';
import { AppSidebar } from './app-sidebar';
import { SiteHeader } from './site-header';

/**
 * Root layout for all authenticated + org-bound routes.
 *
 * authGuard, orgGuard, and profile initialization have all resolved
 * before this component renders, so `isLoading` is kept only as a
 * defensive fallback.
 */
@Component({
  selector: 'app-main-layout',
  imports: [RouterOutlet, HlmSidebarImports, AppSidebar, SiteHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
    style: '--header-height: 4rem; --page-shell-top-gap: 1.5rem;',
  },
  template: `
    @if (isLoading()) {
      <div class="flex min-h-svh items-center justify-center">
        <p role="status" aria-live="polite" class="text-sm text-muted-foreground">Loading...</p>
      </div>
    } @else {
      <app-sidebar
        [orgSlug]="orgSlug()"
        [activeOrg]="activeOrganization()"
        [memberships]="memberships()"
        [isAdmin]="isAdmin()"
        [userName]="userName()"
        [userEmail]="userEmail()"
        [avatarUrl]="avatarUrl()"
        (signOutClicked)="onSignOut()"
        (orgSelected)="onOrgSelected($event)"
        (accountClicked)="onAccountClicked()"
        (settingsClicked)="onSettingsClicked()"
      >
        <app-site-header header pageTitle="Role-Ready" />
        <main hlmSidebarInset>
          <div
            class="flex min-h-[calc(100svh-var(--header-height))] flex-1 flex-col pt-[calc(var(--header-height)+var(--page-shell-top-gap))] pb-8"
          >
            <router-outlet />
          </div>
        </main>
      </app-sidebar>
    }
  `,
})
export class MainLayoutComponent {
  private readonly authFacade = inject(AuthFacade);
  private readonly orgFacade = inject(OrganizationFacade);
  private readonly profileFacade = inject(ProfileFacade);
  private readonly router = inject(Router);

  protected readonly isLoading = computed(
    () =>
      this.authFacade.isLoading() || this.orgFacade.isLoading() || this.profileFacade.isLoading(),
  );
  protected readonly user = this.authFacade.user;
  protected readonly userName = computed(() => this.profileFacade.displayName());
  protected readonly userEmail = computed(() => this.user()?.email ?? '');
  protected readonly avatarUrl = computed(() => this.profileFacade.avatarUrl());

  protected readonly activeOrganization = this.orgFacade.activeOrganization;
  protected readonly memberships = this.orgFacade.memberships;
  protected readonly isAdmin = this.orgFacade.isAdmin;
  protected readonly orgSlug = computed(() => this.orgFacade.activeOrgSlug() ?? '');

  protected onOrgSelected(orgId: string): void {
    this.orgFacade.setActiveOrganization(orgId);
    const newSlug = this.orgFacade.activeOrgSlug();
    this.router.navigate([`/${newSlug}`, 'dashboard']);
  }

  protected onAccountClicked(): void {
    const slug = this.orgSlug();
    this.router.navigate([`/${slug}`, 'account']);
  }

  protected onSettingsClicked(): void {
    const slug = this.orgSlug();
    this.router.navigate([`/${slug}`, 'settings']);
  }

  protected async onSignOut(): Promise<void> {
    this.orgFacade.clearState();
    await this.authFacade.signOut();
    await this.router.navigate(['/login']);
  }
}
