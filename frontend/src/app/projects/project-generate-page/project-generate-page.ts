import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeft,
  lucideAudioLines,
  lucideCheck,
  lucideCircleAlert,
  lucideGitBranch,
  lucideGithub,
  lucideImage,
  lucidePenLine,
  lucidePlay,
  lucideRotateCcw,
  lucideFileText,
  lucideUploadCloud,
} from '@ng-icons/lucide';
import { BrnCheckboxImports } from '@spartan-ng/brain/checkbox';
import { BrnRadioGroupImports } from '@spartan-ng/brain/radio-group';
import { HlmAlertImports } from '@app/ui/alert';
import { HlmButtonImports } from '@app/ui/button';
import { HlmCardImports } from '@app/ui/card';
import { HlmIconImports } from '@app/ui/icon';
import { HlmLabelImports } from '@app/ui/label';
import { HlmSkeletonImports } from '@app/ui/skeleton';
import { HlmSpinnerImports } from '@app/ui/spinner';
import { ProjectFacade } from '../../services/project.facade';
import { OrganizationFacade } from '../../services/organization.facade';
import { InfographicFacade } from '../../services/infographic.facade';
import { MindmapFacade } from '../../services/mindmap.facade';
import { AudioFacade } from '../../services/audio.facade';
import { VideoFacade } from '../../services/video.facade';
import { JobRealtimeService } from '../../services/job-realtime.service';
import { PromptFacade } from '../../services/prompt.facade';
import { OUTPUT_TO_PROMPT_TYPE, type PromptType } from '../../domain/prompt.types';

type SourceKey = 'github' | 'jira' | 'confluence';
type OutputType = 'infographic' | 'mindmap' | 'audio' | 'video';

interface SourceOption {
  readonly key: SourceKey;
  readonly label: string;
  readonly icon: string | null;
  readonly configured: boolean;
}

const OUTPUT_OPTIONS: readonly { key: OutputType; label: string; icon: string }[] = [
  { key: 'infographic', label: 'Infographic', icon: 'lucideImage' },
  { key: 'mindmap', label: 'Mindmap', icon: 'lucideGitBranch' },
  { key: 'audio', label: 'Audio', icon: 'lucideAudioLines' },
  { key: 'video', label: 'Video', icon: 'lucidePlay' },
];

@Component({
  selector: 'app-project-generate-page',
  imports: [
    FormsModule,
    RouterLink,
    NgIcon,
    BrnCheckboxImports,
    BrnRadioGroupImports,
    HlmAlertImports,
    HlmButtonImports,
    HlmCardImports,
    HlmIconImports,
    HlmLabelImports,
    HlmSkeletonImports,
    HlmSpinnerImports,
  ],
  providers: [
    JobRealtimeService,
    InfographicFacade,
    MindmapFacade,
    AudioFacade,
    VideoFacade,
    PromptFacade,
    provideIcons({
      lucideArrowLeft,
      lucideAudioLines,
      lucideCheck,
      lucideCircleAlert,
      lucideGitBranch,
      lucideGithub,
      lucideImage,
      lucidePenLine,
      lucidePlay,
      lucideRotateCcw,
      lucideFileText,
      lucideUploadCloud,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-4xl space-y-8">
      <header>
        <a hlmBtn variant="ghost" size="sm" [routerLink]="backLink()" class="mb-4 -ml-2">
          <ng-icon name="lucideArrowLeft" />
          Back to project
        </a>
        <h1 class="text-2xl font-bold tracking-tight">Generate Content</h1>
        <p class="text-sm text-muted-foreground">
          Select data sources and an output type, then generate.
        </p>
      </header>

      @if (isLoading()) {
        <section hlmCard role="status" aria-label="Loading project">
          <div hlmCardHeader>
            <hlm-skeleton class="h-5 w-24" />
          </div>
          <div hlmCardContent class="space-y-3">
            @for (_ of [0, 1, 2]; track $index) {
              <hlm-skeleton class="h-12 w-full max-w-md" />
            }
          </div>
        </section>
      } @else if (!project()) {
        <div
          class="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive"
        >
          <ng-icon name="lucideCircleAlert" />
          Project not found.
        </div>
      } @else {
        <form (ngSubmit)="onSubmit()" class="space-y-8">
          <!-- Sources -->
          <fieldset>
            <section hlmCard>
              <div hlmCardHeader>
                <legend>
                  <h2 hlmCardTitle>Sources</h2>
                </legend>
                <p hlmCardDescription>Choose which data sources to include.</p>
              </div>
              <div hlmCardContent>
                <div class="grid grid-cols-3 gap-4">
                  @for (source of availableSources(); track source.key) {
                    <label
                      hlmLabel
                      class="relative flex flex-col items-center justify-center rounded-lg border-2 border-border bg-background px-4 py-8 transition-colors"
                      [class.hover:bg-accent/10]="source.configured"
                      [class.cursor-pointer]="source.configured"
                      [class.border-primary]="selectedSources().has(source.key)"
                      [class.opacity-50]="!source.configured"
                      [class.cursor-not-allowed]="!source.configured"
                    >
                      <brn-checkbox
                        class="sr-only"
                        [name]="'source-' + source.key"
                        [checked]="selectedSources().has(source.key)"
                        [disabled]="!source.configured"
                        (checkedChange)="onSourceChange(source.key, $event)"
                      />
                      @if (source.icon) {
                        <ng-icon [name]="source.icon" class="mb-3 text-xl" />
                      }
                      @if (selectedSources().has(source.key)) {
                        <ng-icon name="lucideCheck" class="absolute top-2 end-2 text-primary" />
                      }
                      <span class="font-medium text-sm">{{ source.label }}</span>
                      @if (!source.configured) {
                        <span class="text-xs text-muted-foreground">Not configured</span>
                      }
                    </label>
                  }
                </div>
                @if (!hasAnySource()) {
                  <p class="text-sm text-muted-foreground pt-4">
                    No sources configured.
                    <a [routerLink]="settingsLink()" class="underline">Go to Settings</a>
                    to add integration URLs.
                  </p>
                }
              </div>
            </section>
          </fieldset>

          <!-- Documents -->
          <fieldset>
            <section hlmCard>
              <div hlmCardHeader>
                <legend>
                  <h2 hlmCardTitle>Documents</h2>
                </legend>
                <p hlmCardDescription>Upload reference documents for this project generation.</p>
              </div>
              <div hlmCardContent class="space-y-4">
                @if (projectFacade.documents().length > 0) {
                  <ul class="space-y-2">
                    @for (doc of projectFacade.documents(); track doc.id) {
                      <li class="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                        <ng-icon name="lucideFileText" class="text-muted-foreground" />
                        <span class="flex-1 truncate">{{ doc.filename }}</span>
                      </li>
                    }
                  </ul>
                } @else {
                  <p class="text-sm text-muted-foreground">No documents uploaded yet.</p>
                }

                <div class="space-y-2">
                  <label hlmLabel for="generate-upload-docs" class="cursor-pointer">
                    <div class="flex items-center justify-center gap-2 rounded-md border-2 border-dashed border-muted-foreground/25 bg-muted/20 px-4 py-8 text-sm transition-colors hover:bg-muted/40">
                      @if (projectFacade.isUploadingDocuments()) {
                        <hlm-spinner class="text-sm" />
                        <span>Uploading...</span>
                      } @else {
                        <ng-icon name="lucideUploadCloud" class="text-xl text-muted-foreground" />
                        <span class="font-medium text-muted-foreground">Click to upload files</span>
                      }
                    </div>
                  </label>
                  <input
                    id="generate-upload-docs"
                    type="file"
                    multiple
                    class="sr-only"
                    [disabled]="projectFacade.isUploadingDocuments()"
                    (change)="onUploadDocuments($event)"
                  />
                </div>
                @if (uploadError()) {
                  <p class="text-sm text-destructive">{{ uploadError() }}</p>
                }
              </div>
            </section>
          </fieldset>

          <!-- Output Type -->
          <fieldset>
            <section hlmCard>
              <div hlmCardHeader>
                <legend>
                  <h2 hlmCardTitle>Output Type</h2>
                </legend>
                <p hlmCardDescription>What kind of content to generate.</p>
              </div>
              <div hlmCardContent>
                <div
                  brnRadioGroup
                  name="outputType"
                  [(ngModel)]="selectedOutputType"
                  class="grid grid-cols-2 gap-4 sm:grid-cols-3"
                >
                  @for (option of outputOptions; track option.key) {
                    <label
                      hlmLabel
                      class="relative flex flex-col items-center justify-center rounded-lg border-2 border-border bg-background px-4 py-8 cursor-pointer transition-colors hover:bg-accent/10"
                      [class.border-primary]="selectedOutputType() === option.key"
                    >
                      <brn-radio [value]="option.key">
                        <ng-icon hlm [name]="option.icon" class="mb-3 text-xl" />
                      </brn-radio>
                      <span class="font-medium text-sm">{{ option.label }}</span>
                      @if (selectedOutputType() === option.key) {
                        <ng-icon name="lucideCheck" class="absolute top-2 end-2 text-primary" />
                      }
                    </label>
                  }
                </div>
              </div>
            </section>
          </fieldset>

          <!-- Prompt Instructions -->
          @if (activePromptType()) {
            <fieldset>
              <section hlmCard>
                <div hlmCardHeader>
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <ng-icon name="lucidePenLine" class="text-base" />
                      <h2 hlmCardTitle>
                        Prompt Instructions
                        @if (isPromptCustomized()) {
                          <span class="ml-2 text-xs font-normal text-primary">(Customized)</span>
                        }
                      </h2>
                    </div>
                    @if (isPromptCustomized()) {
                      <button
                        hlmBtn
                        variant="ghost"
                        size="sm"
                        type="button"
                        (click)="onResetPrompt()"
                      >
                        <ng-icon name="lucideRotateCcw" class="mr-1" />
                        Reset to default
                      </button>
                    }
                  </div>
                  <p hlmCardDescription>
                    Customize the AI instruction for this generation type. Format rules and template
                    variables are preserved automatically.
                  </p>
                </div>
                <div hlmCardContent class="space-y-4">
                  <textarea
                    class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[120px] resize-y font-mono"
                    [value]="editingInstruction()"
                    (input)="onInstructionInput($event)"
                    placeholder="Enter custom instruction..."
                  ></textarea>
                  @if (promptSaveError()) {
                    <p class="text-sm text-destructive">{{ promptSaveError() }}</p>
                  }
                  @if (promptDirty()) {
                    <div class="flex items-center gap-2">
                      <button
                        hlmBtn
                        size="sm"
                        type="button"
                        [disabled]="promptFacade.isSaving()"
                        (click)="onSavePrompt()"
                      >
                        @if (promptFacade.isSaving()) {
                          <hlm-spinner class="text-sm" />
                          Saving...
                        } @else {
                          Save prompt
                        }
                      </button>
                      <span class="text-xs text-muted-foreground">Unsaved changes</span>
                    </div>
                  }
                </div>
              </section>
            </fieldset>
          }

          <!-- Submit -->
          @if (submitError()) {
            <div hlmAlert variant="destructive">
              <ng-icon hlm hlmAlertIcon name="lucideCircleAlert" />
              <p hlmAlertDescription>{{ submitError() }}</p>
            </div>
          }
          <div class="flex items-center gap-4">
            <button hlmBtn type="submit" [disabled]="!canGenerate() || isSubmitting()">
              @if (isSubmitting()) {
                <hlm-spinner class="text-sm" />
                Generating...
              } @else {
                Generate
              }
            </button>
            @if (!isSupportedCombination()) {
              <span class="text-xs text-muted-foreground"
                >This combination is not yet supported.</span
              >
            }
          </div>
        </form>
      }
    </div>
  `,
})
export class ProjectGeneratePage implements OnInit {
  protected readonly projectFacade = inject(ProjectFacade);
  private readonly orgFacade = inject(OrganizationFacade);
  private readonly infographicFacade = inject(InfographicFacade);
  private readonly mindmapFacade = inject(MindmapFacade);
  private readonly audioFacade = inject(AudioFacade);
  private readonly videoFacade = inject(VideoFacade);
  protected readonly promptFacade = inject(PromptFacade);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly isLoading = signal(true);
  protected readonly isSubmitting = signal(false);
  protected readonly submitError = signal<string | null>(null);
  protected readonly uploadError = signal<string | null>(null);
  protected readonly outputOptions = OUTPUT_OPTIONS;

  protected readonly selectedSources = signal<ReadonlySet<SourceKey>>(new Set());
  protected readonly selectedOutputType = signal<OutputType | null>(null);

  protected readonly editingInstruction = signal<string>('');
  protected readonly promptDirty = signal(false);
  protected readonly promptSaveError = signal<string | null>(null);

  protected readonly activePromptType = computed<PromptType | null>(() => {
    const output = this.selectedOutputType();
    return output ? (OUTPUT_TO_PROMPT_TYPE[output] ?? null) : null;
  });

  protected readonly isPromptCustomized = computed(() => {
    const pt = this.activePromptType();
    return pt ? this.promptFacade.isCustomized(pt) : false;
  });

  private readonly syncInstructionEffect = effect(() => {
    const pt = this.activePromptType();
    if (pt) {
      this.editingInstruction.set(this.promptFacade.resolveInstruction(pt));
      this.promptDirty.set(false);
      this.promptSaveError.set(null);
    }
  });

  protected readonly project = computed(() => {
    const projectId = this.route.snapshot.paramMap.get('projectId');
    return this.projectFacade.projects().find((p) => p.id === projectId) ?? null;
  });

  protected readonly backLink = computed(() => {
    const slug = this.orgFacade.activeOrgSlug();
    const projectId = this.route.snapshot.paramMap.get('projectId');
    return `/${slug}/projects/${projectId}`;
  });

  protected readonly settingsLink = computed(() => {
    const slug = this.orgFacade.activeOrgSlug();
    const projectId = this.route.snapshot.paramMap.get('projectId');
    return `/${slug}/projects/${projectId}/settings`;
  });

  protected readonly availableSources = computed<readonly SourceOption[]>(() => {
    const proj = this.project();
    return [
      {
        key: 'github' as const,
        label: 'GitHub',
        icon: 'lucideGithub',
        configured: !!proj?.githubLink,
      },
      {
        key: 'jira' as const,
        label: 'Jira',
        icon: null,
        configured: !!proj?.jiraLink,
      },
      {
        key: 'confluence' as const,
        label: 'Confluence',
        icon: null,
        configured: !!proj?.confluenceLink,
      },
    ];
  });

  protected readonly hasAnySource = computed(() =>
    this.availableSources().some((s) => s.configured),
  );

  protected readonly isSupportedCombination = computed(() => {
    const sources = this.selectedSources();
    const output = this.selectedOutputType();
    if (sources.size === 0 || output === null) return false;

    return (
      output === 'infographic' ||
      output === 'mindmap' ||
      output === 'audio' ||
      output === 'video'
    );
  });

  protected readonly canGenerate = computed(() => this.isSupportedCombination());

  async ngOnInit(): Promise<void> {
    const projectId = this.route.snapshot.paramMap.get('projectId') ?? '';

    const [projectError, promptError] = await Promise.all([
      this.projectFacade.loadProjects(),
      this.promptFacade.loadPrompts(projectId),
      this.projectFacade.loadDocuments(projectId),
    ]);
    this.isLoading.set(false);

    if (projectError) {
      console.error('[ProjectGeneratePage] loadProjects failed:', projectError);
    }
    if (promptError) {
      console.error('[ProjectGeneratePage] loadPrompts failed:', promptError);
    }
  }

  protected onSourceChange(key: SourceKey, checked: boolean): void {
    this.selectedSources.update((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }

  protected async onSubmit(): Promise<void> {
    const proj = this.project();
    if (!proj || !this.canGenerate()) return;

    this.submitError.set(null);
    this.isSubmitting.set(true);

    const output = this.selectedOutputType();

    let error: { message: string } | null = null;

    if (output === 'infographic') {
      error = await this.infographicFacade.generateInfographic(proj.id);
    } else if (output === 'mindmap') {
      const queryBase = proj.projectDescription?.trim()
        ? `${proj.projectName}: ${proj.projectDescription}`
        : proj.projectName;
      error = await this.mindmapFacade.generateMindmap(proj.id, queryBase);
    } else if (output === 'audio') {
      error = await this.audioFacade.generateAudio(proj.id);
    } else if (output === 'video') {
      error = await this.videoFacade.generateVideo(proj.id);
    }

    this.isSubmitting.set(false);

    if (error) {
      this.submitError.set(error.message);
      return;
    }

    // Navigate with generating hint so the detail page shows the regen UI
    // even if the worker completes the job before checkForActiveJob runs.
    await this.router.navigate([this.backLink()], {
      queryParams: { generating: output },
    });
  }

  protected onInstructionInput(event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value;
    this.editingInstruction.set(value);
    this.promptDirty.set(true);
    this.promptSaveError.set(null);
  }

  protected async onSavePrompt(): Promise<void> {
    const pt = this.activePromptType();
    const projectId = this.route.snapshot.paramMap.get('projectId');
    if (!pt || !projectId) return;

    const error = await this.promptFacade.savePrompt(projectId, pt, this.editingInstruction());

    if (error) {
      this.promptSaveError.set(error.message);
      return;
    }

    this.promptDirty.set(false);
  }

  protected async onResetPrompt(): Promise<void> {
    const pt = this.activePromptType();
    const projectId = this.route.snapshot.paramMap.get('projectId');
    if (!pt || !projectId) return;

    const error = await this.promptFacade.resetPrompt(projectId, pt);

    if (error) {
      this.promptSaveError.set(error.message);
      return;
    }

    const defaultInstruction =
      this.promptFacade.defaults().find((d) => d.promptType === pt)?.instruction ?? '';
    this.editingInstruction.set(defaultInstruction);
    this.promptDirty.set(false);
    this.promptSaveError.set(null);
  }

  protected async onUploadDocuments(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const files = Array.from(input.files);
    const proj = this.project();
    if (!proj) return;

    this.uploadError.set(null);
    const error = await this.projectFacade.uploadDocuments(proj.id, files);
    if (error) {
      this.uploadError.set(error.message);
    }
    input.value = '';
  }
}
