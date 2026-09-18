export type MindmapErrorKind = 'INFRA' | 'VALIDATION' | 'DOMAIN';

export interface MindmapError {
  readonly kind: MindmapErrorKind;
  readonly message: string;
  readonly detail?: string;
}

export function infraError(message: string, detail?: string): MindmapError {
  return { kind: 'INFRA', message, detail };
}

export function validationError(message: string, detail?: string): MindmapError {
  return { kind: 'VALIDATION', message, detail };
}

export function domainError(message: string, detail?: string): MindmapError {
  return { kind: 'DOMAIN', message, detail };
}
