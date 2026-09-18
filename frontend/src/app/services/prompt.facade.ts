import { inject, Injectable, signal } from '@angular/core';
import { PromptService } from './prompt.service';
import type { ProjectPrompt, PromptDefault, PromptType } from '../domain/prompt.types';
import { infraError, type PromptError } from '../domain/prompt.errors';

@Injectable()
export class PromptFacade {
  private readonly promptService = inject(PromptService);

  readonly customPrompts = signal<readonly ProjectPrompt[]>([]);
  readonly defaults = signal<readonly PromptDefault[]>([]);
  readonly isLoading = signal(false);
  readonly isSaving = signal(false);

  resolveInstruction(promptType: PromptType): string {
    const custom = this.customPrompts().find((p) => p.promptType === promptType);
    if (custom) return custom.instruction;

    const def = this.defaults().find((d) => d.promptType === promptType);
    return def?.instruction ?? '';
  }

  isCustomized(promptType: PromptType): boolean {
    return this.customPrompts().some((p) => p.promptType === promptType);
  }

  async loadPrompts(projectId: string): Promise<PromptError | null> {
    this.isLoading.set(true);

    const [defaultsResult, promptsResult] = await Promise.all([
      this.promptService.getDefaults(),
      this.promptService.getPrompts(projectId),
    ]);

    this.isLoading.set(false);

    if (defaultsResult.errorMessage) {
      return infraError(defaultsResult.errorMessage);
    }

    if (promptsResult.errorMessage) {
      return infraError(promptsResult.errorMessage);
    }

    this.defaults.set(defaultsResult.data!);
    this.customPrompts.set(promptsResult.data!);
    return null;
  }

  async savePrompt(
    projectId: string,
    promptType: PromptType,
    instruction: string,
  ): Promise<PromptError | null> {
    this.isSaving.set(true);
    const { data, errorMessage } = await this.promptService.savePrompt(
      projectId,
      promptType,
      instruction,
    );
    this.isSaving.set(false);

    if (errorMessage) {
      return infraError(errorMessage);
    }

    this.customPrompts.update((prev) => {
      const filtered = prev.filter((p) => p.promptType !== promptType);
      return [...filtered, data!];
    });
    return null;
  }

  async resetPrompt(projectId: string, promptType: PromptType): Promise<PromptError | null> {
    this.isSaving.set(true);
    const { errorMessage } = await this.promptService.deletePrompt(projectId, promptType);
    this.isSaving.set(false);

    if (errorMessage) {
      return infraError(errorMessage);
    }

    this.customPrompts.update((prev) => prev.filter((p) => p.promptType !== promptType));
    return null;
  }
}
