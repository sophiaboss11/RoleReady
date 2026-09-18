import { Injectable } from '@angular/core';
import { markdownInfraError } from '../domain/markdown.errors';

type ZennMarkdownModule = typeof import('zenn-markdown-html');

@Injectable({ providedIn: 'root' })
export class MarkdownRendererService {
  private modulePromise: Promise<ZennMarkdownModule> | null = null;
  private readonly renderCache = new Map<string, Promise<string>>();

  render(markdown: string): Promise<string> {
    const source = markdown.trim();
    if (!source) return Promise.resolve('');

    const cached = this.renderCache.get(source);
    if (cached) return cached;

    const rendered = this.loadModule()
      .then(({ default: markdownToHtml }) => markdownToHtml(source))
      .catch((error: unknown) => {
        this.renderCache.delete(source);
        throw markdownInfraError(
          'Failed to render markdown content',
          error instanceof Error ? error.message : undefined,
        );
      });

    this.renderCache.set(source, rendered);
    return rendered;
  }

  private loadModule(): Promise<ZennMarkdownModule> {
    this.modulePromise ??= import('zenn-markdown-html');
    return this.modulePromise;
  }
}
