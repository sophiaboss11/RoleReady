import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideBuilding2, lucideCircleAlert, lucideLoader } from '@ng-icons/lucide';
import { HlmAvatarImports } from '@app/ui/avatar';
import { HlmButtonImports } from '@app/ui/button';
import { HlmIconImports } from '@app/ui/icon';
import { HlmSpinnerImports } from '@app/ui/spinner';
import { AuthFacade } from '../services/auth.facade';
import { OrganizationFacade } from '../services/organization.facade';
import { OrganizationService } from '../services/organization.service';
import type { InvitationPreview } from '../domain/organization.types';

const PENDING_INVITE_TOKEN_KEY = 'pendingInviteToken';

type PageState = 'loading' | 'preview' | 'joining' | 'error';

@Component({
  selector: 'app-invite-page',
  imports: [NgIcon, HlmAvatarImports, HlmButtonImports, HlmIconImports, HlmSpinnerImports],
  providers: [provideIcons({ lucideBuilding2, lucideCircleAlert, lucideLoader })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .invite-bg {
      background-color: #005eff;
      background-image:
        radial-gradient(circle farthest-corner at top left, #54d1ff 0%, rgba(225, 243, 97, 0) 50%),
        radial-gradient(circle farthest-side at top right, #251d91 0%, rgba(181, 176, 177, 0) 10%),
        radial-gradient(
          circle farthest-corner at bottom right,
          #54d1ff 0%,
          rgba(204, 104, 119, 0) 33%
        ),
        radial-gradient(
          circle farthest-corner at top right,
          #0c056775 0%,
          rgba(155, 221, 240, 0) 50%
        ),
        radial-gradient(ellipse at bottom center, #54d1ff 0%, rgba(254, 43, 0, 0) 80%);
    }
  `,
  template: `
    <main class="invite-bg flex min-h-svh items-center justify-center px-4">
      <section
        class="w-full max-w-md rounded-2xl bg-white/10 p-8 text-center shadow-2xl ring-1 ring-white/20 backdrop-blur-lg"
      >
        @switch (pageState()) {
          @case ('loading') {
            <div class="flex flex-col items-center gap-4 py-8">
              <hlm-spinner class="text-white" aria-label="Loading invitation" />
              <p class="text-sm text-white/70">Loading invitation...</p>
            </div>
          }
          @case ('preview') {
            @if (invitation(); as inv) {
              <div class="flex flex-col items-center gap-6">
                <hlm-avatar class="size-16 ring-2 ring-white/20">
                  @if (inv.organizationLogoUrl) {
                    <img
                      [src]="inv.organizationLogoUrl"
                      [alt]="inv.organizationName"
                      hlmAvatarImage
                    />
                  }
                  <span class="bg-white/20 text-xl text-white" hlmAvatarFallback>
                    {{ inv.organizationName.charAt(0).toUpperCase() }}
                  </span>
                </hlm-avatar>

                <div>
                  <h1 class="text-2xl font-bold tracking-tight text-white">
                    Join {{ inv.organizationName }}
                  </h1>
                  <p class="mt-2 text-sm text-white/70">
                    You've been invited to join as
                    <span class="font-medium text-white">{{ inv.role }}</span>
                  </p>
                </div>

                @if (isAuthenticated()) {
                  <button
                    hlmBtn
                    variant="inverse"
                    size="lg"
                    type="button"
                    class="w-full rounded-xl"
                    [disabled]="pageState() === 'joining'"
                    (click)="onJoin()"
                  >
                    Join organization
                  </button>
                } @else {
                  <button
                    hlmBtn
                    variant="inverse"
                    size="lg"
                    type="button"
                    class="w-full rounded-xl"
                    (click)="onSignInToJoin()"
                  >
                    Sign in to join
                  </button>
                }
              </div>
            }
          }
          @case ('joining') {
            <div class="flex flex-col items-center gap-4 py-8">
              <hlm-spinner class="text-white" aria-label="Joining organization" />
              <p class="text-sm text-white/70">Joining organization...</p>
            </div>
          }
          @case ('error') {
            <div class="flex flex-col items-center gap-4">
              <ng-icon name="lucideCircleAlert" class="text-3xl text-white/70" />
              <h1 class="text-2xl font-bold tracking-tight text-white">Invalid invitation</h1>
              <p class="text-sm text-white/70">{{ errorMessage() }}</p>
              <button
                hlmBtn
                variant="inverse"
                size="lg"
                type="button"
                class="mt-4 w-full rounded-xl"
                (click)="onGoHome()"
              >
                Go to homepage
              </button>
            </div>
          }
        }
      </section>
    </main>
  `,
})
export class InvitePage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authFacade = inject(AuthFacade);
  private readonly orgFacade = inject(OrganizationFacade);
  private readonly orgService = inject(OrganizationService);

  readonly pageState = signal<PageState>('loading');
  readonly invitation = signal<InvitationPreview | null>(null);
  readonly errorMessage = signal<string>('');
  readonly isAuthenticated = signal(false);

  async ngOnInit(): Promise<void> {
    await this.authFacade.ensureInitialized();
    this.isAuthenticated.set(!!this.authFacade.user());

    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      this.showError('No invitation token provided.');
      return;
    }

    const { data, errorMessage } = await this.orgService.getInvitationByToken(token);

    if (errorMessage || !data) {
      this.showError(errorMessage ?? 'Invitation not found.');
      return;
    }

    if (data.status === 'accepted') {
      this.showError('This invitation has already been accepted.');
      return;
    }

    if (data.status === 'expired') {
      this.showError('This invitation has expired.');
      return;
    }

    this.invitation.set(data);
    this.pageState.set('preview');
  }

  protected onSignInToJoin(): void {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (token) {
      sessionStorage.setItem(PENDING_INVITE_TOKEN_KEY, token);
    }
    this.router.navigate(['/login']);
  }

  protected async onJoin(): Promise<void> {
    this.pageState.set('joining');

    this.orgFacade.clearState();
    await this.orgFacade.ensureInitialized();

    sessionStorage.removeItem(PENDING_INVITE_TOKEN_KEY);

    const slug = this.orgFacade.activeOrgSlug();
    if (slug) {
      await this.router.navigate([`/${slug}`, 'dashboard']);
    } else {
      await this.router.navigate(['/no-organization']);
    }
  }

  protected onGoHome(): void {
    this.router.navigate(['/']);
  }

  private showError(message: string): void {
    this.errorMessage.set(message);
    this.pageState.set('error');
  }
}
