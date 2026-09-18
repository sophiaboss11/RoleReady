import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideCircleAlert, lucideLoader } from '@ng-icons/lucide';
import { HlmAlertImports } from '@app/ui/alert';
import { HlmAvatarImports } from '@app/ui/avatar';
import { HlmButtonImports } from '@app/ui/button';
import { HlmCardImports } from '@app/ui/card';
import { HlmInputImports } from '@app/ui/input';
import { HlmLabelImports } from '@app/ui/label';
import { HlmSkeletonImports } from '@app/ui/skeleton';
import { HlmSpinnerImports } from '@app/ui/spinner';
import { AuthFacade } from '../services/auth.facade';
import { ProfileFacade } from '../services/profile.facade';

@Component({
  selector: 'app-account-page',
  imports: [
    FormsModule,
    NgIcon,
    HlmAlertImports,
    HlmAvatarImports,
    HlmButtonImports,
    HlmCardImports,
    HlmInputImports,
    HlmLabelImports,
    HlmSkeletonImports,
    HlmSpinnerImports,
  ],
  providers: [provideIcons({ lucideCheck, lucideCircleAlert, lucideLoader })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-4xl space-y-8">
      <header>
        <h1 class="text-2xl font-bold tracking-tight">Account</h1>
        <p class="text-sm text-muted-foreground">Manage your profile information.</p>
      </header>

      @if (profileFacade.isLoading()) {
        <!-- Skeleton: Profile card -->
        <section hlmCard role="status" aria-label="Loading profile">
          <div hlmCardHeader>
            <hlm-skeleton class="h-5 w-16" />
            <hlm-skeleton class="h-4 w-56" />
          </div>
          <div hlmCardContent class="space-y-6">
            <div class="flex items-center gap-4">
              <hlm-skeleton class="size-16 rounded-lg" />
              <div class="flex-1 space-y-2">
                <hlm-skeleton class="h-4 w-20" />
                <hlm-skeleton class="h-9 w-full" />
              </div>
            </div>
            <div class="space-y-2">
              <hlm-skeleton class="h-4 w-28" />
              <hlm-skeleton class="h-9 w-full" />
            </div>
          </div>
        </section>
        <!-- Skeleton: Account info card -->
        <section hlmCard>
          <div hlmCardHeader>
            <hlm-skeleton class="h-5 w-40" />
            <hlm-skeleton class="h-4 w-56" />
          </div>
          <div hlmCardContent class="space-y-4">
            <div>
              <hlm-skeleton class="h-4 w-12 mb-1" />
              <hlm-skeleton class="h-4 w-48" />
            </div>
            <div>
              <hlm-skeleton class="h-4 w-24 mb-1" />
              <hlm-skeleton class="h-4 w-36" />
            </div>
          </div>
        </section>
      } @else {
        <!-- Profile Section -->
        <section hlmCard>
          <div hlmCardHeader>
            <h2 hlmCardTitle>Profile</h2>
            <p hlmCardDescription>Update your display name and avatar.</p>
          </div>
          <div hlmCardContent>
            @if (errorMessage()) {
              <div hlmAlert variant="destructive" class="mb-4">
                <ng-icon hlm hlmAlertIcon name="lucideCircleAlert" />
                <p hlmAlertDescription>{{ errorMessage() }}</p>
              </div>
            }
            @if (successMessage()) {
              <div hlmAlert class="mb-4">
                <ng-icon hlm hlmAlertIcon name="lucideCheck" />
                <p hlmAlertDescription>{{ successMessage() }}</p>
              </div>
            }
            <form class="space-y-6" (submit)="onSave($event)">
              <div class="flex items-center gap-4">
                <hlm-avatar class="size-16 rounded-lg">
                  <img [src]="avatarUrlField || ''" alt="Avatar preview" hlmAvatarImage />
                  <span
                    class="rounded-lg bg-primary text-primary-foreground text-lg"
                    hlmAvatarFallback
                  >
                    {{ initials() }}
                  </span>
                </hlm-avatar>
                <div class="flex-1 space-y-2">
                  <label hlmLabel for="avatar-url">Avatar URL</label>
                  <input
                    hlmInput
                    id="avatar-url"
                    type="url"
                    placeholder="https://example.com/avatar.jpg"
                    [(ngModel)]="avatarUrlField"
                    name="avatarUrl"
                    class="w-full"
                  />
                </div>
              </div>

              <div class="space-y-2">
                <label hlmLabel for="display-name">Display name</label>
                <input
                  hlmInput
                  id="display-name"
                  type="text"
                  required
                  [(ngModel)]="displayNameField"
                  name="displayName"
                  class="w-full"
                />
              </div>

              <div class="flex justify-end">
                <button hlmBtn type="submit" [disabled]="profileFacade.isSaving()">
                  @if (profileFacade.isSaving()) {
                    <hlm-spinner class="text-sm" />
                    Saving...
                  } @else {
                    Save
                  }
                </button>
              </div>
            </form>
          </div>
        </section>

        <!-- Account Info Section -->
        <section hlmCard>
          <div hlmCardHeader>
            <h2 hlmCardTitle>Account information</h2>
            <p hlmCardDescription>Read-only details about your account.</p>
          </div>
          <div hlmCardContent>
            <dl class="space-y-4">
              <div>
                <dt class="text-sm font-medium text-muted-foreground">Email</dt>
                <dd class="mt-1 text-sm">{{ userEmail() }}</dd>
              </div>
              <div>
                <dt class="text-sm font-medium text-muted-foreground">Member since</dt>
                <dd class="mt-1 text-sm">{{ memberSince() }}</dd>
              </div>
            </dl>
          </div>
        </section>
      }
    </div>
  `,
})
export class AccountPage implements OnInit {
  private readonly authFacade = inject(AuthFacade);
  protected readonly profileFacade = inject(ProfileFacade);

  protected readonly userEmail = () => this.authFacade.user()?.email ?? '—';

  protected displayNameField = '';
  protected avatarUrlField = '';
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly successMessage = signal<string | null>(null);

  protected readonly initials = () => {
    const name = this.displayNameField;
    if (!name || name === 'User') return 'U';
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  protected readonly memberSince = () => {
    const createdAt = this.profileFacade.profile()?.createdAt;
    if (!createdAt) return '—';
    return new Date(createdAt).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  ngOnInit(): void {
    const profile = this.profileFacade.profile();
    if (profile) {
      this.displayNameField = profile.displayName;
      this.avatarUrlField = profile.avatarUrl ?? '';
    }
  }

  protected async onSave(event: Event): Promise<void> {
    event.preventDefault();
    this.errorMessage.set(null);
    this.successMessage.set(null);

    const error = await this.profileFacade.updateProfile({
      displayName: this.displayNameField.trim(),
      avatarUrl: this.avatarUrlField.trim() || null,
    });

    if (error) {
      this.errorMessage.set(error.message);
      return;
    }

    this.successMessage.set('Profile updated successfully.');
  }
}
