export type OrganizationErrorKind = 'INFRA' | 'VALIDATION' | 'DOMAIN' | 'EXTERNAL';

export interface OrganizationError {
  readonly kind: OrganizationErrorKind;
  readonly message: string;
  readonly detail?: string;
}

export function infraError(message: string, detail?: string): OrganizationError {
  return { kind: 'INFRA', message, detail };
}

export function validationError(message: string, detail?: string): OrganizationError {
  return { kind: 'VALIDATION', message, detail };
}

export function domainError(message: string, detail?: string): OrganizationError {
  return { kind: 'DOMAIN', message, detail };
}
