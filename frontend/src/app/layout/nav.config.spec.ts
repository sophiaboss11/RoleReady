import { buildAdminNavItem, buildNavItems, isNavItemActive } from './nav.config';
import type { NavItem } from './nav.config';

const navItems = buildNavItems('usc');
const dashboardItem = findNavItem('Dashboard');
const trainingItem = findNavItem('Training');
const leagueItem = findNavItem('League');
const projectsItem = findNavItem('Projects');

describe('navigation active state', () => {
  it('orders admin navigation by primary workflow', () => {
    expect([...navItems, buildAdminNavItem('usc')].map((item) => item.title)).toEqual([
      'Dashboard',
      'Projects',
      'Training',
      'League',
      'Settings',
    ]);
  });

  it('marks project training detail pages as Training instead of Projects', () => {
    const url =
      '/usc/projects/5549ccef-bbc3-48ae-9e93-d83f5f8438ee/trainings/535ade1d-dfce-4d69-93ad-e119ed3e8f46';

    expect(isNavItemActive(trainingItem, url)).toBe(true);
    expect(isNavItemActive(projectsItem, url)).toBe(false);
  });

  it('marks project detail pages as Projects', () => {
    const url = '/usc/projects/5549ccef-bbc3-48ae-9e93-d83f5f8438ee';

    expect(isNavItemActive(projectsItem, url)).toBe(true);
    expect(isNavItemActive(trainingItem, url)).toBe(false);
  });

  it('keeps top-level nav sections isolated', () => {
    expect(isNavItemActive(dashboardItem, '/usc/dashboard')).toBe(true);
    expect(isNavItemActive(trainingItem, '/usc/training')).toBe(true);
    expect(isNavItemActive(leagueItem, '/usc/league?season=current')).toBe(true);
  });
});

function findNavItem(title: string): NavItem {
  const item = navItems.find((navItem) => navItem.title === title);
  if (!item) {
    throw new Error(`Missing nav item: ${title}`);
  }
  return item;
}
