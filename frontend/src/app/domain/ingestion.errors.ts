export type IngestionErrorKind = 'INFRA' | 'VALIDATION' | 'DOMAIN';

export interface IngestionError {
  readonly kind: IngestionErrorKind;
  readonly message: string;
  readonly detail?: string;
}

export function infraError(message: string, detail?: string): IngestionError {
  return { kind: 'INFRA', message, detail };
}

export function validationError(message: string, detail?: string): IngestionError {
  return { kind: 'VALIDATION', message, detail };
}

export function domainError(message: string, detail?: string): IngestionError {
  return { kind: 'DOMAIN', message, detail };
}
