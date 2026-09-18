import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronsUpDown, lucideLogOut, lucideSettings, lucideUser } from '@ng-icons/lucide';
import { HlmAvatarImports } from '@app/ui/avatar';
import { HlmDropdownMenuImports } from '@app/ui/dropdown-menu';
import { HlmSidebarImports, HlmSidebarService } from '@app/ui/sidebar';

@Component({
  selector: 'app-nav-user',
  imports: [HlmSidebarImports, HlmAvatarImports, HlmDropdownMenuImports, NgIcon],
  providers: [provideIcons({ lucideChevronsUpDown, lucideLogOut, lucideSettings, lucideUser })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul hlmSidebarMenu>
      <li hlmSidebarMenuItem>
        <button
          hlmSidebarMenuButton
          size="lg"
          [hlmDropdownMenuTrigger]="menu"
          [side]="_menuSide()"
          align="end"
        >
          <hlm-avatar class="size-8 rounded-lg">
            <img [src]="avatarUrl() ?? ''" [alt]="userName()" hlmAvatarImage />
            <span class="rounded-lg bg-primary text-primary-foreground text-xs" hlmAvatarFallback>
              {{ initials() }}
            </span>
          </hlm-avatar>
          <div class="grid flex-1 text-left text-sm leading-tight">
            <span class="truncate font-medium">{{ userName() }}</span>
            <span class="truncate text-xs">{{ userEmail() }}</span>
          </div>
          <ng-icon name="lucideChevronsUpDown" class="ml-auto text-base" />
        </button>
      </li>
    </ul>

    <ng-template #menu>
      <hlm-dropdown-menu class="min-w-56 rounded-lg">
        <hlm-dropdown-menu-label>
          <div class="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
            <hlm-avatar class="size-8 rounded-lg">
              <img [src]="avatarUrl() ?? ''" [alt]="userName()" hlmAvatarImage />
              <span class="rounded-lg bg-primary text-primary-foreground text-xs" hlmAvatarFallback>
                {{ initials() }}
              </span>
            </hlm-avatar>
            <div class="grid flex-1 text-left text-sm leading-tight">
              <span class="truncate font-medium">{{ userName() }}</span>
              <span class="truncate text-xs">{{ userEmail() }}</span>
            </div>
          </div>
        </hlm-dropdown-menu-label>
        <hlm-dropdown-menu-separator />
        <hlm-dropdown-menu-group>
          <button hlmDropdownMenuItem (click)="accountClicked.emit()">
            <ng-icon name="lucideUser" />
            Account
          </button>
          @if (isAdmin()) {
            <button hlmDropdownMenuItem (click)="settingsClicked.emit()">
              <ng-icon name="lucideSettings" />
              Settings
            </button>
          }
        </hlm-dropdown-menu-group>
        <hlm-dropdown-menu-separator />
        <button hlmDropdownMenuItem (click)="signOutClicked.emit()">
          <ng-icon name="lucideLogOut" />
          Sign out
        </button>
      </hlm-dropdown-menu>
    </ng-template>
  `,
})
export class NavUser {
  private readonly sidebarService = inject(HlmSidebarService);
  protected readonly _menuSide = computed(() =>
    this.sidebarService.isMobile() ? ('top' as const) : ('right' as const),
  );

  readonly userName = input.required<string>();
  readonly userEmail = input.required<string>();
  readonly avatarUrl = input<string | null>(null);
  readonly isAdmin = input(false);
  readonly signOutClicked = output<void>();
  readonly accountClicked = output<void>();
  readonly settingsClicked = output<void>();

  protected readonly initials = computed(() => {
    const name = this.userName();
    if (!name || name === 'User') return 'U';
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  });
}
