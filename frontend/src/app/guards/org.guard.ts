import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { AuthFacade } from '../services/auth.facade';
import { OrganizationFacade } from '../services/organization.facade';
import { ProfileFacade } from '../services/profile.facade';

export const orgGuard: CanActivateFn = async (route) => {
  const authFacade = inject(AuthFacade);
  const orgFacade = inject(OrganizationFacade);
  const profileFacade = inject(ProfileFacade);
  const router = inject(Router);

  await authFacade.ensureInitialized();
  await Promise.all([orgFacade.ensureInitialized(), profileFacade.ensureInitialized()]);

  if (!orgFacade.hasOrganizations()) {
    return router.createUrlTree(['/no-organization']);
  }

  const slug = route.paramMap.get('orgSlug');
  if (slug) {
    const found = orgFacade.setActiveOrganizationBySlug(slug);
    if (!found) {
      const defaultSlug = orgFacade.defaultOrgSlug();
      return router.createUrlTree([`/${defaultSlug}`, 'dashboard']);
    }
  }

  return true;
};
