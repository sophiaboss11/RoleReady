-- =============================================================
-- Progress Snapshot Rebuild: learner progress snapshots at
-- training / lesson / step granularity, plus projection function.
--
-- New tables (all in "RoleReady" schema):
--   learner_training_progress  – per-user per-training snapshot
--   learner_lesson_progress    – per-user per-lesson snapshot
--   learner_step_progress      – per-user per-step snapshot
-- =============================================================

BEGIN;

-- =============================================================
-- 1. learner_training_progress
-- =============================================================
CREATE TABLE "RoleReady".learner_training_progress (
    user_id             uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    training_id         uuid        NOT NULL REFERENCES "RoleReady".training(id) ON DELETE CASCADE,
    status              text        NOT NULL DEFAULT 'not_started'
                                    CHECK (status IN ('not_started', 'in_progress', 'completed')),
    progress_pct        smallint    NOT NULL DEFAULT 0
                                    CHECK (progress_pct BETWEEN 0 AND 100),
    completed_lessons   integer     NOT NULL DEFAULT 0,
    total_lessons       integer     NOT NULL DEFAULT 0,
    started_at          timestamptz,
    completed_at        timestamptz,
    last_active_at      timestamptz,
    updated_at          timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, training_id)
);

CREATE INDEX idx_ltp_training ON "RoleReady".learner_training_progress(training_id);

-- =============================================================
-- 2. learner_lesson_progress
-- =============================================================
CREATE TABLE "RoleReady".learner_lesson_progress (
    user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    lesson_id       uuid        NOT NULL REFERENCES "RoleReady".training_lesson(id) ON DELETE CASCADE,
    training_id     uuid        NOT NULL REFERENCES "RoleReady".training(id) ON DELETE CASCADE,
    status          text        NOT NULL DEFAULT 'locked'
                                CHECK (status IN ('locked', 'available', 'in_progress', 'completed', 'mastered')),
    progress_pct    smallint    NOT NULL DEFAULT 0
                                CHECK (progress_pct BETWEEN 0 AND 100),
    completed_steps integer     NOT NULL DEFAULT 0,
    total_steps     integer     NOT NULL DEFAULT 0,
    best_score      smallint,
    started_at      timestamptz,
    completed_at    timestamptz,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, lesson_id)
);

CREATE INDEX idx_llp_training ON "RoleReady".learner_lesson_progress(training_id);

-- =============================================================
-- 3. learner_step_progress
-- =============================================================
CREATE TABLE "RoleReady".learner_step_progress (
    user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    step_id         uuid        NOT NULL REFERENCES "RoleReady".lesson_step(id) ON DELETE CASCADE,
    lesson_id       uuid        NOT NULL REFERENCES "RoleReady".training_lesson(id) ON DELETE CASCADE,
    status          text        NOT NULL DEFAULT 'not_started'
                                CHECK (status IN ('not_started', 'in_progress', 'completed')),
    progress_pct    smallint    NOT NULL DEFAULT 0
                                CHECK (progress_pct BETWEEN 0 AND 100),
    best_score      smallint,
    best_max_score  smallint,
    attempts        integer     NOT NULL DEFAULT 0,
    watch_seconds   integer     NOT NULL DEFAULT 0,
    listen_seconds  integer     NOT NULL DEFAULT 0,
    last_position_seconds integer,
    started_at      timestamptz,
    completed_at    timestamptz,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, step_id)
);

CREATE INDEX idx_lsp_lesson ON "RoleReady".learner_step_progress(lesson_id);

-- =============================================================
-- 4. Projection function: update snapshots from events
-- =============================================================
CREATE OR REPLACE FUNCTION "RoleReady".project_step_completion(
    p_user_id uuid,
    p_step_id uuid,
    p_score smallint DEFAULT NULL,
    p_max_score smallint DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, "RoleReady"
AS $$
DECLARE
    v_lesson_id uuid;
    v_training_id uuid;
    v_total_steps integer;
    v_completed_steps integer;
    v_total_lessons integer;
    v_completed_lessons integer;
    v_now timestamptz := now();
BEGIN
    -- Get lesson and training for this step
    SELECT tl.id, tl.training_id
    INTO v_lesson_id, v_training_id
    FROM "RoleReady".lesson_step ls
    JOIN "RoleReady".training_lesson tl ON tl.id = ls.lesson_id
    WHERE ls.id = p_step_id;

    IF v_lesson_id IS NULL THEN
        RETURN;
    END IF;

    -- Upsert step progress
    INSERT INTO "RoleReady".learner_step_progress (
        user_id, step_id, lesson_id, status, progress_pct,
        best_score, best_max_score, attempts, started_at, completed_at, updated_at
    ) VALUES (
        p_user_id, p_step_id, v_lesson_id, 'completed', 100,
        p_score, p_max_score, 1, v_now, v_now, v_now
    )
    ON CONFLICT (user_id, step_id) DO UPDATE SET
        status = 'completed',
        progress_pct = 100,
        best_score = CASE
            WHEN EXCLUDED.best_score IS NULL THEN learner_step_progress.best_score
            WHEN learner_step_progress.best_score IS NULL THEN EXCLUDED.best_score
            ELSE GREATEST(learner_step_progress.best_score, EXCLUDED.best_score)
        END,
        best_max_score = CASE
            WHEN EXCLUDED.best_max_score IS NULL THEN learner_step_progress.best_max_score
            WHEN learner_step_progress.best_max_score IS NULL THEN EXCLUDED.best_max_score
            ELSE GREATEST(learner_step_progress.best_max_score, EXCLUDED.best_max_score)
        END,
        attempts = learner_step_progress.attempts + 1,
        completed_at = COALESCE(learner_step_progress.completed_at, v_now),
        updated_at = v_now;

    -- Recompute lesson progress
    SELECT COUNT(*), COUNT(*) FILTER (WHERE lsp.status = 'completed')
    INTO v_total_steps, v_completed_steps
    FROM "RoleReady".lesson_step ls
    LEFT JOIN "RoleReady".learner_step_progress lsp
      ON lsp.step_id = ls.id AND lsp.user_id = p_user_id
    WHERE ls.lesson_id = v_lesson_id AND ls.is_required;

    INSERT INTO "RoleReady".learner_lesson_progress (
        user_id, lesson_id, training_id, status, progress_pct,
        completed_steps, total_steps, best_score, started_at, completed_at, updated_at
    ) VALUES (
        p_user_id, v_lesson_id, v_training_id,
        CASE
            WHEN v_total_steps > 0 AND v_completed_steps >= v_total_steps THEN 'completed'
            WHEN v_completed_steps > 0 THEN 'in_progress'
            ELSE 'available'
        END,
        CASE WHEN v_total_steps > 0 THEN ROUND(v_completed_steps::numeric / v_total_steps * 100) ELSE 0 END,
        v_completed_steps, v_total_steps, p_score, v_now,
        CASE WHEN v_total_steps > 0 AND v_completed_steps >= v_total_steps THEN v_now ELSE NULL END,
        v_now
    )
    ON CONFLICT (user_id, lesson_id) DO UPDATE SET
        status = CASE
            WHEN v_total_steps > 0 AND v_completed_steps >= v_total_steps THEN 'completed'
            WHEN v_completed_steps > 0 THEN 'in_progress'
            ELSE learner_lesson_progress.status
        END,
        progress_pct = CASE WHEN v_total_steps > 0 THEN ROUND(v_completed_steps::numeric / v_total_steps * 100) ELSE 0 END,
        completed_steps = v_completed_steps,
        total_steps = v_total_steps,
        best_score = CASE
            WHEN p_score IS NULL THEN learner_lesson_progress.best_score
            WHEN learner_lesson_progress.best_score IS NULL THEN p_score
            ELSE GREATEST(learner_lesson_progress.best_score, p_score)
        END,
        started_at = COALESCE(learner_lesson_progress.started_at, v_now),
        completed_at = CASE
            WHEN v_total_steps > 0 AND v_completed_steps >= v_total_steps
            THEN COALESCE(learner_lesson_progress.completed_at, v_now)
            ELSE NULL
        END,
        updated_at = v_now;

    -- Recompute training progress
    SELECT COUNT(*), COUNT(*) FILTER (WHERE llp.status IN ('completed', 'mastered'))
    INTO v_total_lessons, v_completed_lessons
    FROM "RoleReady".training_lesson tl
    LEFT JOIN "RoleReady".learner_lesson_progress llp
      ON llp.lesson_id = tl.id AND llp.user_id = p_user_id
    WHERE tl.training_id = v_training_id AND tl.is_required;

    INSERT INTO "RoleReady".learner_training_progress (
        user_id, training_id, status, progress_pct,
        completed_lessons, total_lessons, started_at, completed_at, last_active_at, updated_at
    ) VALUES (
        p_user_id, v_training_id,
        CASE
            WHEN v_total_lessons > 0 AND v_completed_lessons >= v_total_lessons THEN 'completed'
            WHEN v_completed_lessons > 0 THEN 'in_progress'
            ELSE 'not_started'
        END,
        CASE WHEN v_total_lessons > 0 THEN ROUND(v_completed_lessons::numeric / v_total_lessons * 100) ELSE 0 END,
        v_completed_lessons, v_total_lessons, v_now,
        CASE WHEN v_total_lessons > 0 AND v_completed_lessons >= v_total_lessons THEN v_now ELSE NULL END,
        v_now, v_now
    )
    ON CONFLICT (user_id, training_id) DO UPDATE SET
        status = CASE
            WHEN v_total_lessons > 0 AND v_completed_lessons >= v_total_lessons THEN 'completed'
            WHEN v_completed_lessons > 0 THEN 'in_progress'
            ELSE learner_training_progress.status
        END,
        progress_pct = CASE WHEN v_total_lessons > 0 THEN ROUND(v_completed_lessons::numeric / v_total_lessons * 100) ELSE 0 END,
        completed_lessons = v_completed_lessons,
        total_lessons = v_total_lessons,
        started_at = COALESCE(learner_training_progress.started_at, v_now),
        completed_at = CASE
            WHEN v_total_lessons > 0 AND v_completed_lessons >= v_total_lessons
            THEN COALESCE(learner_training_progress.completed_at, v_now)
            ELSE NULL
        END,
        last_active_at = v_now,
        updated_at = v_now;
END;
$$;

-- =============================================================
-- 5. RLS
-- =============================================================
ALTER TABLE "RoleReady".learner_training_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RoleReady".learner_lesson_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RoleReady".learner_step_progress ENABLE ROW LEVEL SECURITY;

-- Users can view/manage own progress
CREATE POLICY "users can view own training progress"
    ON "RoleReady".learner_training_progress FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "users can view own lesson progress"
    ON "RoleReady".learner_lesson_progress FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "users can view own step progress"
    ON "RoleReady".learner_step_progress FOR SELECT
    USING (user_id = auth.uid());

-- Admins can view all progress in their org
CREATE POLICY "org admins can view all training progress"
    ON "RoleReady".learner_training_progress FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM "RoleReady".training t
            JOIN "RoleReady".project p ON p.id = t.project_id
            WHERE t.id = learner_training_progress.training_id
              AND public.is_org_admin(p.organization_id)
        )
    );

CREATE POLICY "org admins can view all lesson progress"
    ON "RoleReady".learner_lesson_progress FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM "RoleReady".training t
            JOIN "RoleReady".project p ON p.id = t.project_id
            WHERE t.id = learner_lesson_progress.training_id
              AND public.is_org_admin(p.organization_id)
        )
    );

CREATE POLICY "org admins can view all step progress"
    ON "RoleReady".learner_step_progress FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM "RoleReady".training_lesson tl
            JOIN "RoleReady".training t ON t.id = tl.training_id
            JOIN "RoleReady".project p ON p.id = t.project_id
            WHERE tl.id = learner_step_progress.lesson_id
              AND public.is_org_admin(p.organization_id)
        )
    );

-- =============================================================
-- 6. Grants
-- =============================================================
GRANT SELECT ON "RoleReady".learner_training_progress TO authenticated;
GRANT SELECT ON "RoleReady".learner_lesson_progress TO authenticated;
GRANT SELECT ON "RoleReady".learner_step_progress TO authenticated;

REVOKE ALL ON FUNCTION "RoleReady".project_step_completion(uuid, uuid, smallint, smallint)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION "RoleReady".project_step_completion(uuid, uuid, smallint, smallint)
    TO service_role;

COMMIT;
