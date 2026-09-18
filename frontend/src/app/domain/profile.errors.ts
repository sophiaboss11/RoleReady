export type ProfileErrorKind = 'INFRA' | 'VALIDATION' | 'DOMAIN';

export interface ProfileError {
  readonly kind: ProfileErrorKind;
  readonly message: string;
  readonly detail?: string;
}

export function infraError(message: string, detail?: string): ProfileError {
  return { kind: 'INFRA', message, detail };
}

export function validationError(message: string, detail?: string): ProfileError {
  return { kind: 'VALIDATION', message, detail };
}

export function domainError(message: string, detail?: string): ProfileError {
  return { kind: 'DOMAIN', message, detail };
}
