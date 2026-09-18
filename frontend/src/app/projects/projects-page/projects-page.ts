import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCircleAlert,
  lucideLoader,
  lucidePencil,
  lucidePlus,
  lucideTrash2,
  lucideFileText,
  lucideUploadCloud,
  lucideX,
} from '@ng-icons/lucide';
import { HlmAlertImports } from '@app/ui/alert';
import { HlmButtonImports } from '@app/ui/button';
import { HlmCardImports } from '@app/ui/card';
import { HlmFormFieldImports } from '@app/ui/form-field';
import { HlmIconImports } from '@app/ui/icon';
import { HlmInputImports } from '@app/ui/input';
import { HlmLabelImports } from '@app/ui/label';
import { HlmSkeletonImports } from '@app/ui/skeleton';
import { HlmSpinnerImports } from '@app/ui/spinner';
import { HlmTableImports } from '@app/ui/table';
import { ProjectFacade } from '../../services/project.facade';
import { OrganizationFacade } from '../../services/organization.facade';

@Component({
  selector: 'app-projects-page',
  imports: [
    FormsModule,
    RouterLink,
    NgIcon,
    HlmAlertImports,
    HlmButtonImports,
    HlmCardImports,
    HlmFormFieldImports,
    HlmIconImports,
    HlmInputImports,
    HlmLabelImports,
    HlmSkeletonImports,
    HlmSpinnerImports,
    HlmTableImports,
  ],
  providers: [
    provideIcons({ lucideCircleAlert, lucideLoader, lucidePencil, lucidePlus, lucideTrash2, lucideFileText, lucideUploadCloud, lucideX }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-4xl space-y-8">
      <header>
        <h1 class="text-2xl font-bold tracking-tight">Projects</h1>
        <p class="text-sm text-muted-foreground">Manage projects for your organization.</p>
      </header>

      @if (isAdmin()) {
        <!-- Create Form -->
        <section hlmCard>
          <div hlmCardHeader>
            <h2 hlmCardTitle>Create a new project</h2>
          </div>
          <div hlmCardContent>
            @if (createError()) {
              <div hlmAlert variant="destructive" class="mb-4">
                <ng-icon hlm hlmAlertIcon name="lucideCircleAlert" />
                <p hlmAlertDescription>{{ createError() }}</p>
              </div>
            }
            <form #createForm="ngForm" class="space-y-4" (ngSubmit)="onCreate()">
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <hlm-form-field>
                  <label hlmLabel for="project-name">Project name</label>
                  <input
                    hlmInput
                    id="project-name"
                    type="text"
                    placeholder="My Project"
                    required
                    minlength="1"
                    [(ngModel)]="projectName"
                    name="projectName"
                    class="w-full"
                  />
                  <hlm-error>Project name is required</hlm-error>
                </hlm-form-field>
                <hlm-form-field>
                  <label hlmLabel for="project-description">Description</label>
                  <input
                    hlmInput
                    id="project-description"
                    type="text"
                    placeholder="Brief description"
                    required
                    minlength="1"
                    [(ngModel)]="projectDescription"
                    name="projectDescription"
                    class="w-full"
                  />
                  <hlm-error>Description is required</hlm-error>
                </hlm-form-field>
              </div>
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <hlm-form-field>
                  <label hlmLabel for="github-link">GitHub repository (optional)</label>
                  <input
                    hlmInput
                    id="github-link"
                    type="url"
                    placeholder="https://github.com/org/repo"
                    [(ngModel)]="githubLink"
                    name="githubLink"
                    class="w-full"
                  />
                </hlm-form-field>
                <hlm-form-field>
                  <label hlmLabel for="repository-token">GitHub Token (optional)</label>
                  <input
                    hlmInput
                    id="repository-token"
                    type="password"
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    [(ngModel)]="repositoryToken"
                    name="repositoryToken"
                    class="w-full"
                  />
                </hlm-form-field>
              </div>
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <hlm-form-field>
                  <label hlmLabel for="jira-link">Jira Project (optional)</label>
                  <input
                    hlmInput
                    id="jira-link"
                    type="url"
                    placeholder="https://your-domain.atlassian.net/jira/software/c/projects/KEY"
                    [(ngModel)]="jiraLink"
                    name="jiraLink"
                    class="w-full"
                  />
                </hlm-form-field>
                <hlm-form-field>
                  <label hlmLabel for="confluence-link">Confluence Space (optional)</label>
                  <input
                    hlmInput
                    id="confluence-link"
                    type="url"
                    placeholder="https://your-domain.atlassian.net/wiki/spaces/KEY"
                    [(ngModel)]="confluenceLink"
                    name="confluenceLink"
                    class="w-full"
                  />
                </hlm-form-field>
              </div>

              <!-- Documents Upload -->
              <div class="space-y-2 mt-4">
                <p class="text-sm font-medium leading-none">Documents</p>
                <div class="space-y-2">
                  @if (selectedFiles.length > 0) {
                    <ul class="space-y-2">
                      @for (file of selectedFiles; track file.name; let i = $index) {
                        <li class="flex items-center gap-2 rounded-md border px-3 py-2 text-sm bg-background">
                          <ng-icon name="lucideFileText" class="text-muted-foreground" />
                          <span class="flex-1 truncate">{{ file.name }}</span>
                          <button
                            type="button"
                            hlmBtn
                            variant="ghost"
                            size="icon-sm"
                            (click)="onRemoveFile(i)"
                            class="text-muted-foreground hover:text-destructive"
                            aria-label="Remove file"
                          >
                            <ng-icon name="lucideX" />
                          </button>
                        </li>
                      }
                    </ul>
                  }
                  <label hlmLabel for="create-upload-docs" class="cursor-pointer block">
                    <div class="flex items-center justify-center gap-2 rounded-md border-2 border-dashed border-muted-foreground/25 bg-muted/20 px-4 py-8 text-sm transition-colors hover:bg-muted/40">
                      <ng-icon name="lucideUploadCloud" class="text-xl text-muted-foreground" />
                      <span class="font-medium text-muted-foreground">Attach documents</span>
                    </div>
                  </label>
                  <input
                    id="create-upload-docs"
                    type="file"
                    multiple
                    class="sr-only"
                    [disabled]="projectFacade.isSaving()"
                    (change)="onFileSelect($event)"
                  />
                </div>
              </div>

              <div class="mt-4">
                <button
                  hlmBtn
                  type="submit"
                  [disabled]="createForm.invalid || projectFacade.isSaving()"
                >
                  @if (projectFacade.isSaving()) {
                    <hlm-spinner class="text-sm" />
                    Creating...
                  } @else {
                    <ng-icon name="lucidePlus" />
                    Create
                  }
                </button>
              </div>
            </form>
          </div>
        </section>
      }

      <!-- Projects Table -->
      <section hlmCard>
        <div hlmCardHeader>
          <h2 hlmCardTitle>Projects</h2>
          <p hlmCardDescription>All projects in this organization.</p>
        </div>
        <div hlmCardContent>
          @if (projectFacade.isLoading()) {
            <div class="space-y-4" role="status" aria-label="Loading projects">
              @for (_ of skeletonRows; track $index) {
                <div class="flex items-center gap-4">
                  <hlm-skeleton class="h-4 w-40" />
                  <hlm-skeleton class="h-4 w-56" />
                  <hlm-skeleton class="h-4 w-24" />
                </div>
              }
            </div>
          } @else if (projectFacade.projects().length === 0) {
            <p class="py-4 text-sm text-muted-foreground">
              No projects yet. Create one above to get started.
            </p>
          } @else {
            <div hlmTableContainer>
              <table hlmTable>
                <thead hlmTHead>
                  <tr hlmTr>
                    <th hlmTh>Name</th>
                    <th hlmTh>Description</th>
                    <th hlmTh>Status</th>
                    <th hlmTh>Created</th>
                    @if (isAdmin()) {
                      <th hlmTh class="w-24"><span class="sr-only">Actions</span></th>
                    }
                  </tr>
                </thead>
                <tbody hlmTBody>
                  @for (project of projectFacade.projects(); track project.id) {
                    <tr hlmTr class="cursor-pointer" [routerLink]="[project.id]">
                      <td hlmTd class="font-medium">{{ project.projectName }}</td>
                      <td
                        hlmTd
                        class="max-w-[16rem] !whitespace-normal align-top text-muted-foreground"
                        [attr.title]="project.projectDescription?.trim() || null"
                      >
                        <p class="line-clamp-2 break-words leading-5">
                          {{ project.projectDescription?.trim() || '—' }}
                        </p>
                      </td>
                      <td hlmTd>
                        <span
                          class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                          [class]="statusClass(project.status)"
                        >
                          {{ statusLabel(project.status) }}
                        </span>
                      </td>
                      <td hlmTd class="text-muted-foreground">
                        {{ formatDate(project.createdAt) }}
                      </td>
                      @if (isAdmin()) {
                        <td hlmTd>
                          <div class="flex items-center gap-1">
                            <a
                              hlmBtn
                              variant="ghost"
                              size="icon-sm"
                              [routerLink]="[project.id, 'settings']"
                              [attr.aria-label]="'Edit ' + project.projectName"
                              (click)="$event.stopPropagation()"
                            >
                              <ng-icon name="lucidePencil" />
                            </a>
                            <button
                              hlmBtn
                              variant="ghost"
                              size="icon-sm"
                              [attr.aria-label]="'Delete ' + project.projectName"
                              (click)="onDelete($event, project.id)"
                            >
                              <ng-icon name="lucideTrash2" class="text-destructive" />
                            </button>
                          </div>
                        </td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>
      </section>
    </div>
  `,
})
export class ProjectsPage implements OnInit {
  protected readonly projectFacade = inject(ProjectFacade);
  private readonly orgFacade = inject(OrganizationFacade);
  private readonly router = inject(Router);

  protected readonly isAdmin = computed(() => this.orgFacade.isAdmin());

  protected readonly skeletonRows = Array.from({ length: 3 });

  protected projectName = '';
  protected projectDescription = '';
  protected githubLink = '';
  protected jiraLink = '';
  protected confluenceLink = '';
  protected repositoryToken = '';
  protected readonly createError = signal<string | null>(null);
  protected selectedFiles: File[] = [];

  async ngOnInit(): Promise<void> {
    const error = await this.projectFacade.loadProjects();
    if (error) {
      console.error('[ProjectsPage] loadProjects failed:', error);
    }
  }

  protected async onCreate(): Promise<void> {
    this.createError.set(null);

    const orgId = this.orgFacade.activeOrgId();
    const orgSlug = this.orgFacade.activeOrgSlug();
    if (!orgId || !orgSlug) return;

    const result = await this.projectFacade.createProject({
      projectName: this.projectName.trim(),
      projectDescription: this.projectDescription.trim(),
      organizationId: orgId,
      githubLink: this.githubLink.trim() || null,
      jiraLink: this.jiraLink.trim() || null,
      confluenceLink: this.confluenceLink.trim() || null,
      repositoryToken: this.repositoryToken.trim() || null,
    });

    if (result.error) {
      this.createError.set(result.error.message);
      return;
    }
    if (!result.project) {
      this.createError.set('Created project is missing from response');
      return;
    }

    if (this.selectedFiles.length > 0) {
      const uploadError = await this.projectFacade.uploadDocuments(result.project.id, this.selectedFiles);
      if (uploadError) {
         console.error('Failed to upload documents', uploadError);
         this.createError.set('Project created, but failed to upload some documents.');
         // Optionally wait a bit or let them navigate manually if it fails
      }
    }

    await this.router.navigate([`/${orgSlug}/projects/${result.project.id}`]);
  }

  protected onFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const newFiles = Array.from(input.files);
    this.selectedFiles = [...this.selectedFiles, ...newFiles];
    input.value = '';
  }

  protected onRemoveFile(index: number): void {
    this.selectedFiles.splice(index, 1);
  }

  protected async onDelete(event: Event, projectId: string): Promise<void> {
    event.stopPropagation();
    event.preventDefault();
    if (!confirm('Are you sure you want to delete this project?')) return;
    const error = await this.projectFacade.deleteProject(projectId);
    if (error) {
      this.createError.set(error.message);
    }
  }

  protected formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString();
  }

  protected statusLabel(status: string): string {
    const labels: Record<string, string> = {
      created: 'Created',
      ingesting: 'Ingesting\u2026',
      ingestion_completed: 'Ingested',
      generating_assets: 'Generating\u2026',
      completed: 'Completed',
      failed: 'Failed',
    };
    return labels[status] ?? status;
  }

  protected statusClass(status: string): string {
    const classes: Record<string, string> = {
      created: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
      ingesting: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
      ingestion_completed: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300',
      generating_assets: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
      completed: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
      failed: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    };
    return classes[status] ?? 'bg-gray-100 text-gray-700';
  }
}
