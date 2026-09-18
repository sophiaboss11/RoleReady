import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideChevronsUpDown } from '@ng-icons/lucide';
import { HlmDropdownMenuImports } from '@app/ui/dropdown-menu';
import { HlmSidebarImports, HlmSidebarService } from '@app/ui/sidebar';
import type { Organization, OrganizationMembership } from '../domain/organization.types';

@Component({
  selector: 'app-org-switcher',
  imports: [HlmSidebarImports, HlmDropdownMenuImports, NgIcon],
  providers: [provideIcons({ lucideChevronsUpDown, lucideCheck })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul hlmSidebarMenu>
      <li hlmSidebarMenuItem>
        <button
          hlmSidebarMenuButton
          size="lg"
          [hlmDropdownMenuTrigger]="orgMenu"
          [side]="_menuSide()"
          align="start"
        >
          @if (activeOrg()?.logoUrl) {
            <img
              [src]="activeOrg()!.logoUrl!"
              [alt]="activeOrg()!.name"
              class="size-8 rounded-lg object-cover"
            />
          } @else {
            <span
              class="flex size-8 items-center justify-center rounded-lg bg-primary text-xs font-medium text-primary-foreground"
            >
              {{ orgInitial() }}
            </span>
          }
          <div class="grid flex-1 text-left text-sm leading-tight">
            <span class="truncate font-medium">{{ activeOrg()?.name }}</span>
          </div>
          <ng-icon name="lucideChevronsUpDown" class="ml-auto text-base" />
        </button>
      </li>
    </ul>

    <ng-template #orgMenu>
      <hlm-dropdown-menu class="min-w-56 rounded-lg">
        <hlm-dropdown-menu-label>Organizations</hlm-dropdown-menu-label>
        <hlm-dropdown-menu-separator />
        <hlm-dropdown-menu-group>
          @for (membership of memberships(); track membership.membershipId) {
            <button hlmDropdownMenuItem (click)="orgSelected.emit(membership.organization.id)">
              @if (membership.organization.logoUrl) {
                <img
                  [src]="membership.organization.logoUrl"
                  [alt]="membership.organization.name"
                  class="size-5 rounded object-cover"
                />
              } @else {
                <span
                  class="flex size-5 items-center justify-center rounded bg-muted text-[10px] font-medium"
                >
                  {{ membership.organization.name.charAt(0).toUpperCase() }}
                </span>
              }
              <span class="flex-1 truncate">{{ membership.organization.name }}</span>
              @if (membership.organization.id === activeOrg()?.id) {
                <ng-icon name="lucideCheck" class="ml-auto text-base" />
              }
            </button>
          }
        </hlm-dropdown-menu-group>
      </hlm-dropdown-menu>
    </ng-template>
  `,
})
export class OrgSwitcher {
  private readonly sidebarService = inject(HlmSidebarService);
  protected readonly _menuSide = computed(() =>
    this.sidebarService.isMobile() ? ('bottom' as const) : ('right' as const),
  );

  readonly activeOrg = input.required<Organization | null>();
  readonly memberships = input.required<OrganizationMembership[]>();
  readonly orgSelected = output<string>();

  protected readonly orgInitial = computed(() => {
    const org = this.activeOrg();
    return org ? org.name.charAt(0).toUpperCase() : '';
  });
}
