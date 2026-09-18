-- =============================================================
-- Project architecture deployment asset table.
-- Stores one architecture payload per project.
-- =============================================================

CREATE TABLE IF NOT EXISTS "RoleReady".project_architecture (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id   uuid        NOT NULL UNIQUE REFERENCES "RoleReady".project(id) ON DELETE CASCADE,
    "timestamp"  timestamptz NOT NULL DEFAULT now(),
    frontend     jsonb       NOT NULL DEFAULT '[]'::jsonb,
    application  jsonb       NOT NULL DEFAULT '[]'::jsonb,
    data         jsonb       NOT NULL DEFAULT '[]'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_architecture_project_id
    ON "RoleReady".project_architecture(project_id);

ALTER TABLE "RoleReady".project_architecture ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'RoleReady'
          AND tablename = 'project_architecture'
          AND policyname = 'org members can view project architecture'
    ) THEN
        EXECUTE $policy$
            CREATE POLICY "org members can view project architecture"
                ON "RoleReady".project_architecture FOR SELECT
                USING (
                    EXISTS (
                        SELECT 1 FROM "RoleReady".project p
                        WHERE p.id = project_architecture.project_id
                          AND public.is_org_member(p.organization_id)
                    )
                )
        $policy$;
    END IF;
END $$;

REVOKE ALL ON TABLE "RoleReady".project_architecture FROM anon;
REVOKE ALL ON TABLE "RoleReady".project_architecture FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "RoleReady".project_architecture TO service_role;
