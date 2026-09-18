export type TrainingErrorKind = 'INFRA' | 'VALIDATION' | 'DOMAIN';

export interface TrainingError {
  readonly kind: TrainingErrorKind;
  readonly message: string;
  readonly detail?: string;
}

export function infraError(message: string, detail?: string): TrainingError {
  return { kind: 'INFRA', message, detail };
}

export function validationError(message: string, detail?: string): TrainingError {
  return { kind: 'VALIDATION', message, detail };
}

export function domainError(message: string, detail?: string): TrainingError {
  return { kind: 'DOMAIN', message, detail };
}
