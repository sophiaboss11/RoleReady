import { inject, Injectable, computed, signal } from '@angular/core';
import { ProfileService } from './profile.service';
import type { Profile, UpdateProfilePayload } from '../domain/profile.types';
import { infraError, validationError, type ProfileError } from '../domain/profile.errors';

@Injectable({ providedIn: 'root' })
export class ProfileFacade {
  private readonly profileService = inject(ProfileService);

  readonly profile = signal<Profile | null>(null);
  readonly isLoading = signal(false);
  readonly isSaving = signal(false);

  readonly displayName = computed(() => this.profile()?.displayName ?? 'User');
  readonly avatarUrl = computed(() => this.profile()?.avatarUrl ?? null);

  private initPromise: Promise<void> | null = null;

  async ensureInitialized(): Promise<void> {
    this.initPromise ??= this.performInitialization();
    return this.initPromise;
  }

  async updateProfile(payload: UpdateProfilePayload): Promise<ProfileError | null> {
    if (!payload.displayName.trim()) {
      return validationError('Display name is required');
    }

    this.isSaving.set(true);
    const { data, errorMessage } = await this.profileService.updateMyProfile(payload);
    this.isSaving.set(false);

    if (errorMessage) {
      return infraError(errorMessage);
    }

    if (data) {
      this.profile.set(data);
    }

    return null;
  }

  private async performInitialization(): Promise<void> {
    this.isLoading.set(true);
    const { data, errorMessage } = await this.profileService.getMyProfile();
    this.isLoading.set(false);

    if (errorMessage) {
      console.error('[ProfileFacade] initialization failed:', errorMessage);
      return;
    }

    this.profile.set(data);
  }
}
