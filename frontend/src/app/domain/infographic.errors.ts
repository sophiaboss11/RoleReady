export type InfographicErrorKind = 'INFRA' | 'VALIDATION' | 'DOMAIN';

export interface InfographicError {
  readonly kind: InfographicErrorKind;
  readonly message: string;
  readonly detail?: string;
}

export function infraError(message: string, detail?: string): InfographicError {
  return { kind: 'INFRA', message, detail };
}

export function validationError(message: string, detail?: string): InfographicError {
  return { kind: 'VALIDATION', message, detail };
}

export function domainError(message: string, detail?: string): InfographicError {
  return { kind: 'DOMAIN', message, detail };
}
