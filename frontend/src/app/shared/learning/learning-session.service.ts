import { inject, Injectable } from '@angular/core';
import { ApiClient } from '../../services/api.client';
import type { ServiceResult } from '../../domain/service-result';

export type SessionStatus = 'active' | 'paused' | 'completed' | 'abandoned';

export type LearningEventType =
  | 'session_start'
  | 'session_end'
  | 'session_pause'
  | 'session_resume'
  | 'step_open'
  | 'step_complete'
  | 'play'
  | 'pause'
  | 'seek'
  | 'playback_end'
  | 'heartbeat'
  | 'answer_submit'
  | 'quiz_complete'
  | 'lesson_complete'
  | 'training_complete';

export interface LearningSession {
  readonly id: string;
  readonly userId: string;
  readonly trainingId: string;
  readonly lessonId: string | null;
  readonly stepId: string | null;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly durationSeconds: number | null;
  readonly status: SessionStatus;
}

export interface LearningEvent {
  readonly id: string;
  readonly sessionId: string;
  readonly userId: string;
  readonly eventType: LearningEventType;
  readonly stepId: string | null;
  readonly payload: Record<string, unknown>;
  readonly createdAt: string;
}

interface SessionRow {
  id: string;
  user_id: string;
  training_id: string;
  lesson_id: string | null;
  step_id: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  status: string;
}

interface EventRow {
  id: string;
  session_id: string;
  user_id: string;
  event_type: string;
  step_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

function toSession(row: SessionRow): LearningSession {
  return {
    id: row.id,
    userId: row.user_id,
    trainingId: row.training_id,
    lessonId: row.lesson_id,
    stepId: row.step_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationSeconds: row.duration_seconds,
    status: row.status as SessionStatus,
  };
}

function toEvent(row: EventRow): LearningEvent {
  return {
    id: row.id,
    sessionId: row.session_id,
    userId: row.user_id,
    eventType: row.event_type as LearningEventType,
    stepId: row.step_id,
    payload: row.payload,
    createdAt: row.created_at,
  };
}

function mapResult<TRow, TDomain>(
  result: ServiceResult<TRow>,
  mapper: (row: TRow) => TDomain,
): ServiceResult<TDomain> {
  if (result.errorMessage) {
    return { data: null, errorMessage: result.errorMessage };
  }
  if (result.data === null) {
    return { data: null, errorMessage: 'Engagement API returned no data' };
  }
  return { data: mapper(result.data), errorMessage: null };
}

@Injectable({ providedIn: 'root' })
export class LearningSessionService {
  private readonly api = inject(ApiClient);

  async startSession(
    trainingId: string,
    lessonId?: string,
    stepId?: string,
  ): Promise<ServiceResult<LearningSession>> {
    return mapResult(
      await this.api.post<SessionRow>('/api/v1/engagement/sessions', {
        training_id: trainingId,
        lesson_id: lessonId ?? null,
        step_id: stepId ?? null,
      }),
      toSession,
    );
  }

  async endSession(sessionId: string): Promise<ServiceResult<LearningSession>> {
    return mapResult(
      await this.api.post<SessionRow>(`/api/v1/engagement/sessions/${sessionId}/end`, {}),
      toSession,
    );
  }

  async getActiveSession(trainingId: string): Promise<ServiceResult<LearningSession | null>> {
    const result = await this.api.get<SessionRow | null>(
      `/api/v1/engagement/sessions/active?training_id=${encodeURIComponent(trainingId)}`,
    );
    if (result.errorMessage) {
      return { data: null, errorMessage: result.errorMessage };
    }
    return { data: result.data ? toSession(result.data) : null, errorMessage: null };
  }

  async recordEvent(
    sessionId: string,
    eventType: LearningEventType,
    stepId?: string,
    payload?: Record<string, unknown>,
  ): Promise<ServiceResult<LearningEvent>> {
    return mapResult(
      await this.api.post<EventRow>('/api/v1/engagement/events', {
        session_id: sessionId,
        event_type: eventType,
        step_id: stepId ?? null,
        payload: payload ?? {},
      }),
      toEvent,
    );
  }

  async recordEventsBatch(
    events: readonly {
      sessionId: string;
      eventType: LearningEventType;
      stepId?: string;
      payload?: Record<string, unknown>;
    }[],
  ): Promise<ServiceResult<LearningEvent[]>> {
    const result = await this.api.post<EventRow[]>('/api/v1/engagement/events/batch', {
      events: events.map((e) => ({
        session_id: e.sessionId,
        event_type: e.eventType,
        step_id: e.stepId ?? null,
        payload: e.payload ?? {},
      })),
    });
    if (result.errorMessage) {
      return { data: null, errorMessage: result.errorMessage };
    }
    return { data: (result.data ?? []).map(toEvent), errorMessage: null };
  }
}
