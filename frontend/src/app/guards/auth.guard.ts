import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { AuthFacade } from '../services/auth.facade';

/**
 * Protects authenticated routes.
 * Ensures AuthFacade is initialized, then checks for an active session.
 * Redirects to /login when no session exists.
 */
export const authGuard: CanActivateFn = async () => {
  const authFacade = inject(AuthFacade);
  const router = inject(Router);

  await authFacade.ensureInitialized();

  if (!authFacade.user()) {
    return router.createUrlTree(['/login']);
  }

  return true;
};
