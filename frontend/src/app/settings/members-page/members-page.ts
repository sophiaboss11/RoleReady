import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCheck,
  lucideCircleAlert,
  lucideCopy,
  lucideLoader,
  lucideTrash2,
  lucideUserPlus,
  lucideX,
} from '@ng-icons/lucide';
import { BrnSelectImports } from '@spartan-ng/brain/select';
import { HlmAlertDialogImports } from '@app/ui/alert-dialog';
import { HlmAlertImports } from '@app/ui/alert';
import { HlmAvatarImports } from '@app/ui/avatar';
import { HlmBadgeImports } from '@app/ui/badge';
import { HlmButtonImports } from '@app/ui/button';
import { HlmCardImports } from '@app/ui/card';
import { HlmFormFieldImports } from '@app/ui/form-field';
import { HlmIconImports } from '@app/ui/icon';
import { HlmInputImports } from '@app/ui/input';
import { HlmLabelImports } from '@app/ui/label';
import { HlmSelectImports } from '@app/ui/select';
import { HlmSkeletonImports } from '@app/ui/skeleton';
import { HlmSpinnerImports } from '@app/ui/spinner';
import { HlmTableImports } from '@app/ui/table';
import { AuthFacade } from '../../services/auth.facade';
import { OrganizationFacade } from '../../services/organization.facade';
import type { OrganizationRole } from '../../domain/organization.types';

@Component({
  selector: 'app-members-page',
  imports: [
    FormsModule,
    NgIcon,
    BrnSelectImports,
    HlmAlertDialogImports,
    HlmAlertImports,
    HlmAvatarImports,
    HlmBadgeImports,
    HlmButtonImports,
    HlmCardImports,
    HlmFormFieldImports,
    HlmIconImports,
    HlmInputImports,
    HlmLabelImports,
    HlmSelectImports,
    HlmSkeletonImports,
    HlmSpinnerImports,
    HlmTableImports,
  ],
  providers: [
    provideIcons({
      lucideCheck,
      lucideCircleAlert,
      lucideCopy,
      lucideLoader,
      lucideTrash2,
      lucideUserPlus,
      lucideX,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-4xl space-y-8">
      <header>
        <h1 class="text-2xl font-bold tracking-tight">Members</h1>
        <p class="text-sm text-muted-foreground">
          Manage your organization members and invitations.
        </p>
      </header>

      <!-- Invite Form -->
      <section hlmCard>
        <div hlmCardHeader>
          <h2 hlmCardTitle>Invite a new member</h2>
          <p hlmCardDescription>Send an invitation by email address.</p>
        </div>
        <div hlmCardContent>
          @if (inviteError()) {
            <div hlmAlert variant="destructive" class="mb-4">
              <ng-icon hlm hlmAlertIcon name="lucideCircleAlert" />
              <p hlmAlertDescription>{{ inviteError() }}</p>
            </div>
          }
          <form #inviteForm="ngForm" class="flex items-end gap-3" (ngSubmit)="onInvite()">
            <hlm-form-field class="flex-1">
              <label hlmLabel for="invite-email">Email</label>
              <input
                hlmInput
                id="invite-email"
                type="email"
                placeholder="colleague@example.com"
                required
                [(ngModel)]="inviteEmail"
                name="email"
                class="w-full"
              />
              <hlm-error>Valid email is required</hlm-error>
              <hlm-hint>&nbsp;</hlm-hint>
            </hlm-form-field>
            <div class="space-y-2 pb-7">
              <label hlmLabel for="invite-role">Role</label>
              <hlm-select id="invite-role" [(ngModel)]="inviteRole" name="role">
                <hlm-select-trigger class="w-32">
                  <hlm-select-value />
                </hlm-select-trigger>
                <hlm-select-content>
                  <hlm-option value="member">Member</hlm-option>
                  <hlm-option value="admin">Admin</hlm-option>
                </hlm-select-content>
              </hlm-select>
            </div>
            <div class="pb-7">
              <button hlmBtn type="submit" [disabled]="inviteForm.invalid || inviteSending()">
                @if (inviteSending()) {
                  <hlm-spinner class="text-sm" />
                  Sending...
                } @else {
                  <ng-icon name="lucideUserPlus" />
                  Invite
                }
              </button>
            </div>
          </form>
        </div>
      </section>

      <!-- Members Table -->
      <section hlmCard>
        <div hlmCardHeader>
          <h2 hlmCardTitle>Members</h2>
          <p hlmCardDescription>Current members of this organization.</p>
        </div>
        <div hlmCardContent>
          @if (orgFacade.membersLoading()) {
            <div class="space-y-4" role="status" aria-label="Loading members">
              @for (_ of skeletonRows; track $index) {
                <div class="flex items-center gap-3">
                  <hlm-skeleton class="size-8 rounded-full" />
                  <hlm-skeleton class="h-4 w-32" />
                  <hlm-skeleton class="h-4 w-40" />
                  <hlm-skeleton class="h-5 w-16 rounded-full" />
                </div>
              }
            </div>
          } @else if (orgFacade.members().length === 0) {
            <p class="py-4 text-sm text-muted-foreground">No members found.</p>
          } @else {
            <div hlmTableContainer>
              <table hlmTable>
                <thead hlmTHead>
                  <tr hlmTr>
                    <th hlmTh>Member</th>
                    <th hlmTh>Email</th>
                    <th hlmTh>Role</th>
                    <th hlmTh class="w-16"><span class="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody hlmTBody>
                  @for (member of orgFacade.members(); track member.membershipId) {
                    <tr hlmTr>
                      <td hlmTd>
                        <div class="flex items-center gap-3">
                          <hlm-avatar class="size-8">
                            <img
                              [src]="member.avatarUrl ?? ''"
                              [alt]="member.displayName"
                              hlmAvatarImage
                            />
                            <span class="bg-muted text-xs" hlmAvatarFallback>
                              {{ member.displayName.charAt(0).toUpperCase() }}
                            </span>
                          </hlm-avatar>
                          <span class="font-medium">{{ member.displayName }}</span>
                        </div>
                      </td>
                      <td hlmTd class="text-muted-foreground">{{ member.email }}</td>
                      <td hlmTd>
                        <span
                          hlmBadge
                          [variant]="member.role === 'admin' ? 'default' : 'secondary'"
                        >
                          {{ member.role }}
                        </span>
                      </td>
                      <td hlmTd>
                        @if (!isSelf(member.userId)) {
                          <hlm-alert-dialog>
                            <button
                              hlmAlertDialogTrigger
                              hlmBtn
                              variant="ghost"
                              size="icon-sm"
                              [attr.aria-label]="'Remove ' + member.displayName"
                            >
                              <ng-icon name="lucideTrash2" class="text-destructive" />
                            </button>
                            <hlm-alert-dialog-content *hlmAlertDialogPortal="let ctx">
                              <hlm-alert-dialog-header>
                                <h3 hlmAlertDialogTitle>Remove member</h3>
                                <p hlmAlertDialogDescription>
                                  Are you sure you want to remove {{ member.displayName }} from this
                                  organization? This action cannot be undone.
                                </p>
                              </hlm-alert-dialog-header>
                              <hlm-alert-dialog-footer>
                                <button hlmAlertDialogCancel (click)="ctx.close()">Cancel</button>
                                <button
                                  hlmAlertDialogAction
                                  variant="destructive"
                                  (click)="onRemoveMember(member.membershipId); ctx.close()"
                                >
                                  Remove
                                </button>
                              </hlm-alert-dialog-footer>
                            </hlm-alert-dialog-content>
                          </hlm-alert-dialog>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>
      </section>

      <!-- Pending Invitations -->
      <section hlmCard>
        <div hlmCardHeader>
          <h2 hlmCardTitle>Pending invitations</h2>
          <p hlmCardDescription>Invitations that have not been accepted yet.</p>
        </div>
        <div hlmCardContent>
          @if (orgFacade.invitationsLoading()) {
            <div class="space-y-4" role="status" aria-label="Loading invitations">
              @for (_ of skeletonRows; track $index) {
                <div class="flex items-center gap-3">
                  <hlm-skeleton class="h-4 w-48" />
                  <hlm-skeleton class="h-5 w-16 rounded-full" />
                  <hlm-skeleton class="h-4 w-24" />
                </div>
              }
            </div>
          } @else if (orgFacade.invitations().length === 0) {
            <p class="py-4 text-sm text-muted-foreground">No pending invitations.</p>
          } @else {
            <div hlmTableContainer>
              <table hlmTable>
                <thead hlmTHead>
                  <tr hlmTr>
                    <th hlmTh>Email</th>
                    <th hlmTh>Role</th>
                    <th hlmTh>Invite link</th>
                    <th hlmTh class="w-16"><span class="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody hlmTBody>
                  @for (invitation of orgFacade.invitations(); track invitation.id) {
                    <tr hlmTr>
                      <td hlmTd class="font-medium">{{ invitation.email }}</td>
                      <td hlmTd>
                        <span
                          hlmBadge
                          [variant]="invitation.role === 'admin' ? 'default' : 'secondary'"
                        >
                          {{ invitation.role }}
                        </span>
                      </td>
                      <td hlmTd>
                        <button
                          hlmBtn
                          variant="ghost"
                          size="sm"
                          type="button"
                          (click)="onCopyInviteLink(invitation.token)"
                          aria-label="Copy invite link"
                        >
                          <ng-icon
                            [name]="
                              copiedToken() === invitation.token ? 'lucideCheck' : 'lucideCopy'
                            "
                          />
                          {{ copiedToken() === invitation.token ? 'Copied' : 'Copy link' }}
                        </button>
                      </td>
                      <td hlmTd>
                        <hlm-alert-dialog>
                          <button
                            hlmAlertDialogTrigger
                            hlmBtn
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Revoke invitation"
                          >
                            <ng-icon name="lucideX" class="text-destructive" />
                          </button>
                          <hlm-alert-dialog-content *hlmAlertDialogPortal="let ctx">
                            <hlm-alert-dialog-header>
                              <h3 hlmAlertDialogTitle>Revoke invitation</h3>
                              <p hlmAlertDialogDescription>
                                Are you sure you want to revoke the invitation for
                                {{ invitation.email }}?
                              </p>
                            </hlm-alert-dialog-header>
                            <hlm-alert-dialog-footer>
                              <button hlmAlertDialogCancel (click)="ctx.close()">Cancel</button>
                              <button
                                hlmAlertDialogAction
                                variant="destructive"
                                (click)="onRevokeInvitation(invitation.id); ctx.close()"
                              >
                                Revoke
                              </button>
                            </hlm-alert-dialog-footer>
                          </hlm-alert-dialog-content>
                        </hlm-alert-dialog>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>
      </section>
    </div>
  `,
})
export class MembersPage implements OnInit {
  protected readonly orgFacade = inject(OrganizationFacade);
  private readonly authFacade = inject(AuthFacade);

  private readonly inviteForm = viewChild<NgForm>('inviteForm');

  protected inviteEmail = '';
  protected inviteRole: OrganizationRole = 'member';
  protected readonly inviteSending = signal(false);
  protected readonly inviteError = signal<string | null>(null);
  protected readonly copiedToken = signal<string | null>(null);

  protected readonly skeletonRows = Array.from({ length: 3 });

  private readonly currentUserId = this.authFacade.user()?.id ?? '';

  async ngOnInit(): Promise<void> {
    const membersError = await this.orgFacade.loadMembers();
    if (membersError) {
      console.error('[MembersPage] loadMembers failed:', membersError);
    }
    const invitationsError = await this.orgFacade.loadInvitations();
    if (invitationsError) {
      console.error('[MembersPage] loadInvitations failed:', invitationsError);
    }
  }

  protected isSelf(userId: string): boolean {
    return userId === this.currentUserId;
  }

  protected async onInvite(): Promise<void> {
    this.inviteError.set(null);

    const orgId = this.orgFacade.activeOrgId();
    if (!orgId) return;

    this.inviteSending.set(true);
    const error = await this.orgFacade.sendInvitation({
      email: this.inviteEmail.trim(),
      organizationId: orgId,
      role: this.inviteRole,
      invitedBy: this.currentUserId,
    });
    this.inviteSending.set(false);

    if (error) {
      this.inviteError.set(error.message);
      return;
    }

    this.inviteForm()?.resetForm({ email: '', role: 'member' });
    this.inviteEmail = '';
    this.inviteRole = 'member';
  }

  protected async onCopyInviteLink(token: string): Promise<void> {
    const url = `${window.location.origin}/invite?token=${token}`;
    await navigator.clipboard.writeText(url);
    this.copiedToken.set(token);
    setTimeout(() => this.copiedToken.set(null), 2000);
  }

  protected async onRemoveMember(membershipId: string): Promise<void> {
    await this.orgFacade.removeMember(membershipId);
  }

  protected async onRevokeInvitation(invitationId: string): Promise<void> {
    await this.orgFacade.revokeInvitation(invitationId);
  }
}
