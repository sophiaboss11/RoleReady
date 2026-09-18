export type VideoErrorKind = 'INFRA' | 'VALIDATION' | 'DOMAIN';

export interface VideoError {
  readonly kind: VideoErrorKind;
  readonly message: string;
  readonly detail?: string;
}

export function infraError(message: string, detail?: string): VideoError {
  return { kind: 'INFRA', message, detail };
}

export function validationError(message: string, detail?: string): VideoError {
  return { kind: 'VALIDATION', message, detail };
}

export function domainError(message: string, detail?: string): VideoError {
  return { kind: 'DOMAIN', message, detail };
}
