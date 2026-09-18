export type PromptErrorKind = 'INFRA' | 'VALIDATION' | 'DOMAIN';

export interface PromptError {
  readonly kind: PromptErrorKind;
  readonly message: string;
  readonly detail?: string;
}

export function infraError(message: string, detail?: string): PromptError {
  return { kind: 'INFRA', message, detail };
}

export function validationError(message: string, detail?: string): PromptError {
  return { kind: 'VALIDATION', message, detail };
}

export function domainError(message: string, detail?: string): PromptError {
  return { kind: 'DOMAIN', message, detail };
}
