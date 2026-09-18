import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { HlmButtonImports } from '@app/ui/button';
import { MermaidRendererService } from '../../services/mermaid-renderer.service';

@Component({
  selector: 'app-mermaid-mindmap-viewer',
  standalone: true,
  imports: [HlmButtonImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isRendering()) {
      <div
        class="flex items-center justify-center rounded-md border bg-muted/30"
        [style.height]="height()"
      >
        <p class="text-sm text-muted-foreground" role="status" aria-live="polite">
          Rendering mindmap...
        </p>
      </div>
    } @else if (renderError(); as error) {
      <div class="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-4">
        <p class="text-sm font-medium text-destructive" role="alert">
          Failed to render mindmap: {{ error }}
        </p>
        <pre class="max-h-80 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">{{
          normalizedDefinition()
        }}</pre>
      </div>
    } @else if (svg(); as renderedSvg) {
      <div
        [id]="containerId()"
        class="relative overflow-hidden rounded-md border bg-background touch-none"
        [class.cursor-grab]="interactive() && !isPanning()"
        [class.cursor-grabbing]="interactive() && isPanning()"
        [style.height]="height()"
        [attr.aria-label]="ariaLabel()"
        role="img"
        (wheel)="onWheel($event)"
        (pointerdown)="onPointerDown($event)"
        (pointermove)="onPointerMove($event)"
        (pointerup)="onPointerUp($event)"
        (pointercancel)="onPointerUp($event)"
        (pointerleave)="onPointerUp($event)"
      >
        @if (showControls()) {
          <div
            class="absolute right-3 top-3 z-10 flex items-center gap-2 rounded-md border bg-background/95 px-2 py-1 shadow-sm"
            (pointerdown)="$event.stopPropagation()"
          >
            <button
              hlmBtn
              type="button"
              variant="outline"
              size="sm"
              (click)="zoomOut()"
              aria-label="Zoom out"
            >
              -
            </button>
            <button
              hlmBtn
              type="button"
              variant="outline"
              size="sm"
              (click)="zoomIn()"
              aria-label="Zoom in"
            >
              +
            </button>
            <button hlmBtn type="button" variant="outline" size="sm" (click)="resetViewport()">
              Reset
            </button>
            <span class="text-xs text-muted-foreground">{{ zoomPercent() }}%</span>
          </div>
        }
        <div
          [class]="svgContentClass()"
          [style.transform]="svgContentTransform()"
          [innerHTML]="renderedSvg"
        ></div>
      </div>
    } @else {
      <div
        class="flex items-center justify-center rounded-md border border-dashed bg-muted/30"
        [style.height]="height()"
      >
        <p class="text-sm text-muted-foreground">{{ emptyLabel() }}</p>
      </div>
    }
  `,
})
export class MermaidMindmapViewer {
  private static readonly MIN_ZOOM = 0.35;
  private static readonly MAX_ZOOM = 3;
  private static readonly BUTTON_ZOOM_FACTOR = 1.2;
  private static readonly INTERACTIVE_SVG_CONTENT_CLASS =
    'origin-top-left p-3 select-none will-change-transform';
  private static readonly PREVIEW_SVG_CONTENT_CLASS = [
    'flex h-full w-full items-center justify-center p-2 select-none',
    '[&_svg]:h-full [&_svg]:max-h-full [&_svg]:max-w-full [&_svg]:w-full',
  ].join(' ');

  private readonly renderer = inject(MermaidRendererService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly destroyRef = inject(DestroyRef);

  readonly definition = input<string | null>(null);
  readonly renderIdPrefix = input('mindmap');
  readonly containerId = input('mindmap-svg-container');
  readonly ariaLabel = input('Rendered mindmap');
  readonly emptyLabel = input('No mindmap is available.');
  readonly height = input('28rem');
  readonly interactive = input(true);
  readonly showControls = input(true);
  readonly renderedChange = output<boolean>();

  protected readonly svg = signal<SafeHtml | null>(null);
  protected readonly isRendering = signal(false);
  protected readonly renderError = signal<string | null>(null);
  protected readonly normalizedDefinition = signal('');
  protected readonly scale = signal(1);
  protected readonly offsetX = signal(0);
  protected readonly offsetY = signal(0);
  protected readonly isPanning = signal(false);
  protected readonly transform = computed(
    () => `translate(${this.offsetX()}px, ${this.offsetY()}px) scale(${this.scale()})`,
  );
  protected readonly zoomPercent = computed(() => Math.round(this.scale() * 100));
  protected readonly svgContentClass = computed(() =>
    this.interactive()
      ? MermaidMindmapViewer.INTERACTIVE_SVG_CONTENT_CLASS
      : MermaidMindmapViewer.PREVIEW_SVG_CONTENT_CLASS,
  );
  protected readonly svgContentTransform = computed(() =>
    this.interactive() ? this.transform() : 'none',
  );

  private activePointerId: number | null = null;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private renderSequence = 0;
  private isDestroyed = false;

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.isDestroyed = true;
      this.renderSequence += 1;
    });

    effect(() => {
      void this.renderDefinition(this.definition(), this.renderIdPrefix());
    });
  }

  protected zoomIn(): void {
    this.applyZoom(MermaidMindmapViewer.BUTTON_ZOOM_FACTOR);
  }

  protected zoomOut(): void {
    this.applyZoom(1 / MermaidMindmapViewer.BUTTON_ZOOM_FACTOR);
  }

  protected resetViewport(): void {
    this.scale.set(1);
    this.offsetX.set(0);
    this.offsetY.set(0);
    this.isPanning.set(false);
    this.activePointerId = null;
  }

  protected onWheel(event: WheelEvent): void {
    if (!this.interactive()) return;
    event.preventDefault();
    const container = event.currentTarget as HTMLElement | null;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const anchorX = event.clientX - rect.left;
    const anchorY = event.clientY - rect.top;
    const zoomFactor = Math.exp(-event.deltaY * 0.0015);
    this.applyZoom(zoomFactor, anchorX, anchorY);
  }

  protected onPointerDown(event: PointerEvent): void {
    if (!this.interactive()) return;
    if (event.button !== 0) return;
    const container = event.currentTarget as HTMLElement | null;
    if (!container) return;

    container.setPointerCapture(event.pointerId);
    this.activePointerId = event.pointerId;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
    this.isPanning.set(true);
  }

  protected onPointerMove(event: PointerEvent): void {
    if (!this.isPanning()) return;
    if (this.activePointerId !== event.pointerId) return;

    const deltaX = event.clientX - this.lastPointerX;
    const deltaY = event.clientY - this.lastPointerY;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;

    this.offsetX.update((x) => x + deltaX);
    this.offsetY.update((y) => y + deltaY);
  }

  protected onPointerUp(event: PointerEvent): void {
    if (this.activePointerId !== event.pointerId) return;

    const container = event.currentTarget as HTMLElement | null;
    if (container?.hasPointerCapture(event.pointerId)) {
      container.releasePointerCapture(event.pointerId);
    }

    this.activePointerId = null;
    this.isPanning.set(false);
  }

  private async renderDefinition(definition: string | null, renderIdPrefix: string): Promise<void> {
    const sequence = this.renderSequence + 1;
    this.renderSequence = sequence;

    const source = definition?.trim() ?? '';
    this.normalizedDefinition.set(source);
    this.renderError.set(null);
    this.resetViewport();
    this.renderedChange.emit(false);

    if (!source) {
      this.svg.set(null);
      this.isRendering.set(false);
      return;
    }

    this.isRendering.set(true);

    try {
      const svg = await this.renderer.render(source, renderIdPrefix);
      if (this.isStaleRender(sequence)) return;

      this.svg.set(this.sanitizer.bypassSecurityTrustHtml(svg));
      this.renderedChange.emit(true);
    } catch (error: unknown) {
      if (this.isStaleRender(sequence)) return;

      this.svg.set(null);
      this.renderedChange.emit(false);
      this.renderError.set(error instanceof Error ? error.message : 'Unknown Mermaid render error');
    } finally {
      if (!this.isStaleRender(sequence)) {
        this.isRendering.set(false);
      }
    }
  }

  private applyZoom(zoomFactor: number, anchorX = 0, anchorY = 0): void {
    const currentScale = this.scale();
    const nextScale = this.clamp(
      currentScale * zoomFactor,
      MermaidMindmapViewer.MIN_ZOOM,
      MermaidMindmapViewer.MAX_ZOOM,
    );
    if (nextScale === currentScale) return;

    const currentOffsetX = this.offsetX();
    const currentOffsetY = this.offsetY();
    const localX = (anchorX - currentOffsetX) / currentScale;
    const localY = (anchorY - currentOffsetY) / currentScale;

    this.scale.set(nextScale);
    this.offsetX.set(anchorX - localX * nextScale);
    this.offsetY.set(anchorY - localY * nextScale);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private isStaleRender(sequence: number): boolean {
    return this.isDestroyed || sequence !== this.renderSequence;
  }
}
