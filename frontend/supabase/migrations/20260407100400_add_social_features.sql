-- =============================================================
-- Social Features: leaderboards, challenges, and participation.
--
-- New tables (all in "RoleReady" schema):
--   leaderboard_snapshot      – periodic ranking snapshots
--   challenge                 – time-bounded competitive goals
--   challenge_participation   – user participation in challenges
-- =============================================================

BEGIN;

-- =============================================================
-- 1. leaderboard_snapshot
-- =============================================================
CREATE TABLE "RoleReady".leaderboard_snapshot (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   uuid        NOT NULL,
    period_type       text        NOT NULL CHECK (period_type IN ('weekly', 'monthly', 'all_time')),
    period_start      date        NOT NULL,
    period_end        date        NOT NULL,
    user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    rank              integer     NOT NULL,
    xp_earned         integer     NOT NULL DEFAULT 0,
    created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_leaderboard_org_period
    ON "RoleReady".leaderboard_snapshot(organization_id, period_type, period_start);
CREATE INDEX idx_leaderboard_user
    ON "RoleReady".leaderboard_snapshot(user_id);

-- =============================================================
-- 2. challenge
-- =============================================================
CREATE TABLE "RoleReady".challenge (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   uuid        NOT NULL,
    title             text        NOT NULL,
    description       text,
    challenge_type    text        NOT NULL DEFAULT 'individual'
                                  CHECK (challenge_type IN ('individual', 'team')),
    target_value      integer     NOT NULL CHECK (target_value > 0),
    metric            text        NOT NULL
                                  CHECK (metric IN (
                                      'xp_earned', 'lessons_completed', 'steps_completed',
                                      'watch_seconds', 'listen_seconds', 'quiz_attempts',
                                      'streak_days'
                                  )),
    start_date        date        NOT NULL,
    end_date          date        NOT NULL,
    reward_xp         integer     NOT NULL DEFAULT 0 CHECK (reward_xp >= 0),
    status            text        NOT NULL DEFAULT 'draft'
                                  CHECK (status IN ('draft', 'active', 'completed', 'cancelled')),
    created_by        uuid        NOT NULL REFERENCES auth.users(id),
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    CHECK (end_date > start_date)
);

CREATE INDEX idx_challenge_org    ON "RoleReady".challenge(organization_id);
CREATE INDEX idx_challenge_status ON "RoleReady".challenge(status);
CREATE INDEX idx_challenge_dates  ON "RoleReady".challenge(start_date, end_date);

-- =============================================================
-- 3. challenge_participation
-- =============================================================
CREATE TABLE "RoleReady".challenge_participation (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge_id    uuid        NOT NULL REFERENCES "RoleReady".challenge(id) ON DELETE CASCADE,
    user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    current_value   integer     NOT NULL DEFAULT 0,
    completed       boolean     NOT NULL DEFAULT false,
    completed_at    timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (challenge_id, user_id)
);

CREATE INDEX idx_cp_challenge ON "RoleReady".challenge_participation(challenge_id);
CREATE INDEX idx_cp_user      ON "RoleReady".challenge_participation(user_id);

-- =============================================================
-- 4. Leaderboard computation function
-- =============================================================
CREATE OR REPLACE FUNCTION "RoleReady".compute_leaderboard(
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
    -- Remove existing snapshot for this period
    DELETE FROM "RoleReady".leaderboard_snapshot
    WHERE organization_id = p_organization_id
      AND period_type = p_period_type
      AND period_start = p_period_start;

    -- Insert ranked users
    INSERT INTO "RoleReady".leaderboard_snapshot
        (organization_id, period_type, period_start, period_end, user_id, rank, xp_earned)
    SELECT
        p_organization_id,
        p_period_type,
        p_period_start,
        p_period_end,
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
-- 5. RLS
-- =============================================================
ALTER TABLE "RoleReady".leaderboard_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RoleReady".challenge ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RoleReady".challenge_participation ENABLE ROW LEVEL SECURITY;

-- Leaderboards: org members can view
CREATE POLICY "org members can view leaderboards"
    ON "RoleReady".leaderboard_snapshot FOR SELECT
    USING (public.is_org_member(organization_id));

-- Challenges: org members can view, admins manage
CREATE POLICY "org members can view challenges"
    ON "RoleReady".challenge FOR SELECT
    USING (public.is_org_member(organization_id));

CREATE POLICY "org admins can manage challenges"
    ON "RoleReady".challenge FOR ALL
    USING (public.is_org_admin(organization_id));

-- Participation: users see own + peers in org
CREATE POLICY "users can view own participation"
    ON "RoleReady".challenge_participation FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "org members can view challenge participation"
    ON "RoleReady".challenge_participation FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM "RoleReady".challenge c
            WHERE c.id = challenge_participation.challenge_id
              AND public.is_org_member(c.organization_id)
        )
    );

CREATE POLICY "users can join challenges"
    ON "RoleReady".challenge_participation FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- =============================================================
-- 6. Grants
-- =============================================================
GRANT SELECT ON "RoleReady".leaderboard_snapshot TO authenticated;
GRANT SELECT ON "RoleReady".challenge TO authenticated;
GRANT SELECT, INSERT, UPDATE ON "RoleReady".challenge_participation TO authenticated;

REVOKE ALL ON FUNCTION "RoleReady".compute_leaderboard(uuid, text, date, date)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION "RoleReady".compute_leaderboard(uuid, text, date, date)
    TO service_role;

COMMIT;
