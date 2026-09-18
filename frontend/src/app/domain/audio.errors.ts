export type AudioErrorKind = 'INFRA' | 'VALIDATION' | 'DOMAIN';

export interface AudioError {
  readonly kind: AudioErrorKind;
  readonly message: string;
  readonly detail?: string;
}

export function infraError(message: string, detail?: string): AudioError {
  return { kind: 'INFRA', message, detail };
}

export function validationError(message: string, detail?: string): AudioError {
  return { kind: 'VALIDATION', message, detail };
}

export function domainError(message: string, detail?: string): AudioError {
  return { kind: 'DOMAIN', message, detail };
}
