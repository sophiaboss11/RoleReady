import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { Dashboard } from './dashboard';
import { AuthFacade } from '../services/auth.facade';
import { DashboardFacade } from '../services/dashboard.facade';
import { OrganizationFacade } from '../services/organization.facade';
import { ProfileFacade } from '../services/profile.facade';

describe('Dashboard', () => {
  let component: Dashboard;
  let fixture: ComponentFixture<Dashboard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [
        {
          provide: DashboardFacade,
          useValue: {
            managerSummaryCards: signal([]),
            managerTrainings: signal([]),
            internInProgressTrainings: signal([]),
            internCompletedTrainings: signal([]),
            overallProgress: signal(0),
            isLoading: signal(false),
            errorMessage: signal(null),
          },
        },
        {
          provide: OrganizationFacade,
          useValue: {
            isAdmin: signal(false),
            activeRole: signal('member'),
          },
        },
        {
          provide: ProfileFacade,
          useValue: {
            profile: signal({
              id: 'profile-1',
              displayName: 'Ryuya',
              avatarUrl: null,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            }),
          },
        },
        {
          provide: AuthFacade,
          useValue: {
            user: signal({
              id: 'user-1',
              email: 'ryuya@example.com',
            }),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Dashboard);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders the role and profile name in the welcome heading', () => {
    fixture.detectChanges();

    const heading = fixture.nativeElement.querySelector('h1');
    expect(heading?.textContent).toContain('Welcome, Intern Ryuya');
  });
});
