export type MarkdownErrorKind = 'INFRA' | 'VALIDATION' | 'DOMAIN' | 'EXTERNAL';

export interface MarkdownError {
  readonly kind: MarkdownErrorKind;
  readonly message: string;
  readonly detail?: string;
}

export function markdownInfraError(message: string, detail?: string): MarkdownError {
  return { kind: 'INFRA', message, detail };
}

export function markdownValidationError(message: string, detail?: string): MarkdownError {
  return { kind: 'VALIDATION', message, detail };
}

export function markdownDomainError(message: string, detail?: string): MarkdownError {
  return { kind: 'DOMAIN', message, detail };
}

export function markdownExternalError(message: string, detail?: string): MarkdownError {
  return { kind: 'EXTERNAL', message, detail };
}

export function isMarkdownError(error: unknown): error is MarkdownError {
  if (!error || typeof error !== 'object') return false;

  const candidate = error as Partial<MarkdownError>;
  return (
    typeof candidate.message === 'string' &&
    (candidate.kind === 'INFRA' ||
      candidate.kind === 'VALIDATION' ||
      candidate.kind === 'DOMAIN' ||
      candidate.kind === 'EXTERNAL')
  );
}

export function toMarkdownError(
  error: unknown,
  fallbackMessage = 'Markdown rendering failed',
): MarkdownError {
  if (isMarkdownError(error)) return error;

  if (error instanceof Error) {
    return markdownInfraError(fallbackMessage, error.message);
  }

  return markdownInfraError(fallbackMessage);
}
