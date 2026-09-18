import { inject, Injectable } from '@angular/core';
import { ApiClient } from './api.client';
import type { Audio } from '../domain/audio.types';
import type { ServiceResult } from '../domain/service-result';

interface AudioRow {
  id: string;
  project_id: string;
  audio_url: string | null;
  voice: string;
  model: string;
  format: string;
  script: string | null;
  is_processed: boolean;
  created_at: string;
  updated_at: string;
}

interface JobAcceptedRow {
  job_id: string;
  status: string;
}

function isJobAccepted(row: unknown): row is JobAcceptedRow {
  return (
    typeof row === 'object' &&
    row !== null &&
    'job_id' in row &&
    'status' in row &&
    !('audio_url' in row)
  );
}

function toAudio(row: AudioRow): Audio {
  return {
    id: row.id,
    projectId: row.project_id,
    audioUrl: row.audio_url,
    voice: row.voice,
    model: row.model,
    format: row.format,
    script: row.script,
    isProcessed: row.is_processed,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface GenerateAudioResult {
  readonly audio: Audio | null;
  readonly jobId: string | null;
}

@Injectable({ providedIn: 'root' })
export class AudioService {
  private readonly api = inject(ApiClient);

  async getAudio(projectId: string): Promise<ServiceResult<Audio>> {
    const result = await this.api.get<AudioRow>(`/api/v1/tts/${projectId}`);

    if (result.errorMessage) {
      return { data: null, errorMessage: result.errorMessage };
    }

    return { data: toAudio(result.data!), errorMessage: null };
  }

  async generateAudio(projectId: string): Promise<ServiceResult<GenerateAudioResult>> {
    const result = await this.api.post<AudioRow | JobAcceptedRow>('/api/v1/tts/generate', {
      project_id: projectId,
    });

    if (result.errorMessage) {
      return { data: null, errorMessage: result.errorMessage };
    }

    const raw = result.data!;
    if (isJobAccepted(raw)) {
      return { data: { audio: null, jobId: raw.job_id }, errorMessage: null };
    }

    return {
      data: { audio: toAudio(raw as AudioRow), jobId: null },
      errorMessage: null,
    };
  }
}
