import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { HlmButtonImports } from '@app/ui/button';
import { AuthFacade } from '../services/auth.facade';
import { OrganizationFacade } from '../services/organization.facade';

@Component({
  selector: 'app-no-organization-page',
  imports: [HlmButtonImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .no-org-bg {
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
    <main class="no-org-bg flex min-h-svh items-center justify-center px-4">
      <section
        class="w-full max-w-md rounded-2xl bg-white/10 p-8 text-center shadow-2xl ring-1 ring-white/20 backdrop-blur-lg"
      >
        <h1 class="text-2xl font-bold tracking-tight text-white">No Organization</h1>
        <p class="mt-4 text-sm leading-relaxed text-white/70">
          You are not a member of any organization yet. Please ask your administrator to send you an
          invitation.
        </p>
        <button
          hlmBtn
          variant="inverse"
          size="lg"
          type="button"
          class="mt-8 w-full rounded-xl"
          (click)="onSignOut()"
        >
          Sign out
        </button>
      </section>
    </main>
  `,
})
export class NoOrganizationPage {
  private readonly authFacade = inject(AuthFacade);
  private readonly orgFacade = inject(OrganizationFacade);
  private readonly router = inject(Router);

  protected async onSignOut(): Promise<void> {
    this.orgFacade.clearState();
    await this.authFacade.signOut();
    await this.router.navigate(['/login']);
  }
}
