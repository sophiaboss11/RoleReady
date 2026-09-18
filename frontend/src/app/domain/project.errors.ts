export type ProjectErrorKind = 'INFRA' | 'VALIDATION' | 'DOMAIN';

export interface ProjectError {
  readonly kind: ProjectErrorKind;
  readonly message: string;
  readonly detail?: string;
}

export function infraError(message: string, detail?: string): ProjectError {
  return { kind: 'INFRA', message, detail };
}

export function validationError(message: string, detail?: string): ProjectError {
  return { kind: 'VALIDATION', message, detail };
}

export function domainError(message: string, detail?: string): ProjectError {
  return { kind: 'DOMAIN', message, detail };
}
