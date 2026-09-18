import { Injectable, OnDestroy } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClientState } from '../lib/supabase.client';
import { isJobStatus, isJobType, type JobStatus, type JobType } from '../domain/ingestion.types';

interface JobChangePayload {
  readonly id: string;
  readonly projectId: string;
  readonly userId: string;
  readonly jobType: JobType;
  readonly status: JobStatus;
  readonly errorMessage: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface JobRow {
  id: string;
  project_id: string;
  user_id: string;
  job_type: string;
  status: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

function toJobChangePayload(row: JobRow): JobChangePayload | null {
  if (!isJobType(row.job_type) || !isJobStatus(row.status)) {
    return null;
  }
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    jobType: row.job_type,
    status: row.status,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type JobChangeCallback = (payload: JobChangePayload) => void;

@Injectable()
export class JobRealtimeService implements OnDestroy {
  private channel: RealtimeChannel | null = null;
  private connectedProjectId: string | null = null;
  private listeners = new Map<JobType, Set<JobChangeCallback>>();

  connect(projectId: string): void {
    if (this.channel && this.connectedProjectId === projectId) {
      return;
    }
    this.disconnect();

    const { client } = getSupabaseClientState();
    if (!client) return;

    this.channel = client
      .channel(`job-changes:${projectId}`)
      .on<JobRow>(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'RoleReady',
          table: 'job',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          const mapped = toJobChangePayload(payload.new);
          if (!mapped) return;

          const callbacks = this.listeners.get(mapped.jobType);
          if (!callbacks) return;

          for (const cb of callbacks) {
            cb(mapped);
          }
        },
      )
      .subscribe();
    this.connectedProjectId = projectId;
  }

  onJobChange(jobType: JobType, callback: JobChangeCallback): () => void {
    let set = this.listeners.get(jobType);
    if (!set) {
      set = new Set();
      this.listeners.set(jobType, set);
    }
    set.add(callback);

    return () => {
      set!.delete(callback);
      if (set!.size === 0) {
        this.listeners.delete(jobType);
      }
    };
  }

  disconnect(): void {
    if (this.channel) {
      this.channel.unsubscribe();
      this.channel = null;
    }
    this.connectedProjectId = null;
    this.listeners.clear();
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}
