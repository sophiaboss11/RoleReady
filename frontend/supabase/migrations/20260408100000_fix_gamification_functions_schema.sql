-- =============================================================
-- Fix: Move gamification functions from "RoleReady" to public schema
-- so that Supabase client.rpc() can find them.
--
-- Also:
--   - Add missing increment_gamification_profile function
--   - Add missing increment_daily_activity function
--   - Add 'quiz' to xp_ledger.source_type CHECK constraint
--   - Change xp_ledger.source_id from uuid to text
--   - Add unique index uq_xp_ledger_source for idempotency
-- =============================================================

-- wrapped in implicit transaction by supabase db push

-- =============================================================
-- 1. Fix xp_ledger.source_id type: uuid → text
-- =============================================================
ALTER TABLE "RoleReady".xp_ledger
    ALTER COLUMN source_id TYPE text USING source_id::text;

-- =============================================================
-- 2. Fix xp_ledger.source_type CHECK to include 'quiz'
-- =============================================================
ALTER TABLE "RoleReady".xp_ledger
    DROP CONSTRAINT xp_ledger_source_type_check;
ALTER TABLE "RoleReady".xp_ledger
    ADD CONSTRAINT xp_ledger_source_type_check
    CHECK (source_type IN ('step', 'lesson', 'training', 'challenge', 'streak', 'quiz', 'system'));

-- =============================================================
-- 3. Add idempotency unique index on xp_ledger
-- =============================================================
CREATE UNIQUE INDEX IF NOT EXISTS uq_xp_ledger_source
    ON "RoleReady".xp_ledger(user_id, source_type, source_id)
    WHERE source_id IS NOT NULL;

-- =============================================================
-- 4. Drop "RoleReady" schema functions (they need to be in public)
-- =============================================================
DROP FUNCTION IF EXISTS "RoleReady".grant_xp(uuid, integer, text, text, uuid, uuid);
DROP FUNCTION IF EXISTS "RoleReady".grant_xp(uuid, integer, text, text, text, uuid);
DROP FUNCTION IF EXISTS "RoleReady".recalculate_streak(uuid);
DROP FUNCTION IF EXISTS "RoleReady".project_step_completion(uuid, uuid, smallint, smallint);
DROP FUNCTION IF EXISTS "RoleReady".compute_leaderboard(uuid, text, date, date);
DROP FUNCTION IF EXISTS "RoleReady".increment_gamification_profile(uuid, integer, integer, integer, integer, integer, integer);
DROP FUNCTION IF EXISTS "RoleReady".increment_daily_activity(uuid, date, integer, integer, integer, integer, integer, integer);

-- =============================================================
-- 5. Recreate grant_xp in public schema
-- =============================================================
CREATE OR REPLACE FUNCTION public.grant_xp(
    p_user_id uuid,
    p_amount integer,
    p_reason text,
    p_source_type text DEFAULT 'system',
    p_source_id text DEFAULT NULL,
    p_training_id uuid DEFAULT NULL
) RETURNS "RoleReady".xp_ledger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, "RoleReady"
AS $$
DECLARE
    v_entry "RoleReady".xp_ledger%ROWTYPE;
    v_new_total integer;
    v_new_level integer;
    v_today date := CURRENT_DATE;
BEGIN
    INSERT INTO "RoleReady".xp_ledger (user_id, amount, reason, source_type, source_id, training_id)
    VALUES (p_user_id, p_amount, p_reason, p_source_type, p_source_id, p_training_id)
    ON CONFLICT (user_id, source_type, source_id) WHERE source_id IS NOT NULL DO NOTHING
    RETURNING * INTO v_entry;

    IF v_entry.id IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT COALESCE(SUM(amount), 0) INTO v_new_total
    FROM "RoleReady".xp_ledger
    WHERE user_id = p_user_id;

    v_new_level := GREATEST(1, FLOOR(SQRT(v_new_total::numeric / 100)) + 1);

    INSERT INTO "RoleReady".learner_gamification_profile (user_id, total_xp, level, updated_at)
    VALUES (p_user_id, v_new_total, v_new_level, now())
    ON CONFLICT (user_id) DO UPDATE SET
        total_xp = v_new_total,
        level = v_new_level,
        updated_at = now();

    INSERT INTO "RoleReady".daily_activity (user_id, activity_date, xp_earned)
    VALUES (p_user_id, v_today, p_amount)
    ON CONFLICT (user_id, activity_date) DO UPDATE SET
        xp_earned = daily_activity.xp_earned + p_amount,
        updated_at = now();

    RETURN v_entry;
END;
$$;

-- =============================================================
-- 6. Recreate increment_gamification_profile in public schema
-- =============================================================
CREATE OR REPLACE FUNCTION public.increment_gamification_profile(
    p_user_id uuid,
    p_total_watch_seconds integer DEFAULT 0,
    p_total_listen_seconds integer DEFAULT 0,
    p_total_lessons_completed integer DEFAULT 0,
    p_total_steps_completed integer DEFAULT 0,
    p_quiz_total_score integer DEFAULT 0,
    p_quiz_total_max_score integer DEFAULT 0
) RETURNS "RoleReady".learner_gamification_profile
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, "RoleReady"
AS $$
DECLARE
    v_profile "RoleReady".learner_gamification_profile%ROWTYPE;
BEGIN
    INSERT INTO "RoleReady".learner_gamification_profile (
        user_id, total_watch_seconds, total_listen_seconds,
        total_lessons_completed, total_steps_completed,
        quiz_total_score, quiz_total_max_score, updated_at
    ) VALUES (
        p_user_id, p_total_watch_seconds, p_total_listen_seconds,
        p_total_lessons_completed, p_total_steps_completed,
        p_quiz_total_score, p_quiz_total_max_score, now()
    )
    ON CONFLICT (user_id) DO UPDATE SET
        total_watch_seconds = learner_gamification_profile.total_watch_seconds + p_total_watch_seconds,
        total_listen_seconds = learner_gamification_profile.total_listen_seconds + p_total_listen_seconds,
        total_lessons_completed = learner_gamification_profile.total_lessons_completed + p_total_lessons_completed,
        total_steps_completed = learner_gamification_profile.total_steps_completed + p_total_steps_completed,
        quiz_total_score = learner_gamification_profile.quiz_total_score + p_quiz_total_score,
        quiz_total_max_score = learner_gamification_profile.quiz_total_max_score + p_quiz_total_max_score,
        updated_at = now()
    RETURNING * INTO v_profile;

    RETURN v_profile;
END;
$$;

-- =============================================================
-- 7. Recreate increment_daily_activity in public schema
-- =============================================================
CREATE OR REPLACE FUNCTION public.increment_daily_activity(
    p_user_id uuid,
    p_activity_date date,
    p_xp_earned integer DEFAULT 0,
    p_lessons_completed integer DEFAULT 0,
    p_steps_completed integer DEFAULT 0,
    p_watch_seconds integer DEFAULT 0,
    p_listen_seconds integer DEFAULT 0,
    p_quiz_attempts integer DEFAULT 0
) RETURNS "RoleReady".daily_activity
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, "RoleReady"
AS $$
DECLARE
    v_activity "RoleReady".daily_activity%ROWTYPE;
BEGIN
    INSERT INTO "RoleReady".daily_activity (
        user_id, activity_date, xp_earned, lessons_completed,
        steps_completed, watch_seconds, listen_seconds, quiz_attempts
    ) VALUES (
        p_user_id, p_activity_date, p_xp_earned, p_lessons_completed,
        p_steps_completed, p_watch_seconds, p_listen_seconds, p_quiz_attempts
    )
    ON CONFLICT (user_id, activity_date) DO UPDATE SET
        xp_earned = daily_activity.xp_earned + p_xp_earned,
        lessons_completed = daily_activity.lessons_completed + p_lessons_completed,
        steps_completed = daily_activity.steps_completed + p_steps_completed,
        watch_seconds = daily_activity.watch_seconds + p_watch_seconds,
        listen_seconds = daily_activity.listen_seconds + p_listen_seconds,
        quiz_attempts = daily_activity.quiz_attempts + p_quiz_attempts,
        updated_at = now()
    RETURNING * INTO v_activity;

    RETURN v_activity;
END;
$$;

-- =============================================================
-- 8. Recreate recalculate_streak in public schema
-- =============================================================
CREATE OR REPLACE FUNCTION public.recalculate_streak(
    p_user_id uuid
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, "RoleReady"
AS $$
DECLARE
    v_streak integer := 0;
    v_check_date date := CURRENT_DATE;
    v_found boolean;
BEGIN
    LOOP
        SELECT EXISTS (
            SELECT 1 FROM "RoleReady".daily_activity
            WHERE user_id = p_user_id
              AND activity_date = v_check_date
              AND (xp_earned > 0 OR lessons_completed > 0 OR steps_completed > 0)
        ) INTO v_found;

        IF NOT v_found THEN
            IF v_check_date = CURRENT_DATE THEN
                v_check_date := v_check_date - 1;
                CONTINUE;
            END IF;
            EXIT;
        END IF;

        v_streak := v_streak + 1;
        v_check_date := v_check_date - 1;
    END LOOP;

    UPDATE "RoleReady".learner_gamification_profile
    SET
        current_streak_days = v_streak,
        longest_streak_days = GREATEST(longest_streak_days, v_streak),
        updated_at = now()
    WHERE user_id = p_user_id;

    RETURN v_streak;
END;
$$;

-- =============================================================
-- 9. Recreate project_step_completion in public schema
-- =============================================================
CREATE OR REPLACE FUNCTION public.project_step_completion(
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
    SELECT tl.id, tl.training_id
    INTO v_lesson_id, v_training_id
    FROM "RoleReady".lesson_step ls
    JOIN "RoleReady".training_lesson tl ON tl.id = ls.lesson_id
    WHERE ls.id = p_step_id;

    IF v_lesson_id IS NULL THEN
        RETURN;
    END IF;

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
-- 10. Recreate compute_leaderboard in public schema
-- =============================================================
CREATE OR REPLACE FUNCTION public.compute_leaderboard(
    p_organization_id uuid,
    p_period_type text,
    p_period_start date,
    p_period_end date
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, "RoleReady"
AS $$
BEGIN
    DELETE FROM "RoleReady".leaderboard_snapshot
    WHERE organization_id = p_organization_id
      AND period_type = p_period_type
      AND period_start = p_period_start;

    INSERT INTO "RoleReady".leaderboard_snapshot
        (organization_id, period_type, period_start, period_end, user_id, rank, xp_earned)
    SELECT
        p_organization_id, p_period_type, p_period_start, p_period_end,
        xl.user_id,
        ROW_NUMBER() OVER (ORDER BY SUM(xl.amount) DESC),
        SUM(xl.amount)
    FROM "RoleReady".xp_ledger xl
    JOIN organization_member om ON om.user_id = xl.user_id AND om.organization_id = p_organization_id
    WHERE xl.created_at >= p_period_start::timestamptz
      AND xl.created_at < (p_period_end + 1)::timestamptz
    GROUP BY xl.user_id
    HAVING SUM(xl.amount) > 0
    ORDER BY SUM(xl.amount) DESC
    LIMIT 100;
END;
$$;

-- =============================================================
-- 11. Grants: service_role only
-- =============================================================
REVOKE ALL ON FUNCTION public.grant_xp(uuid, integer, text, text, text, uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_xp(uuid, integer, text, text, text, uuid)
    TO service_role;

REVOKE ALL ON FUNCTION public.increment_gamification_profile(uuid, integer, integer, integer, integer, integer, integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_gamification_profile(uuid, integer, integer, integer, integer, integer, integer)
    TO service_role;

REVOKE ALL ON FUNCTION public.increment_daily_activity(uuid, date, integer, integer, integer, integer, integer, integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_daily_activity(uuid, date, integer, integer, integer, integer, integer, integer)
    TO service_role;

REVOKE ALL ON FUNCTION public.recalculate_streak(uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_streak(uuid)
    TO service_role;

REVOKE ALL ON FUNCTION public.project_step_completion(uuid, uuid, smallint, smallint)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.project_step_completion(uuid, uuid, smallint, smallint)
    TO service_role;

REVOKE ALL ON FUNCTION public.compute_leaderboard(uuid, text, date, date)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_leaderboard(uuid, text, date, date)
    TO service_role;

-- end
