import type { OrganizationRole } from '../domain/organization.types';

const DASHBOARD_ROLE_LABELS: Readonly<Record<OrganizationRole, string>> = {
  admin: 'Manager',
  member: 'Intern',
};

export function getDashboardRoleLabel(role: OrganizationRole | null): string {
  if (!role) return 'User';
  return DASHBOARD_ROLE_LABELS[role];
}

export function getDashboardWelcomeIdentity(
  role: OrganizationRole | null,
  displayName: string | null | undefined,
  email: string | null | undefined,
): string {
  const resolvedName = resolvePreferredUserName(displayName, email);
  const roleLabel = getDashboardRoleLabel(role);

  return resolvedName ? `${roleLabel} ${resolvedName}` : roleLabel;
}

function resolvePreferredUserName(
  displayName: string | null | undefined,
  email: string | null | undefined,
): string | null {
  const normalizedDisplayName = normalizeValue(displayName);
  if (normalizedDisplayName) return normalizedDisplayName;

  const normalizedEmail = normalizeValue(email);
  if (!normalizedEmail) return null;

  return normalizeValue(normalizedEmail.split('@')[0] ?? null);
}

function normalizeValue(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : null;
}
