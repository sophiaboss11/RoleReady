import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { OrganizationFacade } from '../services/organization.facade';

export const adminGuard: CanActivateFn = () => {
  const orgFacade = inject(OrganizationFacade);
  const router = inject(Router);

  if (!orgFacade.isAdmin()) {
    const slug = orgFacade.activeOrgSlug();
    return router.createUrlTree([`/${slug}`, 'dashboard']);
  }

  return true;
};
