import { Injectable } from '@angular/core';
import { getSupabaseClientState } from '../lib/supabase.client';
import type {
  OrganizationMembership,
  OrganizationMember,
  Invitation,
  InvitationPreview,
  CreateInvitationPayload,
  OrganizationRole,
} from '../domain/organization.types';
import type { ServiceResult } from '../domain/service-result';

const ORGANIZATION_NAME_COLLATOR = new Intl.Collator('en', {
  numeric: true,
  sensitivity: 'base',
});

interface MembershipRow {
  id: string;
  role: OrganizationRole;
  created_at: string;
  organization: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    created_at: string;
    updated_at: string;
  };
}

interface MemberRow {
  id: string;
  user_id: string;
  role: OrganizationRole;
  created_at: string;
  display_name: string;
  avatar_url: string | null;
  email: string;
}

interface InvitationRow {
  id: string;
  email: string;
  organization_id: string;
  role: OrganizationRole;
  invited_by: string;
  token: string;
  status: string;
  expires_at: string | null;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class OrganizationService {
  private readonly clientState = getSupabaseClientState();

  async getUserMemberships(userId: string): Promise<ServiceResult<OrganizationMembership[]>> {
    if (!this.clientState.client) {
      return { data: null, errorMessage: this.clientState.error };
    }

    const { data, error } = await this.clientState.client
      .from('organization_member')
      .select(
        `
        id,
        role,
        created_at,
        organization:organization_id (
          id,
          name,
          slug,
          logo_url,
          created_at,
          updated_at
        )
      `,
      )
      .eq('user_id', userId);

    if (error) {
      return { data: null, errorMessage: error.message };
    }

    const memberships: OrganizationMembership[] = (data as unknown as MembershipRow[])
      .map((row) => ({
        membershipId: row.id,
        organization: {
          id: row.organization.id,
          name: row.organization.name,
          slug: row.organization.slug,
          logoUrl: row.organization.logo_url,
          createdAt: row.organization.created_at,
          updatedAt: row.organization.updated_at,
        },
        role: row.role,
        joinedAt: row.created_at,
      }))
      .sort(compareOrganizationMembershipByName);

    return { data: memberships, errorMessage: null };
  }

  async getOrganizationMembers(orgId: string): Promise<ServiceResult<OrganizationMember[]>> {
    if (!this.clientState.client) {
      return { data: null, errorMessage: this.clientState.error };
    }

    const { data, error } = await this.clientState.client.rpc('get_organization_members', {
      target_org_id: orgId,
    });

    if (error) {
      return { data: null, errorMessage: error.message };
    }

    const members: OrganizationMember[] = (data as MemberRow[]).map((row) => ({
      membershipId: row.id,
      userId: row.user_id,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      email: row.email,
      role: row.role,
      joinedAt: row.created_at,
    }));

    return { data: members, errorMessage: null };
  }

  async getOrganizationInvitations(orgId: string): Promise<ServiceResult<Invitation[]>> {
    if (!this.clientState.client) {
      return { data: null, errorMessage: this.clientState.error };
    }

    const { data, error } = await this.clientState.client
      .from('invitation')
      .select('id, email, organization_id, role, invited_by, token, status, expires_at, created_at')
      .eq('organization_id', orgId)
      .eq('status', 'pending');

    if (error) {
      return { data: null, errorMessage: error.message };
    }

    const invitations: Invitation[] = (data as InvitationRow[]).map((row) => ({
      id: row.id,
      email: row.email,
      organizationId: row.organization_id,
      role: row.role as OrganizationRole,
      invitedBy: row.invited_by,
      token: row.token,
      status: row.status as Invitation['status'],
      expiresAt: row.expires_at ?? '',
      createdAt: row.created_at,
    }));

    return { data: invitations, errorMessage: null };
  }

  async createInvitation(payload: CreateInvitationPayload): Promise<ServiceResult<Invitation>> {
    if (!this.clientState.client) {
      return { data: null, errorMessage: this.clientState.error };
    }

    const { data, error } = await this.clientState.client
      .from('invitation')
      .insert({
        email: payload.email,
        organization_id: payload.organizationId,
        role: payload.role,
        invited_by: payload.invitedBy,
      })
      .select('id, email, organization_id, role, invited_by, token, status, expires_at, created_at')
      .single();

    if (error) {
      return { data: null, errorMessage: error.message };
    }

    const row = data as InvitationRow;
    return {
      data: {
        id: row.id,
        email: row.email,
        organizationId: row.organization_id,
        role: row.role as OrganizationRole,
        invitedBy: row.invited_by,
        token: row.token,
        status: row.status as Invitation['status'],
        expiresAt: row.expires_at ?? '',
        createdAt: row.created_at,
      },
      errorMessage: null,
    };
  }

  async revokeInvitation(invitationId: string): Promise<ServiceResult<null>> {
    if (!this.clientState.client) {
      return { data: null, errorMessage: this.clientState.error };
    }

    const { error } = await this.clientState.client
      .from('invitation')
      .delete()
      .eq('id', invitationId);

    if (error) {
      return { data: null, errorMessage: error.message };
    }

    return { data: null, errorMessage: null };
  }

  async acceptPendingInvitations(): Promise<ServiceResult<number>> {
    if (!this.clientState.client) {
      return { data: null, errorMessage: this.clientState.error };
    }

    const { data, error } = await this.clientState.client.rpc('accept_pending_invitations');

    if (error) {
      return { data: null, errorMessage: error.message };
    }

    return { data: (data as number) ?? 0, errorMessage: null };
  }

  async removeMember(membershipId: string): Promise<ServiceResult<null>> {
    if (!this.clientState.client) {
      return { data: null, errorMessage: this.clientState.error };
    }

    const { error } = await this.clientState.client
      .from('organization_member')
      .delete()
      .eq('id', membershipId);

    if (error) {
      return { data: null, errorMessage: error.message };
    }

    return { data: null, errorMessage: null };
  }

  async getInvitationByToken(token: string): Promise<ServiceResult<InvitationPreview>> {
    if (!this.clientState.client) {
      return { data: null, errorMessage: this.clientState.error };
    }

    const { data, error } = await this.clientState.client.rpc('get_invitation_by_token', {
      invite_token: token,
    });

    if (error) {
      return { data: null, errorMessage: error.message };
    }

    if (!data) {
      return { data: null, errorMessage: 'Invitation not found' };
    }

    const row = data as {
      organization_name: string;
      organization_logo_url: string | null;
      role: string;
      email: string;
      status: string;
      expires_at: string | null;
    };

    return {
      data: {
        organizationName: row.organization_name,
        organizationLogoUrl: row.organization_logo_url,
        role: row.role as InvitationPreview['role'],
        email: row.email,
        status: row.status as InvitationPreview['status'],
        expiresAt: row.expires_at,
      },
      errorMessage: null,
    };
  }
}

export function compareOrganizationMembershipByName(
  left: OrganizationMembership,
  right: OrganizationMembership,
): number {
  const nameComparison = ORGANIZATION_NAME_COLLATOR.compare(
    left.organization.name,
    right.organization.name,
  );
  if (nameComparison !== 0) return nameComparison;

  const slugComparison = ORGANIZATION_NAME_COLLATOR.compare(
    left.organization.slug,
    right.organization.slug,
  );
  if (slugComparison !== 0) return slugComparison;

  return left.organization.id.localeCompare(right.organization.id);
}
