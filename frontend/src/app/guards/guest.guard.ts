import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { AuthFacade } from '../services/auth.facade';
import { OrganizationFacade } from '../services/organization.facade';

const PENDING_INVITE_TOKEN_KEY = 'pendingInviteToken';

/**
 * Protects guest-only routes (login, etc.).
 * Ensures AuthFacade is initialized, then redirects authenticated
 * users to /:orgSlug/dashboard so they don't see the login form unnecessarily.
 *
 * If a pending invite token exists in sessionStorage (set by the
 * invite page before redirecting to login), redirects the
 * now-authenticated user back to /invite to complete the join flow.
 */
export const guestGuard: CanActivateFn = async () => {
  const authFacade = inject(AuthFacade);
  const orgFacade = inject(OrganizationFacade);
  const router = inject(Router);

  await authFacade.ensureInitialized();

  if (authFacade.user()) {
    const pendingToken = sessionStorage.getItem(PENDING_INVITE_TOKEN_KEY);
    if (pendingToken) {
      return router.createUrlTree(['/invite'], { queryParams: { token: pendingToken } });
    }

    await orgFacade.ensureInitialized();
    const slug = orgFacade.defaultOrgSlug();
    if (slug) {
      return router.createUrlTree([`/${slug}`, 'dashboard']);
    }
    return router.createUrlTree(['/no-organization']);
  }

  return true;
};
