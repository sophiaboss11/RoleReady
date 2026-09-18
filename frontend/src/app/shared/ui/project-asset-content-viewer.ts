import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucidePlay } from '@ng-icons/lucide';
import { MarkdownContent } from './markdown-content';
import { MermaidMindmapViewer } from './mermaid-mindmap-viewer';

export interface ProjectAssetContent {
  readonly type: string;
  readonly text: string | null;
  readonly imageUrl: string | null;
  readonly audioUrl: string | null;
  readonly audioFormat: string | null;
  readonly videoUrl: string | null;
}

@Component({
  selector: 'app-project-asset-content-viewer',
  standalone: true,
  imports: [MarkdownContent, MermaidMindmapViewer, NgIcon],
  providers: [provideIcons({ lucidePlay })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (content(); as item) {
      @switch (item.type) {
        @case ('summary') {
          <app-markdown-content [markdown]="item.text" />
        }
        @case ('infographic') {
          <div class="space-y-4">
            @if (item.imageUrl) {
              <img [src]="item.imageUrl" alt="Infographic" class="w-full rounded-xl" />
            }
            @if (item.text) {
              <app-markdown-content [markdown]="item.text" />
            }
          </div>
        }
        @case ('mindmap') {
          <app-mermaid-mindmap-viewer
            [definition]="item.text"
            [renderIdPrefix]="mindmapRenderIdPrefix()"
            containerId="training-mindmap-svg-container"
            ariaLabel="Training module mindmap"
          />
        }
        @case ('audio') {
          <div class="space-y-4">
            @if (item.audioUrl) {
              <audio controls class="w-full" [src]="item.audioUrl">
                Your browser does not support audio playback.
              </audio>
            }
            @if (item.text) {
              <details class="rounded-xl border p-4">
                <summary class="cursor-pointer text-sm font-medium">Narration Script</summary>
                <app-markdown-content class="mt-3" [markdown]="item.text" />
              </details>
            }
          </div>
        }
        @case ('video') {
          @if (item.videoUrl) {
            <video
              controls
              preload="metadata"
              class="aspect-video w-full rounded-xl bg-black"
              [src]="item.videoUrl"
            >
              Your browser does not support video playback.
            </video>
          } @else {
            <div
              class="flex aspect-video items-center justify-center rounded-xl border border-dashed bg-muted/30"
            >
              <div class="space-y-2 text-center">
                <ng-icon name="lucidePlay" class="text-3xl text-muted-foreground" />
                <p class="text-sm text-muted-foreground">Video is still being generated.</p>
              </div>
            </div>
          }
        }
        @default {
          <p class="py-4 text-center text-sm text-muted-foreground">
            Content viewer for "{{ item.type }}" modules is not implemented yet.
          </p>
        }
      }
    } @else {
      <p class="py-4 text-center text-sm text-muted-foreground">
        No content available for this module yet.
      </p>
    }
  `,
})
export class ProjectAssetContentViewer {
  readonly content = input<ProjectAssetContent | null>(null);
  readonly mindmapRenderIdPrefix = input('training-module-mindmap');
}
