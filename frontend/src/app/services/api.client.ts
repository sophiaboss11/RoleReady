import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { getSupabaseClientState } from '../lib/supabase.client';
import type { ServiceResult } from '../domain/service-result';

@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);
  private readonly clientState = getSupabaseClientState();

  async post<T>(path: string, body: unknown): Promise<ServiceResult<T>> {
    const headers = await this.buildHeaders('application/json');
    if (!headers) {
      return { data: null, errorMessage: 'Not authenticated' };
    }

    try {
      const data = await firstValueFrom(
        this.http.post<T>(`${environment.apiBaseUrl}${path}`, body, { headers }),
      );
      return { data, errorMessage: null };
    } catch (error) {
      return { data: null, errorMessage: extractErrorMessage(error) };
    }
  }

  async postFormData<T>(path: string, body: FormData): Promise<ServiceResult<T>> {
    const headers = await this.buildHeaders(null);
    if (!headers) {
      return { data: null, errorMessage: 'Not authenticated' };
    }

    try {
      const data = await firstValueFrom(
        this.http.post<T>(`${environment.apiBaseUrl}${path}`, body, { headers }),
      );
      return { data, errorMessage: null };
    } catch (error) {
      return { data: null, errorMessage: extractErrorMessage(error) };
    }
  }

  async get<T>(path: string): Promise<ServiceResult<T>> {
    const headers = await this.buildHeaders();
    if (!headers) {
      return { data: null, errorMessage: 'Not authenticated' };
    }

    try {
      const data = await firstValueFrom(
        this.http.get<T>(`${environment.apiBaseUrl}${path}`, { headers }),
      );
      return { data, errorMessage: null };
    } catch (error) {
      return { data: null, errorMessage: extractErrorMessage(error) };
    }
  }

  async put<T>(path: string, body: unknown): Promise<ServiceResult<T>> {
    const headers = await this.buildHeaders('application/json');
    if (!headers) {
      return { data: null, errorMessage: 'Not authenticated' };
    }

    try {
      const data = await firstValueFrom(
        this.http.put<T>(`${environment.apiBaseUrl}${path}`, body, { headers }),
      );
      return { data, errorMessage: null };
    } catch (error) {
      return { data: null, errorMessage: extractErrorMessage(error) };
    }
  }

  async delete<T>(path: string): Promise<ServiceResult<T>> {
    const headers = await this.buildHeaders('application/json');
    if (!headers) {
      return { data: null, errorMessage: 'Not authenticated' };
    }

    try {
      const data = await firstValueFrom(
        this.http.delete<T>(`${environment.apiBaseUrl}${path}`, { headers }),
      );
      return { data, errorMessage: null };
    } catch (error) {
      return { data: null, errorMessage: extractErrorMessage(error) };
    }
  }

  private async buildHeaders(contentType: string | null = 'application/json'): Promise<HttpHeaders | null> {
    if (!this.clientState.client) return null;

    const {
      data: { session },
    } = await this.clientState.client.auth.getSession();

    if (!session) return null;

    let headers = new HttpHeaders({
      Authorization: `Bearer ${session.access_token}`,
    });

    if (contentType) {
       headers = headers.set('Content-Type', contentType);
    }

    return headers;
  }
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const detail = error.error?.detail;
    if (typeof detail === 'string') return detail;
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return 'Unknown API error';
}
