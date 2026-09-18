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
  lucideCalendar,
  lucideCheck,
  lucideCircleAlert,
  lucideFileText,
  lucideImage,
  lucideHeadphones,
  lucideLayoutDashboard,
  lucidePlay,
  lucideUsers,
} from '@ng-icons/lucide';
import { HlmAlertImports } from '@app/ui/alert';
import { HlmBadgeImports } from '@app/ui/badge';
import { HlmButtonImports } from '@app/ui/button';
import { HlmCardImports } from '@app/ui/card';
import { HlmInputImports } from '@app/ui/input';
import { HlmLabelImports } from '@app/ui/label';
import { HlmSkeletonImports } from '@app/ui/skeleton';
import { HlmSpinnerImports } from '@app/ui/spinner';
import { OrganizationFacade } from '../../services/organization.facade';
import { ProjectFacade } from '../../services/project.facade';
import { ProjectService } from '../../services/project.service';
import { TrainingFacade } from '../../services/training.facade';
import type { OrganizationMember } from '../../domain/organization.types';
import type {
  ProjectAsset,
  ProjectAssetType,
  ProjectAssetVisualPreviewType,
} from '../../domain/project.types';
import type { ProjectBackedTrainingAssetType } from '../../domain/training.types';
import { MermaidMindmapViewer } from '../../shared/ui/mermaid-mindmap-viewer';

interface SelectableAsset {
  readonly assetType: ProjectAssetType;
  readonly title: string;
  readonly preview: string | null;
  readonly visualPreview: string | null;
  readonly visualPreviewType: ProjectAssetVisualPreviewType | null;
  readonly icon: string;
  readonly selected: boolean;
  readonly sortOrder: number;
}

interface SelectableMember {
  readonly userId: string;
  readonly displayName: string;
  readonly email: string;
  readonly avatarUrl: string | null;
  readonly selected: boolean;
}

interface VisualPreviewOverlay {
  readonly assetType: ProjectAssetType;
  readonly title: string;
  readonly visualPreview: string;
  readonly visualPreviewType: ProjectAssetVisualPreviewType;
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

const ASSET_TYPE_TO_MODULE_TYPE: Record<ProjectAssetType, ProjectBackedTrainingAssetType> = {
  summary: 'summary',
  infographic: 'infographic',
  mindmap: 'mindmap',
  audio: 'audio',
  video: 'video',
};

const ASSET_ICON: Record<ProjectAssetType, string> = {
  summary: 'lucideFileText',
  infographic: 'lucideImage',
  mindmap: 'lucideLayoutDashboard',
  audio: 'lucideHeadphones',
  video: 'lucidePlay',
};

@Component({
  selector: 'app-training-create-page',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    NgIcon,
    HlmAlertImports,
    HlmBadgeImports,
    HlmButtonImports,
    HlmCardImports,
    HlmInputImports,
    HlmLabelImports,
    HlmSkeletonImports,
    HlmSpinnerImports,
    MermaidMindmapViewer,
  ],
  providers: [
    provideIcons({
      lucideArrowLeft,
      lucideCalendar,
      lucideCheck,
      lucideCircleAlert,
      lucideFileText,
      lucideHeadphones,
      lucideImage,
      lucideLayoutDashboard,
      lucidePlay,
      lucideUsers,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-3xl space-y-8 pb-16">
      <!-- Header -->
      <header>
        <div class="mb-4 -ml-2">
          <a hlmBtn variant="ghost" size="sm" [routerLink]="backLink()">
            <ng-icon name="lucideArrowLeft" />
            Back to project
          </a>
        </div>
        <h1 class="text-2xl font-bold tracking-tight">Create Training</h1>
        @if (projectName()) {
          <p class="text-sm text-muted-foreground mt-1">
            From project: <strong>{{ projectName() }}</strong>
          </p>
        }
      </header>

      @if (errorMessage()) {
        <div hlmAlert variant="destructive">
          <ng-icon hlmAlertIcon name="lucideCircleAlert" />
          <h4 hlmAlertTitle>Error</h4>
          <p hlmAlertDesc>{{ errorMessage() }}</p>
        </div>
      }

      <!-- Section 1: Training Details -->
      <section hlmCard>
        <div hlmCardHeader>
          <h2 hlmCardTitle>Training Details</h2>
          <p hlmCardDescription>Define the title, description, and deadline for this training.</p>
        </div>
        <div hlmCardContent class="space-y-4">
          <div class="space-y-2">
            <label hlmLabel for="training-title">Title</label>
            <input
              hlmInput
              id="training-title"
              type="text"
              class="w-full"
              placeholder="e.g. Q2 Onboarding Training"
              [ngModel]="title()"
              (ngModelChange)="title.set($event)"
            />
          </div>
          <div class="space-y-2">
            <label hlmLabel for="training-description">Description</label>
            <textarea
              hlmInput
              id="training-description"
              class="w-full min-h-[80px]"
              placeholder="What should trainees learn from this training?"
              [ngModel]="description()"
              (ngModelChange)="description.set($event)"
            ></textarea>
          </div>
          <div class="space-y-2">
            <label hlmLabel for="training-due-date">
              <ng-icon name="lucideCalendar" class="inline mr-1" />
              Due Date
            </label>
            <input
              hlmInput
              id="training-due-date"
              type="date"
              class="w-full"
              [ngModel]="dueDate()"
              (ngModelChange)="dueDate.set($event)"
            />
          </div>
        </div>
      </section>

      <!-- Section 2: Select Modules from Project Assets -->
      <section hlmCard>
        <div hlmCardHeader>
          <h2 hlmCardTitle>Curriculum Modules</h2>
          <p hlmCardDescription>
            Select which project assets to include in this training.
            {{ selectedAssetCount() }} of {{ selectableAssets().length }} selected.
          </p>
        </div>
        <div hlmCardContent>
          @if (assetsLoading()) {
            <div class="space-y-3">
              @for (_ of skeletonRows; track $index) {
                <div hlmSkeleton class="h-16 w-full"></div>
              }
            </div>
          } @else if (selectableAssets().length === 0) {
            <div class="py-6 text-center">
              <p class="text-sm text-muted-foreground">
                No generated assets found for this project.
              </p>
              <p class="text-xs text-muted-foreground mt-1">
                Run the project pipeline first to generate assets (summary, infographic, mindmap,
                audio, video).
              </p>
            </div>
          } @else {
            <div class="space-y-2">
              @for (asset of selectableAssets(); track asset.assetType) {
                <label
                  class="flex cursor-pointer flex-col gap-3 rounded-lg border p-3 transition-colors md:flex-row md:items-start"
                  [class.border-primary]="asset.selected"
                  [class.bg-primary/5]="asset.selected"
                  [class.hover:bg-muted]="!asset.selected"
                >
                  <div class="flex min-w-0 flex-1 items-start gap-3">
                    <input
                      type="checkbox"
                      [ngModel]="asset.selected"
                      (ngModelChange)="toggleAssetSelection(asset.assetType, $event)"
                      class="mt-0.5 rounded"
                    />
                    <ng-icon [name]="asset.icon" class="mt-0.5 shrink-0 text-muted-foreground" />
                    <div class="min-w-0 flex-1">
                      <p class="text-sm font-medium">{{ asset.title }}</p>
                      @if (asset.preview) {
                        <p class="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {{ asset.preview }}
                        </p>
                      }
                    </div>
                  </div>
                  @if (asset.visualPreview && asset.visualPreviewType) {
                    <div
                      class="h-28 w-full shrink-0 cursor-zoom-in md:w-48"
                      aria-hidden="true"
                      (mouseenter)="showVisualPreview(asset, $event)"
                      (mouseleave)="hideVisualPreview()"
                    >
                      <div
                        class="h-full overflow-hidden rounded-md border bg-background shadow-sm transition-shadow duration-200 hover:shadow-md"
                      >
                        @switch (asset.visualPreviewType) {
                          @case ('image') {
                            <img
                              [src]="asset.visualPreview"
                              alt=""
                              class="h-full w-full bg-muted/30 object-contain"
                            />
                          }
                          @case ('mermaid') {
                            <app-mermaid-mindmap-viewer
                              [definition]="asset.visualPreview"
                              [interactive]="false"
                              [showControls]="false"
                              height="100%"
                              renderIdPrefix="training-asset-preview"
                              [containerId]="'training-asset-preview-' + asset.assetType"
                              ariaLabel="Mindmap preview"
                            />
                          }
                        }
                      </div>
                    </div>
                  } @else {
                    <div
                      class="pointer-events-none h-28 w-full shrink-0 overflow-hidden rounded-md border bg-background md:w-48"
                      aria-hidden="true"
                    >
                      <div
                        class="flex h-full flex-col items-center justify-center gap-2 bg-muted/30 px-3 text-center"
                      >
                        <ng-icon [name]="asset.icon" class="text-2xl text-muted-foreground" />
                        <span class="text-[0.65rem] font-medium text-muted-foreground">
                          No visual preview
                        </span>
                      </div>
                    </div>
                  }
                </label>
              }
            </div>
            @if (hoveredPreview(); as preview) {
              <div
                class="pointer-events-none fixed z-[100] overflow-hidden rounded-xl border bg-background p-2 shadow-2xl ring-1 ring-foreground/10"
                [style.top.px]="preview.top"
                [style.left.px]="preview.left"
                [style.width.px]="preview.width"
                [style.height.px]="preview.height"
                aria-hidden="true"
              >
                <div class="relative h-full overflow-hidden rounded-lg bg-muted/20">
                  <span
                    class="absolute left-2 top-2 z-10 rounded-full bg-background/90 px-2 py-0.5 text-[0.65rem] font-medium text-foreground shadow-sm"
                  >
                    {{ preview.title }}
                  </span>
                  @switch (preview.visualPreviewType) {
                    @case ('image') {
                      <img
                        [src]="preview.visualPreview"
                        alt=""
                        class="h-full w-full object-contain"
                      />
                    }
                    @case ('mermaid') {
                      <app-mermaid-mindmap-viewer
                        [definition]="preview.visualPreview"
                        [interactive]="false"
                        [showControls]="false"
                        height="100%"
                        renderIdPrefix="training-asset-preview-overlay"
                        [containerId]="'training-asset-preview-overlay-' + preview.assetType"
                        ariaLabel="Expanded mindmap preview"
                      />
                    }
                  }
                </div>
              </div>
            }
          }
        </div>
      </section>

      <!-- Section 3: Assign Users -->
      <section hlmCard>
        <div hlmCardHeader>
          <h2 hlmCardTitle>
            <ng-icon name="lucideUsers" class="inline mr-1" />
            Assign Users
          </h2>
          <p hlmCardDescription>
            Select organization members who should complete this training.
            {{ selectedMemberCount() }} selected.
          </p>
        </div>
        <div hlmCardContent>
          @if (membersLoading()) {
            <div class="space-y-2">
              @for (_ of skeletonRows; track $index) {
                <div hlmSkeleton class="h-10 w-full"></div>
              }
            </div>
          } @else if (selectableMembers().length === 0) {
            <p class="text-sm text-muted-foreground py-4 text-center">
              No organization members found.
            </p>
          } @else {
            <div class="space-y-1">
              @for (member of selectableMembers(); track member.userId) {
                <label
                  class="flex items-center gap-3 rounded-md px-3 py-2.5 cursor-pointer transition-colors"
                  [class.bg-accent]="member.selected"
                  [class.hover:bg-muted]="!member.selected"
                >
                  <input
                    type="checkbox"
                    [ngModel]="member.selected"
                    (ngModelChange)="toggleMemberSelection(member.userId, $event)"
                    class="rounded"
                  />
                  @if (member.avatarUrl) {
                    <img
                      [src]="member.avatarUrl"
                      [alt]="member.displayName"
                      class="h-7 w-7 rounded-full object-cover"
                    />
                  } @else {
                    <span
                      class="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-medium uppercase"
                    >
                      {{ member.displayName.charAt(0) }}
                    </span>
                  }
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium truncate">{{ member.displayName }}</p>
                    <p class="text-xs text-muted-foreground truncate">{{ member.email }}</p>
                  </div>
                </label>
              }
            </div>
          }
        </div>
      </section>

      <!-- Submit -->
      <div class="flex justify-end gap-3">
        <a hlmBtn variant="outline" [routerLink]="backLink()">Cancel</a>
        <button hlmBtn [disabled]="!canSubmit() || isSaving()" (click)="onSubmit()">
          @if (isSaving()) {
            <hlm-spinner class="mr-2" />
            Creating...
          } @else {
            Create Training
          }
        </button>
      </div>
    </div>
  `,
})
export class TrainingCreatePage implements OnInit {
  private static readonly PREVIEW_OVERLAY_WIDTH_PX = 880;
  private static readonly PREVIEW_OVERLAY_HEIGHT_PX = 560;
  private static readonly PREVIEW_OVERLAY_GAP_PX = 16;
  private static readonly VIEWPORT_MARGIN_PX = 16;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly orgFacade = inject(OrganizationFacade);
  private readonly projectFacade = inject(ProjectFacade);
  private readonly projectService = inject(ProjectService);
  private readonly trainingFacade = inject(TrainingFacade);

  protected readonly skeletonRows = Array.from({ length: 4 });

  protected readonly title = signal('');
  protected readonly description = signal('');
  protected readonly dueDate = signal('');
  protected readonly selectableAssets = signal<SelectableAsset[]>([]);
  protected readonly selectableMembers = signal<SelectableMember[]>([]);
  protected readonly assetsLoading = signal(false);
  protected readonly membersLoading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly hoveredPreview = signal<VisualPreviewOverlay | null>(null);
  protected readonly isSaving = this.trainingFacade.isCreating;

  protected readonly projectId = computed(
    () => this.route.snapshot.paramMap.get('projectId') ?? '',
  );

  protected readonly projectName = computed(() => {
    const id = this.projectId();
    return this.projectFacade.projects().find((p) => p.id === id)?.projectName ?? '';
  });

  protected readonly backLink = computed(() => {
    const orgSlug = this.orgFacade.activeOrgSlug();
    return `/${orgSlug}/projects/${this.projectId()}`;
  });

  protected readonly trainingListLink = computed(() => {
    const orgSlug = this.orgFacade.activeOrgSlug();
    return `/${orgSlug}/training`;
  });

  protected readonly selectedAssetCount = computed(
    () => this.selectableAssets().filter((a) => a.selected).length,
  );

  protected readonly selectedMemberCount = computed(
    () => this.selectableMembers().filter((m) => m.selected).length,
  );

  protected readonly canSubmit = computed(
    () => this.title().trim().length > 0 && this.selectedAssetCount() > 0,
  );

  async ngOnInit(): Promise<void> {
    const projectId = this.projectId();

    this.assetsLoading.set(true);
    this.membersLoading.set(true);

    const [assetsResult, membersError] = await Promise.all([
      this.projectService.getProjectAssets(projectId),
      this.orgFacade.loadMembers(),
    ]);

    this.assetsLoading.set(false);
    this.membersLoading.set(false);

    if (membersError) {
      this.errorMessage.set(membersError.message);
    }

    if (assetsResult.data) {
      this.selectableAssets.set(
        assetsResult.data
          .filter((a: ProjectAsset) => a.available)
          .map((a: ProjectAsset, i: number) => ({
            assetType: a.assetType,
            title: a.title,
            preview: a.preview,
            visualPreview: a.visualPreview,
            visualPreviewType: a.visualPreviewType,
            icon: ASSET_ICON[a.assetType] ?? 'lucideFileText',
            selected: true,
            sortOrder: i,
          })),
      );
    }

    this.selectableMembers.set(
      this.orgFacade.members().map((m: OrganizationMember) => ({
        userId: m.userId,
        displayName: m.displayName,
        email: m.email,
        avatarUrl: m.avatarUrl,
        selected: false,
      })),
    );
  }

  protected showVisualPreview(asset: SelectableAsset, event: MouseEvent): void {
    if (!asset.visualPreview || !asset.visualPreviewType) {
      this.hoveredPreview.set(null);
      return;
    }

    if (!(event.currentTarget instanceof HTMLElement)) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const margin = TrainingCreatePage.VIEWPORT_MARGIN_PX;
    const gap = TrainingCreatePage.PREVIEW_OVERLAY_GAP_PX;
    const width = Math.min(
      TrainingCreatePage.PREVIEW_OVERLAY_WIDTH_PX,
      Math.max(0, window.innerWidth - margin * 2),
    );
    const height = Math.min(
      TrainingCreatePage.PREVIEW_OVERLAY_HEIGHT_PX,
      Math.max(0, window.innerHeight - margin * 2),
    );

    const rightSideLeft = rect.right + gap;
    const fitsOnRight = rightSideLeft + width + margin <= window.innerWidth;
    const left = fitsOnRight ? rightSideLeft : Math.max(margin, rect.left - width - gap);
    const centeredTop = rect.top + rect.height / 2 - height / 2;
    const top = this.clamp(
      centeredTop,
      margin,
      Math.max(margin, window.innerHeight - height - margin),
    );

    this.hoveredPreview.set({
      assetType: asset.assetType,
      title: asset.title,
      visualPreview: asset.visualPreview,
      visualPreviewType: asset.visualPreviewType,
      top,
      left,
      width,
      height,
    });
  }

  protected hideVisualPreview(): void {
    this.hoveredPreview.set(null);
  }

  protected async onSubmit(): Promise<void> {
    const projectId = this.projectId();
    if (!projectId) return;

    this.errorMessage.set(null);
    const selectedAssets = this.selectableAssets().filter((a) => a.selected);
    const selectedMembers = this.selectableMembers().filter((m) => m.selected);
    const createError = await this.trainingFacade.createTrainingFromProject(projectId, {
      title: this.title().trim(),
      description: this.description().trim() || null,
      dueDate: this.dueDate().trim() ? new Date(this.dueDate().trim()).toISOString() : null,
      assetTypes: selectedAssets.map((asset) => ASSET_TYPE_TO_MODULE_TYPE[asset.assetType]),
      assigneeIds: selectedMembers.map((member) => member.userId),
      publish: true,
    });

    if (createError) {
      this.errorMessage.set(createError.message);
      return;
    }

    void this.router.navigateByUrl(this.trainingListLink());
  }

  protected toggleAssetSelection(assetType: ProjectAssetType, selected: boolean): void {
    this.selectableAssets.update((assets) =>
      assets.map((asset) => (asset.assetType === assetType ? { ...asset, selected } : asset)),
    );
  }

  protected toggleMemberSelection(userId: string, selected: boolean): void {
    this.selectableMembers.update((members) =>
      members.map((member) => (member.userId === userId ? { ...member, selected } : member)),
    );
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }
}
