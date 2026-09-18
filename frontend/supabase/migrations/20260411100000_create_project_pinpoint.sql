-- =============================================================
-- Project pinpoint questions asset table.
-- Stores 10+ clue/answer rows per project.
-- =============================================================

CREATE TABLE IF NOT EXISTS "RoleReady".project_pinpoint (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id   uuid        NOT NULL REFERENCES "RoleReady".project(id) ON DELETE CASCADE,
    "timestamp"  timestamptz NOT NULL DEFAULT now(),
    clue_1       text        NOT NULL,
    clue_2       text        NOT NULL,
    clue_3       text        NOT NULL,
    answer       text        NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_project_pinpoint_project_id
    ON "RoleReady".project_pinpoint(project_id);

ALTER TABLE "RoleReady".project_pinpoint ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'RoleReady'
          AND tablename = 'project_pinpoint'
          AND policyname = 'org members can view project pinpoint'
    ) THEN
        EXECUTE $policy$
            CREATE POLICY "org members can view project pinpoint"
                ON "RoleReady".project_pinpoint FOR SELECT
                USING (
                    EXISTS (
                        SELECT 1 FROM "RoleReady".project p
                        WHERE p.id = project_pinpoint.project_id
                          AND public.is_org_member(p.organization_id)
                    )
                )
        $policy$;
    END IF;
END $$;

REVOKE ALL ON TABLE "RoleReady".project_pinpoint FROM anon;
REVOKE ALL ON TABLE "RoleReady".project_pinpoint FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "RoleReady".project_pinpoint TO service_role;
