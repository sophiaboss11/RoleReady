import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ServiceIcon } from '../shared/ui/service-icon';
import { AuthFacade } from '../services/auth.facade';

/**
 * Login page — standalone from the sidebar layout.
 *
 * AuthFacade is a root singleton; the guestGuard has already called
 * `ensureInitialized()` and confirmed no active session before this
 * component renders. The only lifecycle work left is capturing OAuth
 * error params from the URL hash (this page is the OAuth redirect target).
 */
@Component({
  selector: 'app-login-page',
  imports: [RouterLink, ServiceIcon],
  templateUrl: './login-page.html',
  styleUrl: './login-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage implements OnInit {
  private readonly authFacade = inject(AuthFacade);

  protected readonly isConfigured = this.authFacade.isConfigured;
  protected readonly isLoading = this.authFacade.isLoading;
  protected readonly isAuthenticating = this.authFacade.isAuthenticating;
  protected readonly errorMessage = this.authFacade.errorMessage;

  ngOnInit(): void {
    this.authFacade.captureOAuthErrorFromHash();
  }

  protected async signInWithGoogle(): Promise<void> {
    await this.authFacade.signInWithGoogle();
  }
}
