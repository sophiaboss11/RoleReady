import { inject, Injectable, computed, signal } from '@angular/core';
import { OrganizationService } from './organization.service';
import { AuthFacade } from './auth.facade';
import type {
  OrganizationMembership,
  OrganizationMember,
  Invitation,
  CreateInvitationPayload,
} from '../domain/organization.types';
import { infraError, type OrganizationError } from '../domain/organization.errors';

const ACTIVE_ORG_STORAGE_KEY = 'activeOrganizationId';

@Injectable({ providedIn: 'root' })
export class OrganizationFacade {
  private readonly orgService = inject(OrganizationService);
  private readonly authFacade = inject(AuthFacade);

  readonly isLoading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly memberships = signal<OrganizationMembership[]>([]);
  readonly activeOrgId = signal<string | null>(null);

  readonly activeMembership = computed(() => {
    const orgId = this.activeOrgId();
    if (!orgId) return null;
    return this.memberships().find((m) => m.organization.id === orgId) ?? null;
  });

  readonly activeOrganization = computed(() => this.activeMembership()?.organization ?? null);
  readonly activeRole = computed(() => this.activeMembership()?.role ?? null);
  readonly isAdmin = computed(() => this.activeRole() === 'admin');
  readonly hasOrganizations = computed(() => this.memberships().length > 0);

  readonly activeOrgSlug = computed(() => this.activeOrganization()?.slug ?? null);

  readonly defaultOrgSlug = computed(() => {
    const list = this.memberships();
    if (list.length === 0) return null;
    const stored = localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
    const match = stored ? list.find((m) => m.organization.id === stored) : null;
    return (match ?? list[0]).organization.slug;
  });

  readonly members = signal<OrganizationMember[]>([]);
  readonly invitations = signal<Invitation[]>([]);
  readonly membersLoading = signal(false);
  readonly invitationsLoading = signal(false);

  private initPromise: Promise<void> | null = null;

  async ensureInitialized(): Promise<void> {
    this.initPromise ??= this.performInitialization();
    return this.initPromise;
  }

  setActiveOrganization(orgId: string): void {
    const exists = this.memberships().some((m) => m.organization.id === orgId);
    if (!exists) return;

    this.activeOrgId.set(orgId);
    localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, orgId);
  }

  setActiveOrganizationBySlug(slug: string): boolean {
    const membership = this.memberships().find((m) => m.organization.slug === slug);
    if (!membership) return false;
    this.activeOrgId.set(membership.organization.id);
    localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, membership.organization.id);
    return true;
  }

  clearState(): void {
    this.memberships.set([]);
    this.activeOrgId.set(null);
    this.members.set([]);
    this.invitations.set([]);
    this.errorMessage.set(null);
    this.initPromise = null;
    localStorage.removeItem(ACTIVE_ORG_STORAGE_KEY);
  }

  async loadMembers(): Promise<OrganizationError | null> {
    const orgId = this.activeOrgId();
    if (!orgId) return infraError('No active organization');

    this.membersLoading.set(true);
    const { data, errorMessage } = await this.orgService.getOrganizationMembers(orgId);
    this.membersLoading.set(false);

    if (errorMessage) {
      return infraError(errorMessage);
    }

    this.members.set(data ?? []);
    return null;
  }

  async loadInvitations(): Promise<OrganizationError | null> {
    const orgId = this.activeOrgId();
    if (!orgId) return infraError('No active organization');

    this.invitationsLoading.set(true);
    const { data, errorMessage } = await this.orgService.getOrganizationInvitations(orgId);
    this.invitationsLoading.set(false);

    if (errorMessage) {
      return infraError(errorMessage);
    }

    this.invitations.set(data ?? []);
    return null;
  }

  async sendInvitation(payload: CreateInvitationPayload): Promise<OrganizationError | null> {
    const { errorMessage } = await this.orgService.createInvitation(payload);

    if (errorMessage) {
      return infraError(errorMessage);
    }

    await this.loadInvitations();
    return null;
  }

  async revokeInvitation(invitationId: string): Promise<OrganizationError | null> {
    const { errorMessage } = await this.orgService.revokeInvitation(invitationId);

    if (errorMessage) {
      return infraError(errorMessage);
    }

    this.invitations.update((list) => list.filter((inv) => inv.id !== invitationId));
    return null;
  }

  async removeMember(membershipId: string): Promise<OrganizationError | null> {
    const { errorMessage } = await this.orgService.removeMember(membershipId);

    if (errorMessage) {
      return infraError(errorMessage);
    }

    this.members.update((list) => list.filter((m) => m.membershipId !== membershipId));
    return null;
  }

  private async performInitialization(): Promise<void> {
    const user = this.authFacade.user();
    if (!user) {
      this.isLoading.set(false);
      return;
    }

    await this.orgService.acceptPendingInvitations();

    const { data, errorMessage } = await this.orgService.getUserMemberships(user.id);

    if (errorMessage) {
      this.errorMessage.set(errorMessage);
      this.isLoading.set(false);
      return;
    }

    this.memberships.set(data ?? []);
    this.restoreActiveOrganization();
    this.isLoading.set(false);
  }

  private restoreActiveOrganization(): void {
    const stored = localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
    const list = this.memberships();

    if (list.length === 0) return;

    const match = stored ? list.find((m) => m.organization.id === stored) : null;
    const selected = match ?? list[0];

    this.activeOrgId.set(selected.organization.id);
    localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, selected.organization.id);
  }
}
