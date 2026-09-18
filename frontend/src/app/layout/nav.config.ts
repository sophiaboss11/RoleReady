export interface NavItem {
  readonly title: string;
  readonly url: string;
  readonly icon: string;
  readonly section: NavSection;
}

export type NavSection = 'dashboard' | 'training' | 'league' | 'projects' | 'settings';

export function buildNavItems(orgSlug: string): readonly NavItem[] {
  return [
    {
      title: 'Dashboard',
      url: `/${orgSlug}/dashboard`,
      icon: 'lucideLayoutDashboard',
      section: 'dashboard',
    },
    { title: 'Projects', url: `/${orgSlug}/projects`, icon: 'lucideFolder', section: 'projects' },
    { title: 'Training', url: `/${orgSlug}/training`, icon: 'lucidePlay', section: 'training' },
    { title: 'League', url: `/${orgSlug}/league`, icon: 'lucideTrophy', section: 'league' },
  ];
}

export function buildAdminNavItem(orgSlug: string): NavItem {
  return {
    title: 'Settings',
    url: `/${orgSlug}/settings`,
    icon: 'lucideSettings',
    section: 'settings',
  };
}

export function isNavItemActive(item: NavItem, url: string): boolean {
  const segments = toPathSegments(url);
  const primarySection = segments[1] ?? '';
  const projectChildSection = segments[3] ?? '';

  if (item.section === 'training') {
    return (
      primarySection === 'training' ||
      (primarySection === 'projects' && projectChildSection === 'trainings')
    );
  }

  if (item.section === 'projects') {
    return primarySection === 'projects' && projectChildSection !== 'trainings';
  }

  return primarySection === item.section;
}

function toPathSegments(url: string): readonly string[] {
  const path = url.split(/[?#]/, 1)[0] ?? '';
  return path.split('/').filter(Boolean);
}
