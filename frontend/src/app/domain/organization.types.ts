export interface Organization {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly logoUrl: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type OrganizationRole = 'admin' | 'member';

export interface OrganizationMembership {
  readonly membershipId: string;
  readonly organization: Organization;
  readonly role: OrganizationRole;
  readonly joinedAt: string;
}

export interface OrganizationMember {
  readonly membershipId: string;
  readonly userId: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly email: string;
  readonly role: OrganizationRole;
  readonly joinedAt: string;
}

export type InvitationStatus = 'pending' | 'accepted' | 'expired';

export interface Invitation {
  readonly id: string;
  readonly email: string;
  readonly organizationId: string;
  readonly role: OrganizationRole;
  readonly invitedBy: string;
  readonly token: string;
  readonly status: InvitationStatus;
  readonly expiresAt: string;
  readonly createdAt: string;
}

export interface InvitationPreview {
  readonly organizationName: string;
  readonly organizationLogoUrl: string | null;
  readonly role: OrganizationRole;
  readonly email: string;
  readonly status: InvitationStatus;
  readonly expiresAt: string | null;
}

export interface CreateInvitationPayload {
  readonly email: string;
  readonly organizationId: string;
  readonly role: OrganizationRole;
  readonly invitedBy: string;
}
