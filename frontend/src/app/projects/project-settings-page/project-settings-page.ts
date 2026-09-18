import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeft,
  lucideArrowRight,
  lucideCheck,
  lucideCircleAlert,
  lucideRefreshCw,
  lucideSparkles,
  lucideTrash2,
  lucideFileText,
  lucideUploadCloud,
  lucideX,
} from '@ng-icons/lucide';
import { HlmAlertImports } from '@app/ui/alert';
import { HlmBadgeImports } from '@app/ui/badge';
import { HlmButtonImports } from '@app/ui/button';
import { HlmCardImports } from '@app/ui/card';
import { HlmIconImports } from '@app/ui/icon';
import { HlmInputImports } from '@app/ui/input';
import { HlmLabelImports } from '@app/ui/label';
import { HlmSkeletonImports } from '@app/ui/skeleton';
import { HlmSpinnerImports } from '@app/ui/spinner';
import { ProjectFacade } from '../../services/project.facade';
import { OrganizationFacade } from '../../services/organization.facade';
import { IngestionFacade } from '../../services/ingestion.facade';
import { JobRealtimeService } from '../../services/job-realtime.service';
import type { Project } from '../../domain/project.types';

@Component({
  selector: 'app-project-settings-page',
  imports: [
    FormsModule,
    RouterLink,
    NgIcon,
    HlmAlertImports,
    HlmBadgeImports,
    HlmButtonImports,
    HlmCardImports,
    HlmIconImports,
    HlmInputImports,
    HlmLabelImports,
    HlmSkeletonImports,
    HlmSpinnerImports,
  ],
  providers: [
    provideIcons({
      lucideArrowLeft,
      lucideArrowRight,
      lucideCheck,
      lucideCircleAlert,
      lucideRefreshCw,
      lucideSparkles,
      lucideTrash2,
      lucideFileText,
      lucideUploadCloud,
      lucideX,
    }),
    JobRealtimeService,
    IngestionFacade,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-4xl space-y-8">
      <header>
        <a hlmBtn variant="ghost" size="sm" [routerLink]="backLink()" class="mb-4 -ml-2">
          <ng-icon name="lucideArrowLeft" />
          Back to project
        </a>
        @if (project()) {
          <h1 class="text-2xl font-bold tracking-tight">{{ project()!.projectName }}</h1>
          <p class="text-sm text-muted-foreground">Edit project details and integration URLs.</p>
        }
      </header>

      @if (isLoading()) {
        <!-- Skeleton: General card -->
        <section hlmCard role="status" aria-label="Loading project">
          <div hlmCardHeader>
            <hlm-skeleton class="h-5 w-20" />
            <hlm-skeleton class="h-4 w-48" />
          </div>
          <div hlmCardContent class="space-y-4">
            <div class="space-y-2">
              <hlm-skeleton class="h-4 w-24" />
              <hlm-skeleton class="h-9 w-full max-w-md" />
            </div>
            <div class="space-y-2">
              <hlm-skeleton class="h-4 w-24" />
              <hlm-skeleton class="h-9 w-full max-w-md" />
            </div>
          </div>
        </section>
        <!-- Skeleton: Integrations card -->
        <section hlmCard>
          <div hlmCardHeader>
            <hlm-skeleton class="h-5 w-28" />
            <hlm-skeleton class="h-4 w-56" />
          </div>
          <div hlmCardContent class="space-y-4">
            @for (_ of [0, 1, 2]; track $index) {
              <div class="space-y-2">
                <hlm-skeleton class="h-4 w-24" />
                <hlm-skeleton class="h-9 w-full max-w-md" />
              </div>
            }
          </div>
        </section>
      } @else if (!project()) {
        <div hlmAlert variant="destructive">
          <ng-icon hlm hlmAlertIcon name="lucideCircleAlert" />
          <p hlmAlertDescription>Project not found.</p>
        </div>
      } @else {
        @if (saveError()) {
          <div hlmAlert variant="destructive">
            <ng-icon hlm hlmAlertIcon name="lucideCircleAlert" />
            <p hlmAlertDescription>{{ saveError() }}</p>
          </div>
        }

        @if (saveSuccess()) {
          <div hlmAlert>
            <ng-icon hlm hlmAlertIcon name="lucideCheck" />
            <p hlmAlertDescription>Project updated successfully.</p>
          </div>
        }

        <!-- General -->
        <section hlmCard>
          <div hlmCardHeader>
            <h2 hlmCardTitle>General</h2>
            <p hlmCardDescription>Project name and description.</p>
          </div>
          <div hlmCardContent>
            <div class="space-y-4">
              <div class="space-y-2">
                <label hlmLabel for="edit-name">Project name</label>
                <input
                  hlmInput
                  id="edit-name"
                  type="text"
                  required
                  [ngModel]="projectName()"
                  (ngModelChange)="projectName.set($event)"
                  name="projectName"
                  class="w-full max-w-md"
                />
              </div>
              <div class="space-y-2">
                <label hlmLabel for="edit-description">Description</label>
                <input
                  hlmInput
                  id="edit-description"
                  type="text"
                  [ngModel]="projectDescription()"
                  (ngModelChange)="projectDescription.set($event)"
                  name="projectDescription"
                  class="w-full max-w-md"
                />
              </div>
            </div>
          </div>
        </section>

        <!-- Integrations -->
        <section hlmCard>
          <div hlmCardHeader>
            <h2 hlmCardTitle>Integrations</h2>
            <p hlmCardDescription>External service URLs for this project.</p>
          </div>
          <div hlmCardContent>
            <div class="space-y-4">
              <div class="space-y-2">
                <label hlmLabel for="edit-github">GitHub URL</label>
                <input
                  hlmInput
                  id="edit-github"
                  type="url"
                  placeholder="https://github.com/org/repo"
                  [ngModel]="githubLink()"
                  (ngModelChange)="githubLink.set($event)"
                  name="githubLink"
                  class="w-full max-w-md"
                />
              </div>
              <div class="space-y-2">
                <label hlmLabel for="edit-jira">Jira URL</label>
                <input
                  hlmInput
                  id="edit-jira"
                  type="url"
                  placeholder="https://org.atlassian.net/browse/PROJECT"
                  [ngModel]="jiraLink()"
                  (ngModelChange)="jiraLink.set($event)"
                  name="jiraLink"
                  class="w-full max-w-md"
                />
              </div>
              <div class="space-y-2">
                <label hlmLabel for="edit-confluence">Confluence URL</label>
                <input
                  hlmInput
                  id="edit-confluence"
                  type="url"
                  placeholder="https://org.atlassian.net/wiki/spaces/PROJECT"
                  [ngModel]="confluenceLink()"
                  (ngModelChange)="confluenceLink.set($event)"
                  name="confluenceLink"
                  class="w-full max-w-md"
                />
              </div>
            </div>
          </div>
        </section>

        <!-- Save -->
        <div class="flex justify-end">
          <button hlmBtn type="button" [disabled]="projectFacade.isSaving()" (click)="onSave()">
            @if (projectFacade.isSaving()) {
              <hlm-spinner class="text-sm" />
              Saving...
            } @else {
              Save changes
            }
          </button>
        </div>

        <hr />

        <!-- Documents -->
        <section hlmCard>
          <div hlmCardHeader>
            <h2 hlmCardTitle>Documents</h2>
            <p hlmCardDescription>Upload reference documents for this project.</p>
          </div>
          <div hlmCardContent class="space-y-4">
            @if (projectFacade.documents().length > 0) {
              <ul class="space-y-2">
                @for (doc of projectFacade.documents(); track doc.id) {
                  <li class="flex items-center gap-2 rounded-md border px-3 py-2 text-sm bg-background">
                    <ng-icon name="lucideFileText" class="text-muted-foreground" />
                    <span class="flex-1 truncate">{{ doc.filename }}</span>
                  </li>
                }
              </ul>
            } @else {
              <p class="text-sm text-muted-foreground">No documents uploaded yet.</p>
            }

            <div class="space-y-4 pt-2 border-t">
              <h3 class="text-sm font-medium">Attach New Documents</h3>
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
                <div class="flex justify-end">
                  <button hlmBtn type="button" [disabled]="projectFacade.isUploadingDocuments()" (click)="uploadStagedDocuments()">
                    @if (projectFacade.isUploadingDocuments()) {
                      <hlm-spinner class="text-sm" />
                      Uploading...
                    } @else {
                      Upload {{ selectedFiles.length }} File{{ selectedFiles.length === 1 ? '' : 's' }}
                    }
                  </button>
                </div>
              }

              <div class="space-y-2">
                <label hlmLabel for="settings-upload-docs" class="cursor-pointer block">
                  <div class="flex items-center justify-center gap-2 rounded-md border-2 border-dashed border-muted-foreground/25 bg-muted/20 px-4 py-8 text-sm transition-colors hover:bg-muted/40">
                    <ng-icon name="lucideUploadCloud" class="text-xl text-muted-foreground" />
                    <span class="font-medium text-muted-foreground">Click to select files to upload</span>
                  </div>
                </label>
                <input
                  id="settings-upload-docs"
                  type="file"
                  multiple
                  class="sr-only"
                  [disabled]="projectFacade.isUploadingDocuments()"
                  (change)="onFileSelect($event)"
                />
              </div>
            </div>

            @if (uploadError()) {
              <p class="text-sm text-destructive">{{ uploadError() }}</p>
            }
          </div>
        </section>

        <!-- Data Sync -->
        @if (savedGithubLink()) {
          <section hlmCard>
            <div hlmCardHeader>
              <h2 hlmCardTitle>Data Sync</h2>
              <p hlmCardDescription>
                Sync data from
                <a
                  [href]="savedGithubLink()!"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="underline"
                >
                  {{ savedGithubLink() }}
                </a>
              </p>
            </div>
            <div hlmCardContent>
              @if (hasUnsavedChanges()) {
                <p class="text-sm text-muted-foreground">Save your changes before syncing.</p>
              } @else {
                <div class="flex items-center gap-4">
                  @switch (githubSyncStatus()) {
                    @case ('idle') {
                      <button
                        hlmBtn
                        variant="outline"
                        size="sm"
                        [disabled]="ingestionFacade.isStarting()"
                        (click)="onSyncGithub()"
                      >
                        <ng-icon name="lucideRefreshCw" />
                        Sync GitHub
                      </button>
                    }
                    @case ('pending') {
                      <div class="flex items-center gap-2 text-sm text-muted-foreground">
                        <hlm-spinner class="text-sm" />
                        Starting sync...
                      </div>
                    }
                    @case ('running') {
                      <div class="flex items-center gap-2 text-sm text-muted-foreground">
                        <hlm-spinner class="text-sm" />
                        Syncing GitHub data...
                      </div>
                    }
                    @case ('completed') {
                      <div class="flex items-center gap-3">
                        <span
                          hlmBadge
                          class="bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                        >
                          <ng-icon name="lucideCheck" />
                          Synced
                        </span>
                        <button hlmBtn variant="outline" size="sm" (click)="onSyncGithub()">
                          <ng-icon name="lucideRefreshCw" />
                          Re-sync
                        </button>
                      </div>
                    }
                    @case ('failed') {
                      <div class="flex items-center gap-3">
                        <span hlmBadge variant="destructive">Failed</span>
                        <button hlmBtn variant="outline" size="sm" (click)="onSyncGithub()">
                          <ng-icon name="lucideRefreshCw" />
                          Retry
                        </button>
                      </div>
                      @if (ingestionFacade.latestGithubJob()?.errorMessage) {
                        <p class="text-sm text-destructive mt-2">
                          {{ ingestionFacade.latestGithubJob()!.errorMessage }}
                        </p>
                      }
                    }
                  }
                </div>
              }
            </div>
          </section>
        }

        <!-- Generate Content -->
        <section hlmCard class="border-primary/20 bg-primary/5">
          <div hlmCardHeader>
            <div class="flex items-center gap-2">
              <ng-icon name="lucideSparkles" class="text-primary" />
              <h2 hlmCardTitle>Generate Content</h2>
            </div>
            <p hlmCardDescription>
              Create infographics, audio, and more from your project's data sources.
            </p>
          </div>
          <div hlmCardContent>
            <a hlmBtn [routerLink]="generateLink()">
              Generate
              <ng-icon name="lucideArrowRight" />
            </a>
          </div>
        </section>

        <!-- Danger Zone -->
        <section hlmCard class="border-destructive/30">
          <div hlmCardHeader>
            <h2 hlmCardTitle class="text-destructive">Danger Zone</h2>
            <p hlmCardDescription>Irreversible actions for this project.</p>
          </div>
          <div hlmCardContent>
            <button
              hlmBtn
              variant="destructive"
              [disabled]="projectFacade.isDeleting()"
              (click)="onDelete()"
            >
              @if (projectFacade.isDeleting()) {
                <hlm-spinner class="text-sm" />
                Deleting...
              } @else {
                <ng-icon name="lucideTrash2" />
                Delete project
              }
            </button>
          </div>
        </section>
      }
    </div>
  `,
})
export class ProjectSettingsPage implements OnInit {
  protected readonly projectFacade = inject(ProjectFacade);
  protected readonly ingestionFacade = inject(IngestionFacade);
  private readonly orgFacade = inject(OrganizationFacade);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly backLink = computed(() => {
    const slug = this.orgFacade.activeOrgSlug();
    const projectId = this.route.snapshot.paramMap.get('projectId');
    return `/${slug}/projects/${projectId}`;
  });

  protected readonly generateLink = computed(() => {
    const slug = this.orgFacade.activeOrgSlug();
    const projectId = this.route.snapshot.paramMap.get('projectId');
    return `/${slug}/projects/${projectId}/generate`;
  });

  protected readonly isLoading = signal(true);
  protected readonly saveError = signal<string | null>(null);
  protected readonly saveSuccess = signal(false);

  protected readonly project = computed(() => {
    const projectId = this.route.snapshot.paramMap.get('projectId');
    return this.projectFacade.projects().find((p) => p.id === projectId) ?? null;
  });

  protected readonly savedGithubLink = computed(() => this.project()?.githubLink ?? null);

  protected readonly hasUnsavedChanges = computed(() => {
    const proj = this.project();
    if (!proj) return false;
    return (
      this.projectName().trim() !== proj.projectName ||
      this.projectDescription().trim() !== (proj.projectDescription ?? '') ||
      (this.githubLink().trim() || null) !== proj.githubLink ||
      (this.jiraLink().trim() || null) !== proj.jiraLink ||
      (this.confluenceLink().trim() || null) !== proj.confluenceLink
    );
  });

  protected readonly githubSyncStatus = computed(() => {
    const job = this.ingestionFacade.latestGithubJob();
    if (!job) return 'idle' as const;
    return job.status;
  });

  protected projectName = signal('');
  protected projectDescription = signal('');
  protected githubLink = signal('');
  protected jiraLink = signal('');
  protected confluenceLink = signal('');
  protected uploadError = signal<string | null>(null);
  protected selectedFiles: File[] = [];

  async ngOnInit(): Promise<void> {
    const error = await this.projectFacade.loadProjects();
    this.isLoading.set(false);

    if (error) {
      console.error('[ProjectEditPage] loadProjects failed:', error);
      return;
    }

    this.populateForm(this.project());

    const proj = this.project();
    if (proj) {
      await Promise.all([
        this.ingestionFacade.checkForActiveJob(proj.id),
        this.projectFacade.loadDocuments(proj.id),
      ]);
    }
  }

  protected async onSave(): Promise<void> {
    const proj = this.project();
    if (!proj) return;

    this.saveError.set(null);
    this.saveSuccess.set(false);

    const error = await this.projectFacade.updateProject(proj.id, {
      projectName: this.projectName().trim(),
      projectDescription: this.projectDescription().trim(),
      githubLink: this.githubLink().trim() || null,
      jiraLink: this.jiraLink().trim() || null,
      confluenceLink: this.confluenceLink().trim() || null,
    });

    if (error) {
      this.saveError.set(error.message);
      return;
    }

    this.saveSuccess.set(true);
    this.populateForm(this.project());
  }

  protected async onSyncGithub(): Promise<void> {
    const proj = this.project();
    if (!proj?.githubLink) return;

    const error = await this.ingestionFacade.startGithubIngestion(proj.id, proj.githubLink);
    if (error) {
      this.saveError.set(error.message);
    }
  }

  protected async onDelete(): Promise<void> {
    const proj = this.project();
    if (!proj) return;
    if (!confirm(`Are you sure you want to delete "${proj.projectName}"? This cannot be undone.`))
      return;

    const error = await this.projectFacade.deleteProject(proj.id);
    if (error) {
      this.saveError.set(error.message);
      return;
    }

    const slug = this.orgFacade.activeOrgSlug();
    await this.router.navigate([`/${slug}/projects`]);
  }

  private populateForm(project: Project | null): void {
    if (!project) return;
    this.projectName.set(project.projectName);
    this.projectDescription.set(project.projectDescription ?? '');
    this.githubLink.set(project.githubLink ?? '');
    this.jiraLink.set(project.jiraLink ?? '');
    this.confluenceLink.set(project.confluenceLink ?? '');
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

  protected async uploadStagedDocuments(): Promise<void> {
    const proj = this.project();
    if (!proj || this.selectedFiles.length === 0) return;

    this.uploadError.set(null);
    const error = await this.projectFacade.uploadDocuments(proj.id, this.selectedFiles);
    if (error) {
      this.uploadError.set(error.message);
    } else {
      this.selectedFiles = []; // Clear staged files on successful upload
    }
  }
}
