export type PromptType = 'narration' | 'mindmap' | 'infographic_text' | 'summary';

export interface ProjectPrompt {
  readonly id: string;
  readonly projectId: string;
  readonly promptType: PromptType;
  readonly instruction: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PromptDefault {
  readonly promptType: PromptType;
  readonly instruction: string;
}

export const OUTPUT_TO_PROMPT_TYPE: Readonly<Record<string, PromptType>> = {
  audio: 'narration',
  mindmap: 'mindmap',
  infographic: 'infographic_text',
};
