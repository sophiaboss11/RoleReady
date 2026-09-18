-- =============================================================
-- Gamification Core: XP ledger, level system, streak tracking,
-- and learner gamification profile.
--
-- New tables (all in "RoleReady" schema):
--   xp_ledger                    – immutable XP transaction log
--   learner_gamification_profile – denormalized profile snapshot
--   daily_activity               – per-day activity tracking for streaks
-- =============================================================

BEGIN;

-- =============================================================
-- 1. xp_ledger (immutable, append-only)
-- =============================================================
CREATE TABLE "RoleReady".xp_ledger (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    amount      integer     NOT NULL,
    reason      text        NOT NULL
                            CHECK (reason IN (
                                'lesson_complete', 'step_complete', 'quiz_perfect',
                                'quiz_pass', 'streak_bonus', 'daily_goal',
                                'challenge_complete', 'first_lesson', 'training_complete',
                                'review_complete', 'admin_grant', 'anti_abuse_correction'
                            )),
    source_type text        NOT NULL DEFAULT 'system'
                            CHECK (source_type IN ('step', 'lesson', 'training', 'challenge', 'streak', 'quiz', 'system')),
    source_id   text,
    training_id uuid        REFERENCES "RoleReady".training(id) ON DELETE SET NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_xp_ledger_user       ON "RoleReady".xp_ledger(user_id);
CREATE INDEX idx_xp_ledger_created_at ON "RoleReady".xp_ledger(created_at);
CREATE INDEX idx_xp_ledger_reason     ON "RoleReady".xp_ledger(reason);
CREATE UNIQUE INDEX uq_xp_ledger_source
    ON "RoleReady".xp_ledger(user_id, source_type, source_id)
    WHERE source_id IS NOT NULL;

-- =============================================================
-- 2. learner_gamification_profile (derived snapshot)
-- =============================================================
CREATE TABLE "RoleReady".learner_gamification_profile (
    user_id                 uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    total_xp                integer     NOT NULL DEFAULT 0,
    level                   integer     NOT NULL DEFAULT 1,
    current_streak_days     integer     NOT NULL DEFAULT 0,
    longest_streak_days     integer     NOT NULL DEFAULT 0,
    total_watch_seconds     integer     NOT NULL DEFAULT 0,
    total_listen_seconds    integer     NOT NULL DEFAULT 0,
    total_lessons_completed integer     NOT NULL DEFAULT 0,
    total_steps_completed   integer     NOT NULL DEFAULT 0,
    quiz_total_score        integer     NOT NULL DEFAULT 0,
    quiz_total_max_score    integer     NOT NULL DEFAULT 0,
    updated_at              timestamptz NOT NULL DEFAULT now()
);

-- =============================================================
-- 3. daily_activity (one row per user per day)
-- =============================================================
CREATE TABLE "RoleReady".daily_activity (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    activity_date       date        NOT NULL,
    xp_earned           integer     NOT NULL DEFAULT 0,
    lessons_completed   integer     NOT NULL DEFAULT 0,
    steps_completed     integer     NOT NULL DEFAULT 0,
    watch_seconds       integer     NOT NULL DEFAULT 0,
    listen_seconds      integer     NOT NULL DEFAULT 0,
    quiz_attempts       integer     NOT NULL DEFAULT 0,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, activity_date)
);

CREATE INDEX idx_daily_activity_user ON "RoleReady".daily_activity(user_id);
CREATE INDEX idx_daily_activity_date ON "RoleReady".daily_activity(activity_date);

-- =============================================================
-- 4. XP grant function (writes ledger + updates profile)
-- =============================================================
CREATE OR REPLACE FUNCTION "RoleReady".grant_xp(
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
    -- Insert ledger entry
    INSERT INTO "RoleReady".xp_ledger (user_id, amount, reason, source_type, source_id, training_id)
    VALUES (p_user_id, p_amount, p_reason, p_source_type, p_source_id, p_training_id)
    ON CONFLICT (user_id, source_type, source_id) WHERE source_id IS NOT NULL DO NOTHING
    RETURNING * INTO v_entry;

    IF v_entry.id IS NULL THEN
        RETURN NULL;
    END IF;

    -- Compute new total XP
    SELECT COALESCE(SUM(amount), 0) INTO v_new_total
    FROM "RoleReady".xp_ledger
    WHERE user_id = p_user_id;

    -- Level formula: level = floor(sqrt(total_xp / 100)) + 1
    -- Level 1: 0-99 XP, Level 2: 100-399, Level 3: 400-899, etc.
    v_new_level := GREATEST(1, FLOOR(SQRT(v_new_total::numeric / 100)) + 1);

    -- Upsert gamification profile
    INSERT INTO "RoleReady".learner_gamification_profile (user_id, total_xp, level, updated_at)
    VALUES (p_user_id, v_new_total, v_new_level, now())
    ON CONFLICT (user_id) DO UPDATE SET
        total_xp = v_new_total,
        level = v_new_level,
        updated_at = now();

    -- Upsert daily activity XP
    INSERT INTO "RoleReady".daily_activity (user_id, activity_date, xp_earned)
    VALUES (p_user_id, v_today, p_amount)
    ON CONFLICT (user_id, activity_date) DO UPDATE SET
        xp_earned = daily_activity.xp_earned + p_amount,
        updated_at = now();

    RETURN v_entry;
END;
$$;

-- =============================================================
-- 5. Atomic increment helpers
-- =============================================================
CREATE OR REPLACE FUNCTION "RoleReady".increment_gamification_profile(
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
        user_id,
        total_watch_seconds,
        total_listen_seconds,
        total_lessons_completed,
        total_steps_completed,
        quiz_total_score,
        quiz_total_max_score,
        updated_at
    )
    VALUES (
        p_user_id,
        p_total_watch_seconds,
        p_total_listen_seconds,
        p_total_lessons_completed,
        p_total_steps_completed,
        p_quiz_total_score,
        p_quiz_total_max_score,
        now()
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

CREATE OR REPLACE FUNCTION "RoleReady".increment_daily_activity(
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
        user_id,
        activity_date,
        xp_earned,
        lessons_completed,
        steps_completed,
        watch_seconds,
        listen_seconds,
        quiz_attempts
    )
    VALUES (
        p_user_id,
        p_activity_date,
        p_xp_earned,
        p_lessons_completed,
        p_steps_completed,
        p_watch_seconds,
        p_listen_seconds,
        p_quiz_attempts
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
-- 6. Streak recalculation function
-- =============================================================
CREATE OR REPLACE FUNCTION "RoleReady".recalculate_streak(
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
            -- Allow one day gap (yesterday might not have activity yet today)
            IF v_check_date = CURRENT_DATE THEN
                v_check_date := v_check_date - 1;
                CONTINUE;
            END IF;
            EXIT;
        END IF;

        v_streak := v_streak + 1;
        v_check_date := v_check_date - 1;
    END LOOP;

    -- Update profile
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
-- 7. RLS
-- =============================================================
ALTER TABLE "RoleReady".xp_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RoleReady".learner_gamification_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RoleReady".daily_activity ENABLE ROW LEVEL SECURITY;

-- XP ledger: users see own, admins see org members
CREATE POLICY "users can view own xp ledger"
    ON "RoleReady".xp_ledger FOR SELECT
    USING (user_id = auth.uid());

-- Gamification profile: users see own + anyone in same org
CREATE POLICY "users can view own profile"
    ON "RoleReady".learner_gamification_profile FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "org members can view peer profiles"
    ON "RoleReady".learner_gamification_profile FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM organization_member om1
            JOIN organization_member om2 ON om1.organization_id = om2.organization_id
            WHERE om1.user_id = auth.uid()
              AND om2.user_id = learner_gamification_profile.user_id
        )
    );

-- Daily activity: users see own
CREATE POLICY "users can view own daily activity"
    ON "RoleReady".daily_activity FOR SELECT
    USING (user_id = auth.uid());

-- =============================================================
-- 8. Grants
-- =============================================================
GRANT SELECT ON "RoleReady".xp_ledger TO authenticated;
GRANT SELECT ON "RoleReady".learner_gamification_profile TO authenticated;
GRANT SELECT ON "RoleReady".daily_activity TO authenticated;

REVOKE ALL ON FUNCTION "RoleReady".grant_xp(uuid, integer, text, text, text, uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION "RoleReady".grant_xp(uuid, integer, text, text, text, uuid)
    TO service_role;

REVOKE ALL ON FUNCTION "RoleReady".increment_gamification_profile(
    uuid, integer, integer, integer, integer, integer, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION "RoleReady".increment_gamification_profile(
    uuid, integer, integer, integer, integer, integer, integer
) TO service_role;

REVOKE ALL ON FUNCTION "RoleReady".increment_daily_activity(
    uuid, date, integer, integer, integer, integer, integer, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION "RoleReady".increment_daily_activity(
    uuid, date, integer, integer, integer, integer, integer, integer
) TO service_role;

REVOKE ALL ON FUNCTION "RoleReady".recalculate_streak(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION "RoleReady".recalculate_streak(uuid) TO service_role;

COMMIT;
