import { Injectable } from '@angular/core';
import type { Session } from '@supabase/supabase-js';
import { getSupabaseClientState } from '../lib/supabase.client';

interface AuthResult {
  errorMessage: string | null;
  redirectUrl?: string;
}

interface SessionResult {
  session: Session | null;
  errorMessage: string | null;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly clientState = getSupabaseClientState();

  readonly isConfigured = this.clientState.client !== null;
  readonly configurationError = this.clientState.error;

  async getCurrentSession(): Promise<SessionResult> {
    if (!this.clientState.client) {
      return {
        session: null,
        errorMessage: this.clientState.error,
      };
    }

    const { data, error } = await this.clientState.client.auth.getSession();

    return {
      session: data.session,
      errorMessage: error?.message ?? null,
    };
  }

  onAuthStateChange(callback: (session: Session | null) => void): (() => void) | null {
    if (!this.clientState.client) {
      return null;
    }

    const { data } = this.clientState.client.auth.onAuthStateChange((_event, session) => {
      callback(session);
    });

    return () => data.subscription.unsubscribe();
  }

  async signInWithGoogle(redirectTo: string): Promise<AuthResult> {
    if (!this.clientState.client) {
      return { errorMessage: this.clientState.error };
    }

    try {
      const { data, error } = await this.clientState.client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          // We redirect manually to surface browser-specific failures explicitly.
          skipBrowserRedirect: true,
        },
      });

      return {
        errorMessage: error?.message ?? null,
        redirectUrl: data?.url ?? undefined,
      };
    } catch (error) {
      return {
        errorMessage: error instanceof Error ? error.message : 'Unknown sign-in error',
      };
    }
  }

  async signOut(): Promise<AuthResult> {
    if (!this.clientState.client) {
      return { errorMessage: this.clientState.error };
    }

    const { error } = await this.clientState.client.auth.signOut();

    return {
      errorMessage: error?.message ?? null,
    };
  }
}
