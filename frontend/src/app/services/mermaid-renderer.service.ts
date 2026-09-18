import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import type Mermaid from 'mermaid';

@Injectable({ providedIn: 'root' })
export class MermaidRendererService {
  private readonly platformId = inject(PLATFORM_ID);

  private mermaidModule: typeof Mermaid | null = null;
  private modulePromise: Promise<typeof Mermaid> | null = null;
  private initialized = false;
  private renderSequence = 0;

  async render(definition: string, idPrefix: string): Promise<string> {
    const mermaid = await this.loadMermaid();
    this.initializeIfNeeded(mermaid);

    const normalizedDefinition = this.normalizeDefinition(definition);
    await mermaid.parse(normalizedDefinition, { suppressErrors: false });

    const renderId = `${idPrefix}-${++this.renderSequence}`;
    const { svg } = await mermaid.render(renderId, normalizedDefinition);
    return svg;
  }

  private async loadMermaid(): Promise<typeof Mermaid> {
    if (!isPlatformBrowser(this.platformId)) {
      throw new Error('Mermaid rendering is only available in the browser.');
    }

    if (this.mermaidModule) {
      return this.mermaidModule;
    }

    if (!this.modulePromise) {
      this.modulePromise = import('mermaid').then((module) => module.default);
    }

    this.mermaidModule = await this.modulePromise;
    return this.mermaidModule;
  }

  private initializeIfNeeded(mermaid: typeof Mermaid): void {
    if (this.initialized) {
      return;
    }

    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      themeVariables: {
        background: '#ffffff',
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, "Noto Sans", sans-serif',
        lineColor: '#1f2937',
        primaryColor: '#dbeafe',
        primaryTextColor: '#111827',
        primaryBorderColor: '#1d4ed8',
        secondaryColor: '#eff6ff',
        tertiaryColor: '#e0f2fe',
        tertiaryTextColor: '#111827',
        mainBkg: '#dbeafe',
        secondBkg: '#eff6ff',
        tertiaryBkg: '#e0f2fe',
        clusterBkg: '#f3f4f6',
        clusterBorder: '#374151',
        titleColor: '#111827',
        edgeLabelBackground: '#ffffff',
      },
    });
    this.initialized = true;
  }

  private normalizeDefinition(definition: string): string {
    const trimmed = definition.trim();
    const fencedMatch = trimmed.match(/^```(?:\s*mermaid)?\s*\r?\n([\s\S]*?)\r?\n```$/i);
    if (fencedMatch?.[1]) {
      return fencedMatch[1].trim();
    }
    return trimmed;
  }
}
