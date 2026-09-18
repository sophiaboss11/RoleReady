import { Routes } from '@angular/router';
import { AccountPage } from './account/account-page';
import { Dashboard } from './dashboard/dashboard';
import { adminGuard } from './guards/admin.guard';
import { authGuard } from './guards/auth.guard';
import { guestGuard } from './guards/guest.guard';
import { orgGuard } from './guards/org.guard';
import { LandingPage } from './landing-page/landing-page';
import { MainLayoutComponent } from './layout/main-layout';
import { LoginPage } from './login-page/login-page';
import { InvitePage } from './invite-page/invite-page';
import { NoOrganizationPage } from './no-organization-page/no-organization-page';
import { MembersPage } from './settings/members-page/members-page';
import { ProjectDetailPage } from './projects/project-detail-page/project-detail-page';
import { ProjectGeneratePage } from './projects/project-generate-page/project-generate-page';
import { ProjectSettingsPage } from './projects/project-settings-page/project-settings-page';
import { ProjectsPage } from './projects/projects-page/projects-page';
import { TrainingCreatePage } from './projects/training-create-page/training-create-page';
import { TrainingDetailPage } from './projects/training-detail-page/training-detail-page';
import { LearnerProfilePage } from './learner/learner-profile-page';
import { LeaderboardPage } from './social/leaderboard-page';
import { TrainingListPage } from './video-player/training-list-page';

export const routes: Routes = [
  { path: '', pathMatch: 'full', component: LandingPage },
  { path: 'login', canActivate: [guestGuard], component: LoginPage },
  { path: 'invite', component: InvitePage },
  { path: 'no-organization', canActivate: [authGuard], component: NoOrganizationPage },
  {
    path: ':orgSlug',
    component: MainLayoutComponent,
    canActivate: [authGuard, orgGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'account', component: AccountPage },
      { path: 'dashboard', component: Dashboard },
      { path: 'profile', component: LearnerProfilePage },
      { path: 'league', component: LeaderboardPage },
      { path: 'training', component: TrainingListPage },
      { path: 'projects', component: ProjectsPage },
      { path: 'projects/:projectId', component: ProjectDetailPage },
      {
        path: 'projects/:projectId/trainings/new',
        canActivate: [adminGuard],
        component: TrainingCreatePage,
      },
      {
        path: 'projects/:projectId/trainings/:trainingId',
        component: TrainingDetailPage,
      },
      {
        path: 'projects/:projectId/settings',
        canActivate: [adminGuard],
        component: ProjectSettingsPage,
      },
      {
        path: 'projects/:projectId/generate',
        canActivate: [adminGuard],
        component: ProjectGeneratePage,
      },
      {
        path: 'settings',
        canActivate: [adminGuard],
        children: [
          { path: '', redirectTo: 'members', pathMatch: 'full' },
          { path: 'members', component: MembersPage },
        ],
      },
    ],
  },
];
