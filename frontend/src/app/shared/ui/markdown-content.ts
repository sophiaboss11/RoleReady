import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { type MarkdownError, toMarkdownError } from '../../domain/markdown.errors';
import { MarkdownRendererService } from '../../services/markdown-renderer.service';

@Component({
  selector: 'app-markdown-content',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (renderedHtml(); as html) {
      <div [class]="contentClass()" [innerHTML]="html"></div>
    } @else if (isRendering()) {
      <div class="markdown-render-placeholder" role="status" aria-live="polite">
        Rendering content...
      </div>
    } @else if (renderError(); as error) {
      <div class="space-y-3">
        <p class="text-sm font-medium text-destructive" role="alert">
          {{ error.message }}. Showing the source content instead.
        </p>
        <pre class="markdown-render-fallback">{{ normalizedMarkdown() }}</pre>
      </div>
    } @else if (emptyLabel()) {
      <p class="text-sm text-muted-foreground">{{ emptyLabel() }}</p>
    }
  `,
  styles: `
    :host {
      display: block;
    }

    .markdown-render-placeholder {
      min-height: 5rem;
      display: flex;
      align-items: center;
      color: var(--muted-foreground);
      font-size: 0.875rem;
    }

    .markdown-render-fallback {
      max-width: 100%;
      overflow-x: auto;
      white-space: pre-wrap;
      border-radius: 0.5rem;
      border: 1px solid var(--border);
      background: var(--muted);
      padding: 1rem;
      color: var(--muted-foreground);
      font-size: 0.875rem;
      line-height: 1.7;
    }
  `,
})
export class MarkdownContent {
  private readonly renderer = inject(MarkdownRendererService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly destroyRef = inject(DestroyRef);

  readonly markdown = input<string | null>(null);
  readonly contentClass = input('markdown-content');
  readonly emptyLabel = input('');

  protected readonly renderedHtml = signal<SafeHtml | null>(null);
  protected readonly isRendering = signal(false);
  protected readonly renderError = signal<MarkdownError | null>(null);
  protected readonly normalizedMarkdown = signal('');

  private renderSequence = 0;
  private isDestroyed = false;

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.isDestroyed = true;
      this.renderSequence += 1;
    });

    effect(() => {
      void this.renderMarkdown(this.markdown());
    });
  }

  private async renderMarkdown(markdown: string | null): Promise<void> {
    const sequence = this.renderSequence + 1;
    this.renderSequence = sequence;

    const source = markdown?.trim() ?? '';
    this.normalizedMarkdown.set(source);
    this.renderError.set(null);

    if (!source) {
      this.renderedHtml.set(null);
      this.isRendering.set(false);
      return;
    }

    this.isRendering.set(true);

    try {
      const html = await this.renderer.render(source);
      if (this.isStaleRender(sequence)) return;

      this.renderedHtml.set(this.sanitizer.bypassSecurityTrustHtml(html));
    } catch (error: unknown) {
      if (this.isStaleRender(sequence)) return;

      this.renderedHtml.set(null);
      this.renderError.set(toMarkdownError(error));
    } finally {
      if (!this.isStaleRender(sequence)) {
        this.isRendering.set(false);
      }
    }
  }

  private isStaleRender(sequence: number): boolean {
    return this.isDestroyed || sequence !== this.renderSequence;
  }
}
