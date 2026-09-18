import { Injectable } from '@angular/core';
import { getSupabaseClientState } from '../lib/supabase.client';
import type { Profile, UpdateProfilePayload } from '../domain/profile.types';
import type { ServiceResult } from '../domain/service-result';

interface ProfileRow {
  id: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly clientState = getSupabaseClientState();

  async getMyProfile(): Promise<ServiceResult<Profile>> {
    if (!this.clientState.client) {
      return { data: null, errorMessage: this.clientState.error };
    }

    const {
      data: { user },
    } = await this.clientState.client.auth.getUser();

    if (!user) {
      return { data: null, errorMessage: 'Not authenticated' };
    }

    const { data, error } = await this.clientState.client
      .from('profile')
      .select('id, display_name, avatar_url, created_at, updated_at')
      .eq('id', user.id)
      .single();

    if (error) {
      return { data: null, errorMessage: error.message };
    }

    return { data: toProfile(data as ProfileRow), errorMessage: null };
  }

  async updateMyProfile(payload: UpdateProfilePayload): Promise<ServiceResult<Profile>> {
    if (!this.clientState.client) {
      return { data: null, errorMessage: this.clientState.error };
    }

    const {
      data: { user },
    } = await this.clientState.client.auth.getUser();

    if (!user) {
      return { data: null, errorMessage: 'Not authenticated' };
    }

    const { data, error } = await this.clientState.client
      .from('profile')
      .update({
        display_name: payload.displayName,
        avatar_url: payload.avatarUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)
      .select('id, display_name, avatar_url, created_at, updated_at')
      .single();

    if (error) {
      return { data: null, errorMessage: error.message };
    }

    return { data: toProfile(data as ProfileRow), errorMessage: null };
  }
}
