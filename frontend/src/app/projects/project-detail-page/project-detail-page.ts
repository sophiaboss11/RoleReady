import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeft,
  lucideBadgeCheck,
  lucideCircleAlert,
  lucideDownload,
  lucideExternalLink,
  lucidePlus,
  lucideSettings,
  lucideX,
} from '@ng-icons/lucide';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { HlmAlertImports } from '@app/ui/alert';
import { HlmBadgeImports } from '@app/ui/badge';
import { HlmButtonImports } from '@app/ui/button';
import { HlmCardImports } from '@app/ui/card';
import { HlmDialogImports } from '@app/ui/dialog';
import { HlmIconImports } from '@app/ui/icon';
import { HlmItemImports } from '@app/ui/item';
import { HlmSkeletonImports } from '@app/ui/skeleton';
import { HlmSpinnerImports } from '@app/ui/spinner';
import { HlmTableImports } from '@app/ui/table';
import { ProjectFacade } from '../../services/project.facade';
import { OrganizationFacade } from '../../services/organization.facade';
import { TrainingFacade } from '../../services/training.facade';
import type { TrainingSummary } from '../../domain/training.types';
import { InfographicFacade } from '../../services/infographic.facade';
import { MindmapFacade } from '../../services/mindmap.facade';
import { AudioFacade } from '../../services/audio.facade';
import { VideoFacade } from '../../services/video.facade';
import { JobRealtimeService } from '../../services/job-realtime.service';
import { getSupabaseClientState } from '../../lib/supabase.client';
import { isProjectStatus } from '../../domain/project.types';
import { ExportService } from '../../services/export.service';
import { MarkdownContent } from '../../shared/ui/markdown-content';
import { MermaidMindmapViewer } from '../../shared/ui/mermaid-mindmap-viewer';

@Component({
  selector: 'app-project-detail-page',
  imports: [
    RouterLink,
    NgIcon,
    HlmAlertImports,
    HlmBadgeImports,
    HlmButtonImports,
    HlmCardImports,
    HlmDialogImports,
    HlmIconImports,
    HlmItemImports,
    HlmSkeletonImports,
    HlmSpinnerImports,
    HlmTableImports,
    MarkdownContent,
    MermaidMindmapViewer,
  ],
  providers: [
    provideIcons({
      lucideArrowLeft,
      lucideBadgeCheck,
      lucideCircleAlert,
      lucideDownload,
      lucideExternalLink,
      lucidePlus,
      lucideSettings,
      lucideX,
    }),
    JobRealtimeService,
    InfographicFacade,
    MindmapFacade,
    AudioFacade,
    VideoFacade,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-4xl space-y-8">
      <header class="mb-3">
        <div class="mb-4 flex items-center justify-between -ml-2">
          <a hlmBtn variant="ghost" size="sm" [routerLink]="projectsLink()">
            <ng-icon name="lucideArrowLeft" />
            Back to projects
          </a>
          @if (isAdmin() && project()) {
            <div class="flex items-center gap-2">
              <a hlmBtn variant="default" size="sm" [routerLink]="['trainings', 'new']">
                <ng-icon name="lucidePlus" />
                Create Training
              </a>
              <a hlmBtn variant="outline" size="sm" [routerLink]="['settings']">
                <ng-icon name="lucideSettings" />
                Settings
              </a>
            </div>
          }
        </div>
        @if (project(); as proj) {
          <div class="space-y-2">
            <div class="flex items-center gap-3">
              <h1 class="text-2xl font-bold tracking-tight">{{ proj.projectName }}</h1>
              <span
                class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                [class]="statusClass(proj.status)"
              >
                {{ statusLabel(proj.status) }}
              </span>
            </div>
            @if (hasIntegrations()) {
              <div class="flex flex-wrap items-center gap-1.5">
                @if (proj.githubLink) {
                  <a
                    hlmBadge
                    [href]="proj.githubLink"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-900"
                  >
                    <ng-icon name="lucideBadgeCheck" />
                    GitHub
                  </a>
                }
                @if (proj.jiraLink) {
                  <a
                    hlmBadge
                    [href]="proj.jiraLink"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-900"
                  >
                    <ng-icon name="lucideBadgeCheck" />
                    Jira
                  </a>
                }
                @if (proj.confluenceLink) {
                  <a
                    hlmBadge
                    [href]="proj.confluenceLink"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-900"
                  >
                    <ng-icon name="lucideBadgeCheck" />
                    Confluence
                  </a>
                }
              </div>
            }

            @if (proj.projectDescription) {
              <p class="text-sm text-muted-foreground">{{ proj.projectDescription }}</p>
            }
            <time class="block text-xs text-muted-foreground" [attr.datetime]="proj.createdAt">
              Created {{ formatDate(proj.createdAt) }}
            </time>
          </div>
        }
      </header>

      <!-- Trainings -->
      @if (projectTrainings().length > 0) {
        <section>
          <h2 class="text-sm font-semibold text-muted-foreground mb-2">
            Trainings ({{ projectTrainings().length }})
          </h2>
          <table hlmTable class="w-full">
            <thead>
              <tr hlmTrow>
                <th hlmTh>Title</th>
                <th hlmTh class="w-24 text-center">Status</th>
                <th hlmTh class="w-36 text-right">Created</th>
              </tr>
            </thead>
            <tbody>
              @for (t of projectTrainings(); track t.id) {
                <tr
                  hlmTrow
                  class="cursor-pointer hover:bg-muted/50"
                  [routerLink]="['trainings', t.id]"
                >
                  <td hlmTd class="font-medium">{{ t.title }}</td>
                  <td hlmTd class="text-center">
                    <span
                      class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                      [class]="trainingStatusClass(t.status)"
                    >
                      {{ t.status }}
                    </span>
                  </td>
                  <td hlmTd class="text-right text-muted-foreground text-xs">
                    {{ formatDate(t.createdAt) }}
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </section>
      }

      <hr />

      <!-- Pipeline Progress Bar -->
      @if (project(); as proj) {
        @if (isPipelineRunning(proj.status, !!proj.githubLink)) {
          <section hlmCard>
            <div hlmCardContent class="py-4">
              <div class="flex items-center gap-3">
                <hlm-spinner class="text-sm" />
                <div class="flex-1">
                  <p class="text-sm font-medium">{{ pipelineMessage(proj.status) }}</p>
                  <div class="mt-2 h-2 w-full rounded-full bg-muted">
                    <div
                      class="h-2 rounded-full bg-primary transition-all duration-500"
                      [style.width]="pipelineProgress(proj.status) + '%'"
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        }
        @if (proj.status === 'failed') {
          <div hlmAlert variant="destructive">
            <ng-icon hlm hlmAlertIcon name="lucideCircleAlert" />
            <p hlmAlertDescription>
              The pipeline failed for this project. Some generated resources may still be available.
            </p>
          </div>
        }
      }

      @if (isLoading()) {
        <!-- Skeleton: header -->
        <div class="space-y-2" role="status" aria-label="Loading project">
          <hlm-skeleton class="h-8 w-64" />
          <hlm-skeleton class="h-4 w-96" />
          <div class="flex gap-1.5 pt-1">
            <hlm-skeleton class="h-5 w-20 rounded-full" />
            <hlm-skeleton class="h-5 w-16 rounded-full" />
          </div>
        </div>
        <!-- Skeleton: details card -->
        <section hlmCard>
          <div hlmCardHeader>
            <hlm-skeleton class="h-5 w-20" />
          </div>
          <div hlmCardContent class="space-y-3">
            <div class="flex gap-2">
              <hlm-skeleton class="h-4 w-24" />
              <hlm-skeleton class="h-4 w-32" />
            </div>
            <div class="flex gap-2">
              <hlm-skeleton class="h-4 w-24" />
              <hlm-skeleton class="h-4 w-32" />
            </div>
          </div>
        </section>
      } @else if (!project()) {
        <div hlmAlert variant="destructive">
          <ng-icon hlm hlmAlertIcon name="lucideCircleAlert" />
          <p hlmAlertDescription>Project not found.</p>
        </div>
      } @else {
        <!-- Infographic -->
        <section hlmCard>
          <div hlmCardHeader>
            <div class="flex items-center justify-between">
              <div>
                <h2 hlmCardTitle>Infographic</h2>
                <p hlmCardDescription>AI-generated visual summary of this project.</p>
              </div>
              @if (infographicFacade.infographic()?.imageUrl) {
                <button
                  hlmBtn
                  variant="outline"
                  size="sm"
                  [disabled]="isExportingInfographic()"
                  (click)="exportInfographic()"
                  aria-label="Download infographic"
                >
                  <ng-icon name="lucideDownload" />
                  {{ isExportingInfographic() ? 'Downloading...' : 'Download PNG' }}
                </button>
              }
            </div>
          </div>
          <div hlmCardContent>
            @if (isAssetBootstrapLoading() || infographicFacade.isLoading()) {
              <div class="flex gap-4">
                <div class="w-56 shrink-0 space-y-2">
                  <hlm-skeleton class="aspect-square w-full rounded-sm" />
                  <hlm-skeleton class="h-4 w-24" />
                  <hlm-skeleton class="h-3 w-full" />
                </div>
              </div>
            } @else if (infographicFacade.generationStatus() === 'failed') {
              <div hlmAlert variant="destructive" class="flex items-start justify-between">
                <div class="flex items-start gap-2">
                  <ng-icon hlm hlmAlertIcon name="lucideCircleAlert" />
                  <p hlmAlertDescription>
                    {{ infographicFacade.generationError() ?? 'Infographic generation failed.' }}
                  </p>
                </div>
                <button
                  hlmBtn
                  variant="ghost"
                  size="icon-sm"
                  (click)="infographicFacade.dismissError()"
                  aria-label="Dismiss error"
                >
                  <ng-icon name="lucideX" />
                </button>
              </div>
            } @else if (infographicFacade.infographic(); as info) {
              @if (infographicFacade.isGenerating()) {
                <div
                  class="mb-3 flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2"
                >
                  <hlm-spinner class="text-xs" />
                  <span class="text-xs text-muted-foreground">Regenerating infographic...</span>
                </div>
              }
              <div
                [class.opacity-50]="infographicFacade.isGenerating()"
                [class.pointer-events-none]="infographicFacade.isGenerating()"
                class="transition-opacity"
              >
                <div>
                  @if (info.imageUrl) {
                    <hlm-dialog>
                      <button
                        hlmDialogTrigger
                        type="button"
                        class="group w-full cursor-zoom-in overflow-hidden rounded-lg border border-border bg-muted/30 p-0 text-left transition hover:bg-accent/40"
                      >
                        <img
                          [src]="info.imageUrl"
                          alt="Project infographic"
                          class="w-full rounded-t-lg object-contain transition group-hover:opacity-95"
                        />
                        <div class="px-3 py-2 text-xs text-muted-foreground">
                          Generated {{ formatDate(info.createdAt) }}
                        </div>
                      </button>
                      <ng-template hlmDialogPortal>
                        <div
                          hlmDialogContent
                          class="w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] p-2 sm:w-[80vw] sm:max-w-[80vw]"
                        >
                          <button
                            hlmBtn
                            variant="ghost"
                            size="icon-sm"
                            class="absolute end-2 top-2 z-10"
                            hlmDialogClose
                          >
                            <span class="sr-only">Close</span>
                            <ng-icon name="lucideX" />
                          </button>
                          <img
                            [src]="info.imageUrl"
                            alt="Project infographic"
                            class="max-h-[85vh] w-full rounded-md object-contain"
                          />
                        </div>
                      </ng-template>
                    </hlm-dialog>
                  }
                </div>
                @if (info.infographicText) {
                  <details class="mt-4">
                    <summary class="cursor-pointer text-sm font-medium">Text outline</summary>
                    <app-markdown-content class="mt-2" [markdown]="info.infographicText" />
                  </details>
                }
              </div>
            } @else if (infographicFacade.isGenerating()) {
              <div class="flex items-center gap-3 py-6">
                <hlm-spinner class="text-sm" />
                <div>
                  <p class="text-sm font-medium">
                    @switch (infographicFacade.generationStatus()) {
                      @case ('pending') {
                        Queued — waiting to start...
                      }
                      @case ('running') {
                        Generating infographic...
                      }
                      @default {
                        Processing...
                      }
                    }
                  </p>
                  <p class="text-xs text-muted-foreground">
                    This updates automatically when ready.
                  </p>
                </div>
              </div>
            } @else {
              <div class="space-y-3 py-2">
                <p class="text-sm text-muted-foreground">
                  No infographic has been generated for this project yet.
                </p>
              </div>
            }

            @if (infographicError()) {
              <div hlmAlert variant="destructive" class="mt-4">
                <ng-icon hlm hlmAlertIcon name="lucideCircleAlert" />
                <p hlmAlertDescription>{{ infographicError() }}</p>
              </div>
            }
          </div>
        </section>

        <!-- Mindmap -->
        <section hlmCard>
          <div hlmCardHeader>
            <div class="flex items-center justify-between">
              <div>
                <h2 hlmCardTitle>Mindmap</h2>
                <p hlmCardDescription>AI-generated Mermaid mindmap of this project.</p>
              </div>
              @if (mindmapFacade.mindmap()?.mermaid && mindmapRendered()) {
                <button
                  hlmBtn
                  variant="outline"
                  size="sm"
                  (click)="exportMindmap()"
                  aria-label="Download mindmap"
                >
                  <ng-icon name="lucideDownload" />
                  Download SVG
                </button>
              }
            </div>
          </div>
          <div hlmCardContent>
            @if (isAssetBootstrapLoading() || mindmapFacade.isLoading()) {
              <div class="space-y-2" role="status" aria-label="Loading mindmap">
                <hlm-skeleton class="h-5 w-32" />
                <hlm-skeleton class="h-64 w-full rounded-md" />
              </div>
            } @else if (mindmapFacade.generationStatus() === 'failed') {
              <div hlmAlert variant="destructive" class="flex items-start justify-between">
                <div class="flex items-start gap-2">
                  <ng-icon hlm hlmAlertIcon name="lucideCircleAlert" />
                  <p hlmAlertDescription>
                    {{ mindmapFacade.generationError() ?? 'Mindmap generation failed.' }}
                  </p>
                </div>
                <button
                  hlmBtn
                  variant="ghost"
                  size="icon-sm"
                  (click)="mindmapFacade.dismissError()"
                  aria-label="Dismiss error"
                >
                  <ng-icon name="lucideX" />
                </button>
              </div>
            } @else if (mindmapFacade.mindmap(); as mindmap) {
              @if (mindmapFacade.isGenerating()) {
                <div
                  class="mb-3 flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2"
                >
                  <hlm-spinner class="text-xs" />
                  <span class="text-xs text-muted-foreground">Regenerating mindmap...</span>
                </div>
              }
              <div
                [class.opacity-50]="mindmapFacade.isGenerating()"
                [class.pointer-events-none]="mindmapFacade.isGenerating()"
                class="transition-opacity"
              >
                <app-mermaid-mindmap-viewer
                  [definition]="mindmap.mermaid"
                  renderIdPrefix="project-mindmap"
                  containerId="mindmap-svg-container"
                  ariaLabel="Project mindmap"
                  (renderedChange)="mindmapRendered.set($event)"
                />
                <p class="mt-2 text-xs text-muted-foreground">
                  Retrieved {{ mindmap.retrievedCount }} context chunks.
                </p>
                @if (mindmap.warning; as warning) {
                  <p class="text-xs text-muted-foreground">{{ warning }}</p>
                }
              </div>
            } @else if (mindmapFacade.isGenerating()) {
              <div class="flex items-center gap-3 py-6">
                <hlm-spinner class="text-sm" />
                <div>
                  <p class="text-sm font-medium">
                    @switch (mindmapFacade.generationStatus()) {
                      @case ('pending') {
                        Queued — waiting to start...
                      }
                      @case ('running') {
                        Generating mindmap...
                      }
                      @default {
                        Processing...
                      }
                    }
                  </p>
                  <p class="text-xs text-muted-foreground">
                    This updates automatically when ready.
                  </p>
                </div>
              </div>
            } @else {
              <div class="space-y-3 py-2">
                <p class="text-sm text-muted-foreground">
                  No mindmap has been generated for this project yet.
                </p>
              </div>
            }

            @if (mindmapError()) {
              <div hlmAlert variant="destructive" class="mt-4">
                <ng-icon hlm hlmAlertIcon name="lucideCircleAlert" />
                <p hlmAlertDescription>{{ mindmapError() }}</p>
              </div>
            }
          </div>
        </section>

        <!-- Audio -->
        <section hlmCard>
          <div hlmCardHeader>
            <div class="flex items-center justify-between">
              <div>
                <h2 hlmCardTitle>Radio</h2>
                <p hlmCardDescription>AI-generated audio overview of this project.</p>
              </div>
              @if (audioFacade.audio()?.audioUrl) {
                <button
                  hlmBtn
                  variant="outline"
                  size="sm"
                  [disabled]="isExportingAudio()"
                  (click)="exportAudio()"
                  aria-label="Download audio"
                >
                  <ng-icon name="lucideDownload" />
                  {{
                    isExportingAudio()
                      ? 'Downloading...'
                      : 'Download ' + (audioFacade.audio()?.format?.toUpperCase() ?? 'Audio')
                  }}
                </button>
              }
            </div>
          </div>
          <div hlmCardContent>
            @if (audioFacade.isLoading()) {
              <div class="space-y-2" role="status" aria-label="Loading audio">
                <hlm-skeleton class="h-12 w-full rounded-md" />
              </div>
            } @else if (audioFacade.generationStatus() === 'failed') {
              <div hlmAlert variant="destructive" class="flex items-start justify-between">
                <div class="flex items-start gap-2">
                  <ng-icon hlm hlmAlertIcon name="lucideCircleAlert" />
                  <p hlmAlertDescription>
                    {{ audioFacade.generationError() ?? 'Audio generation failed.' }}
                  </p>
                </div>
                <button
                  hlmBtn
                  variant="ghost"
                  size="icon-sm"
                  (click)="audioFacade.dismissError()"
                  aria-label="Dismiss error"
                >
                  <ng-icon name="lucideX" />
                </button>
              </div>
            } @else if (audioFacade.audio(); as audio) {
              @if (audioFacade.isGenerating()) {
                <div
                  class="mb-3 flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2"
                >
                  <hlm-spinner class="text-xs" />
                  <span class="text-xs text-muted-foreground">Regenerating audio...</span>
                </div>
              }
              <div
                [class.opacity-50]="audioFacade.isGenerating()"
                [class.pointer-events-none]="audioFacade.isGenerating()"
                class="transition-opacity"
              >
                @if (audio.audioUrl) {
                  <audio controls preload="metadata" class="w-full">
                    <source [src]="audio.audioUrl" [type]="audioMimeType(audio.format)" />
                    Your browser does not support the audio element.
                  </audio>
                  <p class="mt-2 text-xs text-muted-foreground">
                    Voice: {{ audio.voice }} &middot; Model: {{ audio.model }} &middot; Format:
                    {{ audio.format }}
                  </p>
                  @if (audio.script) {
                    <details class="mt-4">
                      <summary class="cursor-pointer text-sm font-medium">Narration script</summary>
                      <p class="mt-2 whitespace-pre-line text-sm text-muted-foreground">
                        {{ audio.script }}
                      </p>
                    </details>
                  }
                } @else {
                  <p class="text-sm text-muted-foreground py-2">Audio is being processed.</p>
                }
              </div>
            } @else if (audioFacade.isGenerating()) {
              <div class="flex items-center gap-3 py-6">
                <hlm-spinner class="text-sm" />
                <div>
                  <p class="text-sm font-medium">
                    @switch (audioFacade.generationStatus()) {
                      @case ('pending') {
                        Queued — waiting to start...
                      }
                      @case ('running') {
                        Generating audio...
                      }
                      @default {
                        Processing...
                      }
                    }
                  </p>
                  <p class="text-xs text-muted-foreground">
                    This updates automatically when ready.
                  </p>
                </div>
              </div>
            } @else {
              <div class="space-y-3 py-2">
                <p class="text-sm text-muted-foreground">
                  No audio has been generated for this project yet.
                </p>
              </div>
            }

            @if (audioError()) {
              <div hlmAlert variant="destructive" class="mt-4">
                <ng-icon hlm hlmAlertIcon name="lucideCircleAlert" />
                <p hlmAlertDescription>{{ audioError() }}</p>
              </div>
            }
          </div>
        </section>

        <!-- Video -->
        <section hlmCard>
          <div hlmCardHeader>
            <div class="flex items-center justify-between">
              <div>
                <h2 hlmCardTitle>Video</h2>
                <p hlmCardDescription>AI-generated narrated slideshow video of this project.</p>
              </div>
              @if (videoFacade.video()?.videoUrl) {
                <button
                  hlmBtn
                  variant="outline"
                  size="sm"
                  [disabled]="isExportingVideo()"
                  (click)="exportVideo()"
                  aria-label="Download video"
                >
                  <ng-icon name="lucideDownload" />
                  {{ isExportingVideo() ? 'Downloading...' : 'Download MP4' }}
                </button>
              }
            </div>
          </div>
          <div hlmCardContent>
            @if (isAssetBootstrapLoading() || videoFacade.isLoading()) {
              <div class="space-y-2" role="status" aria-label="Loading video">
                <hlm-skeleton class="aspect-video w-full rounded-md" />
                <hlm-skeleton class="h-4 w-48" />
              </div>
            } @else if (videoFacade.generationStatus() === 'failed') {
              <div hlmAlert variant="destructive" class="flex items-start justify-between">
                <div class="flex items-start gap-2">
                  <ng-icon hlm hlmAlertIcon name="lucideCircleAlert" />
                  <p hlmAlertDescription>
                    {{ videoFacade.generationError() ?? 'Video generation failed.' }}
                  </p>
                </div>
                <button
                  hlmBtn
                  variant="ghost"
                  size="icon-sm"
                  (click)="videoFacade.dismissError()"
                  aria-label="Dismiss error"
                >
                  <ng-icon name="lucideX" />
                </button>
              </div>
            } @else if (videoFacade.video(); as video) {
              @if (videoFacade.isGenerating()) {
                <div
                  class="mb-3 flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2"
                >
                  <hlm-spinner class="text-xs" />
                  <span class="text-xs text-muted-foreground">Regenerating video...</span>
                </div>
              }
              <div
                [class.opacity-50]="videoFacade.isGenerating()"
                [class.pointer-events-none]="videoFacade.isGenerating()"
                class="transition-opacity"
              >
                @if (video.videoUrl) {
                  <video
                    controls
                    preload="metadata"
                    class="aspect-video w-full rounded-md bg-black"
                    [src]="video.videoUrl"
                  >
                    Your browser does not support the video element.
                  </video>
                  <p class="mt-2 text-xs text-muted-foreground">
                    {{ video.slideCount }} slide{{ video.slideCount === 1 ? '' : 's' }} &middot;
                    Retrieved {{ video.retrievedCount }} context chunk{{
                      video.retrievedCount === 1 ? '' : 's'
                    }}
                  </p>
                  @if (video.warning) {
                    <p class="text-xs text-muted-foreground">{{ video.warning }}</p>
                  }
                } @else {
                  <p class="text-sm text-muted-foreground py-2">Video is being processed.</p>
                }
              </div>
            } @else if (videoFacade.isGenerating()) {
              <div class="flex items-center gap-3 py-6">
                <hlm-spinner class="text-sm" />
                <div>
                  <p class="text-sm font-medium">
                    @switch (videoFacade.generationStatus()) {
                      @case ('pending') {
                        Queued — waiting to start...
                      }
                      @case ('running') {
                        Generating video...
                      }
                      @default {
                        Processing...
                      }
                    }
                  </p>
                  <p class="text-xs text-muted-foreground">
                    This updates automatically when ready.
                  </p>
                </div>
              </div>
            } @else {
              <div class="space-y-3 py-2">
                <p class="text-sm text-muted-foreground">
                  No video has been generated for this project yet.
                </p>
              </div>
            }

            @if (videoError()) {
              <div hlmAlert variant="destructive" class="mt-4">
                <ng-icon hlm hlmAlertIcon name="lucideCircleAlert" />
                <p hlmAlertDescription>{{ videoError() }}</p>
              </div>
            }
          </div>
        </section>
      }
    </div>
  `,
})
export class ProjectDetailPage implements OnInit, OnDestroy {
  private readonly projectFacade = inject(ProjectFacade);
  private readonly orgFacade = inject(OrganizationFacade);
  private readonly trainingFacade = inject(TrainingFacade);
  protected readonly infographicFacade = inject(InfographicFacade);
  protected readonly mindmapFacade = inject(MindmapFacade);
  protected readonly audioFacade = inject(AudioFacade);
  protected readonly videoFacade = inject(VideoFacade);
  private readonly exportService = inject(ExportService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private projectChannel: RealtimeChannel | null = null;

  protected readonly isLoading = signal(true);
  protected readonly isAssetBootstrapLoading = signal(false);
  protected readonly isAdmin = computed(() => this.orgFacade.isAdmin());
  protected readonly projectsLink = computed(() => `/${this.orgFacade.activeOrgSlug()}/projects`);
  protected readonly infographicError = signal<string | null>(null);
  protected readonly mindmapError = signal<string | null>(null);
  protected readonly audioError = signal<string | null>(null);
  protected readonly videoError = signal<string | null>(null);
  protected readonly isExportingInfographic = signal(false);
  protected readonly isExportingAudio = signal(false);
  protected readonly isExportingVideo = signal(false);
  protected readonly mindmapRendered = signal(false);

  protected readonly projectTrainings = computed<readonly TrainingSummary[]>(() => {
    const projectId = this.route.snapshot.paramMap.get('projectId') ?? '';
    return this.trainingFacade.projectTrainings(projectId);
  });

  protected readonly project = computed(() => {
    const projectId = this.route.snapshot.paramMap.get('projectId');
    return this.projectFacade.projects().find((p) => p.id === projectId) ?? null;
  });

  protected readonly hasIntegrations = computed(() => {
    const proj = this.project();
    if (!proj) return false;
    return !!(proj.githubLink || proj.jiraLink || proj.confluenceLink);
  });

  async ngOnInit(): Promise<void> {
    const projectId = this.route.snapshot.paramMap.get('projectId');
    if (!projectId) {
      this.isLoading.set(false);
      return;
    }

    // If navigated from the generate page, set the generating hint immediately
    // so the regen UI shows even if the worker completes before checkForActiveJob runs.
    const generating = this.route.snapshot.queryParamMap.get('generating');
    if (generating === 'infographic') this.infographicFacade.generationStatus.set('pending');
    if (generating === 'mindmap') this.mindmapFacade.generationStatus.set('pending');
    if (generating === 'audio') this.audioFacade.generationStatus.set('pending');
    if (generating === 'video') this.videoFacade.generationStatus.set('pending');

    // Clear the hint from the URL so a page refresh does not re-trigger pending state.
    if (generating) {
      this.router.navigate([], { queryParams: {}, replaceUrl: true });
    }

    // If cached project exists, render header immediately and keep asset skeletons
    // until the first fresh asset fetch resolves.
    const cached = this.project();
    if (cached) {
      if (!this.isPipelineRunning(cached.status, !!cached.githubLink)) {
        this.isAssetBootstrapLoading.set(true);
      }
      this.isLoading.set(false);
      if (this.isPipelineRunning(cached.status, !!cached.githubLink)) {
        this.subscribeToProjectChanges(cached.id);
      }
    }

    void this.trainingFacade.ensureProjectTrainings(projectId);

    const refreshError = await this.projectFacade.refreshProject(projectId);
    this.isLoading.set(false);
    if (refreshError && !this.project()) {
      this.isAssetBootstrapLoading.set(false);
      console.error('[ProjectDetailPage] refreshProject failed:', refreshError);
      return;
    }

    const latest = this.project();
    if (latest) {
      await this.syncProjectUi(latest);
    }
  }

  ngOnDestroy(): void {
    this.unsubscribeProjectChannel();
  }

  // -- Realtime subscription for project status changes --

  private subscribeToProjectChanges(projectId: string): void {
    this.unsubscribeProjectChannel();

    const { client } = getSupabaseClientState();
    if (!client) return;

    this.projectChannel = client
      .channel(`project-status:${projectId}`)
      .on<Record<string, unknown>>(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'RoleReady',
          table: 'project',
          filter: `id=eq.${projectId}`,
        },
        async (payload) => {
          const rawStatus = payload.new['status'];
          if (!isProjectStatus(rawStatus)) return;

          // Merge the updated status into the project facade's local list
          await this.projectFacade.refreshProject(projectId);

          if (!this.isPipelineRunning(rawStatus, !!this.project()?.githubLink)) {
            this.unsubscribeProjectChannel();
            const proj = this.project();
            if (proj) {
              await this.syncProjectUi(proj);
            }
          }
        },
      )
      .subscribe();
  }

  private unsubscribeProjectChannel(): void {
    if (this.projectChannel) {
      this.projectChannel.unsubscribe();
      this.projectChannel = null;
    }
  }

  private async syncProjectUi(project: {
    id: string;
    status: string;
    githubLink?: string | null;
  }): Promise<void> {
    if (!this.isPipelineRunning(project.status, !!project.githubLink)) {
      this.infographicError.set(null);
      this.mindmapError.set(null);
      this.audioError.set(null);
      this.videoError.set(null);

      try {
        const [infographicLoadError, mindmapLoadError, audioLoadError, videoLoadError] =
          await Promise.all([
            this.infographicFacade.loadInfographic(project.id),
            this.mindmapFacade.loadMindmap(project.id),
            this.audioFacade.loadAudio(project.id),
            this.videoFacade.loadVideo(project.id),
          ]);
        if (infographicLoadError) this.infographicError.set(infographicLoadError.message);
        if (mindmapLoadError) this.mindmapError.set(mindmapLoadError.message);
        if (audioLoadError) this.audioError.set(audioLoadError.message);
        if (videoLoadError) this.videoError.set(videoLoadError.message);

        // Content is loaded — stop showing skeletons so regen UI can appear.
        this.isAssetBootstrapLoading.set(false);

        // Check for active generation jobs (covers both first-gen and re-gen).
        // If a generating hint was set via query param and the job already completed,
        // checkForActiveJob will reload data to pick up the fresh result.
        await Promise.all([
          this.infographicFacade.checkForActiveJob(project.id),
          this.mindmapFacade.checkForActiveJob(project.id),
          this.audioFacade.checkForActiveJob(project.id),
          this.videoFacade.checkForActiveJob(project.id),
        ]);
      } finally {
        // Safety net: ensure skeletons are removed even if checkForActiveJob throws.
        this.isAssetBootstrapLoading.set(false);
      }

      return;
    }

    if (this.isPipelineRunning(project.status, !!project.githubLink)) {
      this.isAssetBootstrapLoading.set(false);
      this.subscribeToProjectChanges(project.id);
    }
  }

  // -- Status helpers --

  protected isPipelineRunning(status: string, hasGithubSource = false): boolean {
    if (status === 'created') {
      return hasGithubSource;
    }
    return ['ingesting', 'ingestion_completed', 'generating_assets'].includes(status);
  }

  protected pipelineMessage(status: string): string {
    const msgs: Record<string, string> = {
      created: 'Pipeline is starting\u2026',
      ingesting: 'Ingesting project data\u2026',
      ingestion_completed: 'Data ingestion complete. Starting AI generation\u2026',
      generating_assets: 'Generating AI content (infographic, mindmap, audio, video)\u2026',
    };
    return msgs[status] ?? 'Processing\u2026';
  }

  protected pipelineProgress(status: string): number {
    const pct: Record<string, number> = {
      created: 10,
      ingesting: 35,
      ingestion_completed: 55,
      generating_assets: 80,
    };
    return pct[status] ?? 0;
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

  protected trainingStatusClass(status: string): string {
    const classes: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
      published: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
      archived: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
    };
    return classes[status] ?? 'bg-gray-100 text-gray-700';
  }

  protected audioMimeType(format: string): string {
    const types: Record<string, string> = {
      mp3: 'audio/mpeg',
      opus: 'audio/opus',
      aac: 'audio/aac',
      flac: 'audio/flac',
      wav: 'audio/wav',
      pcm: 'audio/L16',
    };
    return types[format] ?? 'audio/mpeg';
  }

  // -- Export methods --

  protected async exportInfographic(): Promise<void> {
    const imageUrl = this.infographicFacade.infographic()?.imageUrl;
    if (!imageUrl) return;

    const projectName = this.project()?.projectName ?? 'project';
    const filename = `${this.slugify(projectName)}-infographic.png`;

    this.isExportingInfographic.set(true);
    try {
      await this.exportService.downloadFromUrl(imageUrl, filename);
    } catch (error) {
      console.error('[ProjectDetailPage] Failed to export infographic:', error);
    } finally {
      this.isExportingInfographic.set(false);
    }
  }

  protected exportMindmap(): void {
    const projectName = this.project()?.projectName ?? 'project';
    const filename = `${this.slugify(projectName)}-mindmap.svg`;
    try {
      this.exportService.downloadSvgFromDom('#mindmap-svg-container', filename);
    } catch (error) {
      console.error('[ProjectDetailPage] Failed to export mindmap:', error);
    }
  }

  protected async exportAudio(): Promise<void> {
    const audio = this.audioFacade.audio();
    if (!audio?.audioUrl) return;

    const projectName = this.project()?.projectName ?? 'project';
    const ext = audio.format ?? 'mp3';
    const filename = `${this.slugify(projectName)}-audio.${ext}`;

    this.isExportingAudio.set(true);
    try {
      await this.exportService.downloadFromUrl(audio.audioUrl, filename);
    } catch (error) {
      console.error('[ProjectDetailPage] Failed to export audio:', error);
    } finally {
      this.isExportingAudio.set(false);
    }
  }

  protected async exportVideo(): Promise<void> {
    const video = this.videoFacade.video();
    if (!video?.videoUrl) return;

    const projectName = this.project()?.projectName ?? 'project';
    const filename = `${this.slugify(projectName)}-video.mp4`;

    this.isExportingVideo.set(true);
    try {
      await this.exportService.downloadFromUrl(video.videoUrl, filename);
    } catch (error) {
      console.error('[ProjectDetailPage] Failed to export video:', error);
    } finally {
      this.isExportingVideo.set(false);
    }
  }

  private slugify(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  protected formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString();
  }
}
