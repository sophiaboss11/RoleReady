import { inject, Injectable, computed, signal } from '@angular/core';
import type { Session } from '@supabase/supabase-js';
import { AuthService } from './auth.service';

/**
 * Root-level singleton that owns all authentication state.
 *
 * Design decisions:
 * - `providedIn: 'root'` — single source of truth for the entire app.
 * - `ensureInitialized()` is idempotent — safe to call from multiple guards
 *   and components; the Supabase session check runs exactly once.
 * - No `destroy()` — the auth subscription intentionally lives for the
 *   full application lifetime, matching the singleton's scope.
 * - `captureOAuthErrorFromHash()` is separated from initialization so the
 *   LoginPage can call it on its own schedule (OAuth redirects land there).
 */
@Injectable({ providedIn: 'root' })
export class AuthFacade {
  private readonly authService = inject(AuthService);

  readonly isConfigured = this.authService.isConfigured;
  readonly isLoading = signal(true);
  readonly isAuthenticating = signal(false);
  readonly errorMessage = signal<string | null>(this.authService.configurationError);
  readonly session = signal<Session | null>(null);
  readonly user = computed(() => this.session()?.user ?? null);

  private initPromise: Promise<void> | null = null;

  /**
   * Guarantees that the Supabase session has been fetched and the
   * real-time auth listener is active. Idempotent — subsequent calls
   * return the same settled Promise.
   */
  async ensureInitialized(): Promise<void> {
    this.initPromise ??= this.performInitialization();
    return this.initPromise;
  }

  /**
   * Inspects `window.location.hash` for OAuth error parameters
   * (e.g. `#error_code=4xx&error_description=…`) and surfaces them
   * through the `errorMessage` signal.
   *
   * Must be called by the LoginPage, since that is the OAuth redirect target.
   */
  captureOAuthErrorFromHash(): void {
    if (!window.location.hash) {
      return;
    }

    const params = new URLSearchParams(window.location.hash.slice(1));
    const errorCode = params.get('error_code');
    const errorDescription = params.get('error_description');

    if (!errorCode?.startsWith('4') || !errorDescription) {
      return;
    }

    this.errorMessage.set(errorDescription);
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  }

  async signInWithGoogle(): Promise<void> {
    this.errorMessage.set(null);
    this.isAuthenticating.set(true);

    const redirectTo = new URL('/login', window.location.origin).toString();
    const { errorMessage, redirectUrl } = await this.authService.signInWithGoogle(redirectTo);
    if (errorMessage) {
      this.errorMessage.set(errorMessage);
      this.isAuthenticating.set(false);
      return;
    }

    if (!redirectUrl) {
      this.errorMessage.set('No OAuth redirect URL was returned.');
      this.isAuthenticating.set(false);
      return;
    }

    try {
      window.location.assign(redirectUrl);
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Could not redirect browser.');
      this.isAuthenticating.set(false);
    }
  }

  async signOut(): Promise<void> {
    this.errorMessage.set(null);

    const { errorMessage } = await this.authService.signOut();
    if (errorMessage) {
      this.errorMessage.set(errorMessage);
    }
  }

  // ── Private ────────────────────────────────────────────────

  private async performInitialization(): Promise<void> {
    if (!this.isConfigured) {
      this.isLoading.set(false);
      return;
    }

    const { session, errorMessage } = await this.authService.getCurrentSession();
    this.session.set(session);

    if (errorMessage) {
      this.errorMessage.set(errorMessage);
    }

    this.authService.onAuthStateChange((nextSession) => {
      this.session.set(nextSession);
    });

    this.isLoading.set(false);
  }
}
