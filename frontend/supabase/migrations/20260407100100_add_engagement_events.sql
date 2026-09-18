-- =============================================================
-- Engagement Event Foundation: immutable event log for learning
-- activities, session tracking, and quiz attempts.
--
-- New tables (all in "RoleReady" schema):
--   learning_session  – session-level grouping of user activity
--   learning_event    – immutable event log (append-only)
--   step_attempt      – quiz/exercise attempt with scoring
-- =============================================================

BEGIN;

-- =============================================================
-- 1. learning_session
-- =============================================================
CREATE TABLE "RoleReady".learning_session (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    training_id     uuid        NOT NULL REFERENCES "RoleReady".training(id) ON DELETE CASCADE,
    lesson_id       uuid        REFERENCES "RoleReady".training_lesson(id) ON DELETE SET NULL,
    step_id         uuid        REFERENCES "RoleReady".lesson_step(id) ON DELETE SET NULL,
    started_at      timestamptz NOT NULL DEFAULT now(),
    ended_at        timestamptz,
    duration_seconds integer,
    status          text        NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active', 'paused', 'completed', 'abandoned')),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_learning_session_user       ON "RoleReady".learning_session(user_id);
CREATE INDEX idx_learning_session_training   ON "RoleReady".learning_session(training_id);
CREATE INDEX idx_learning_session_started_at ON "RoleReady".learning_session(started_at);

-- =============================================================
-- 2. learning_event (append-only immutable log)
-- =============================================================
CREATE TABLE "RoleReady".learning_event (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id  uuid        NOT NULL REFERENCES "RoleReady".learning_session(id) ON DELETE CASCADE,
    user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    event_type  text        NOT NULL
                            CHECK (event_type IN (
                                'session_start', 'session_end', 'session_pause', 'session_resume',
                                'step_open', 'step_complete',
                                'play', 'pause', 'seek', 'playback_end',
                                'heartbeat',
                                'answer_submit', 'quiz_complete',
                                'lesson_complete', 'training_complete'
                            )),
    step_id     uuid        REFERENCES "RoleReady".lesson_step(id) ON DELETE SET NULL,
    payload     jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_learning_event_session    ON "RoleReady".learning_event(session_id);
CREATE INDEX idx_learning_event_user       ON "RoleReady".learning_event(user_id);
CREATE INDEX idx_learning_event_type       ON "RoleReady".learning_event(event_type);
CREATE INDEX idx_learning_event_created_at ON "RoleReady".learning_event(created_at);

-- =============================================================
-- 3. step_attempt (quiz/exercise scoring)
-- =============================================================
CREATE TABLE "RoleReady".step_attempt (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    step_id         uuid        NOT NULL REFERENCES "RoleReady".lesson_step(id) ON DELETE CASCADE,
    session_id      uuid        REFERENCES "RoleReady".learning_session(id) ON DELETE SET NULL,
    attempt_number  integer     NOT NULL DEFAULT 1,
    score           smallint,
    max_score       smallint,
    passed          boolean,
    answer_payload  jsonb       NOT NULL DEFAULT '{}'::jsonb,
    started_at      timestamptz NOT NULL DEFAULT now(),
    completed_at    timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_step_attempt_user    ON "RoleReady".step_attempt(user_id);
CREATE INDEX idx_step_attempt_step    ON "RoleReady".step_attempt(step_id);
CREATE INDEX idx_step_attempt_session ON "RoleReady".step_attempt(session_id);

-- =============================================================
-- 4. Aggregation view: user watch/listen time from heartbeats
-- =============================================================
CREATE OR REPLACE VIEW "RoleReady".user_media_time AS
SELECT
    le.user_id,
    ls.training_id,
    SUM(CASE
        WHEN (le.payload->>'media_type') = 'video'
        THEN COALESCE((le.payload->>'duration_seconds')::integer, 10)
        ELSE 0
    END) AS total_watch_seconds,
    SUM(CASE
        WHEN (le.payload->>'media_type') = 'audio'
        THEN COALESCE((le.payload->>'duration_seconds')::integer, 10)
        ELSE 0
    END) AS total_listen_seconds
FROM "RoleReady".learning_event le
JOIN "RoleReady".learning_session ls ON ls.id = le.session_id
WHERE le.event_type = 'heartbeat'
GROUP BY le.user_id, ls.training_id;

-- =============================================================
-- 5. RLS — learning_session
-- =============================================================
ALTER TABLE "RoleReady".learning_session ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can view own sessions"
    ON "RoleReady".learning_session FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "users can insert own sessions"
    ON "RoleReady".learning_session FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "users can update own sessions"
    ON "RoleReady".learning_session FOR UPDATE
    USING (user_id = auth.uid());

CREATE POLICY "org admins can view all sessions"
    ON "RoleReady".learning_session FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM "RoleReady".training t
            JOIN "RoleReady".project p ON p.id = t.project_id
            WHERE t.id = learning_session.training_id
              AND public.is_org_admin(p.organization_id)
        )
    );

-- =============================================================
-- 6. RLS — learning_event
-- =============================================================
ALTER TABLE "RoleReady".learning_event ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can view own events"
    ON "RoleReady".learning_event FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "users can insert own events"
    ON "RoleReady".learning_event FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "org admins can view all events"
    ON "RoleReady".learning_event FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM "RoleReady".learning_session ls
            JOIN "RoleReady".training t ON t.id = ls.training_id
            JOIN "RoleReady".project p ON p.id = t.project_id
            WHERE ls.id = learning_event.session_id
              AND public.is_org_admin(p.organization_id)
        )
    );

-- =============================================================
-- 7. RLS — step_attempt
-- =============================================================
ALTER TABLE "RoleReady".step_attempt ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can view own attempts"
    ON "RoleReady".step_attempt FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "users can insert own attempts"
    ON "RoleReady".step_attempt FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "users can update own attempts"
    ON "RoleReady".step_attempt FOR UPDATE
    USING (user_id = auth.uid());

CREATE POLICY "org admins can view all attempts"
    ON "RoleReady".step_attempt FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM "RoleReady".lesson_step s
            JOIN "RoleReady".training_lesson tl ON tl.id = s.lesson_id
            JOIN "RoleReady".training t ON t.id = tl.training_id
            JOIN "RoleReady".project p ON p.id = t.project_id
            WHERE s.id = step_attempt.step_id
              AND public.is_org_admin(p.organization_id)
        )
    );

-- =============================================================
-- 8. Grants
-- =============================================================
GRANT SELECT, INSERT, UPDATE ON "RoleReady".learning_session TO authenticated;
GRANT SELECT, INSERT ON "RoleReady".learning_event TO authenticated;
GRANT SELECT, INSERT, UPDATE ON "RoleReady".step_attempt TO authenticated;

COMMIT;
