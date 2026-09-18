-- =============================================================
-- Ensure project_video exists and job tracking accepts video_generation.
-- Safe to apply on environments that may already have the table.
-- =============================================================

CREATE TABLE IF NOT EXISTS "RoleReady".project_video (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      uuid        NOT NULL UNIQUE REFERENCES "RoleReady".project(id) ON DELETE CASCADE,
    video_url       text,
    prompt          text        NOT NULL DEFAULT '',
    retrieved_count integer     NOT NULL DEFAULT 0,
    slide_count     integer     NOT NULL DEFAULT 0,
    warning         text,
    metadata        jsonb       NOT NULL DEFAULT '{}'::jsonb,
    is_processed    boolean     NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_video_project_id
    ON "RoleReady".project_video(project_id);

ALTER TABLE "RoleReady".project_video ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'RoleReady'
          AND tablename = 'project_video'
          AND policyname = 'org members can view project videos'
    ) THEN
        EXECUTE $policy$
            CREATE POLICY "org members can view project videos"
                ON "RoleReady".project_video FOR SELECT
                USING (
                    EXISTS (
                        SELECT 1 FROM "RoleReady".project p
                        WHERE p.id = project_video.project_id
                          AND public.is_org_member(p.organization_id)
                    )
                )
        $policy$;
    END IF;
END $$;

REVOKE ALL ON TABLE "RoleReady".project_video FROM anon;
REVOKE ALL ON TABLE "RoleReady".project_video FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "RoleReady".project_video TO service_role;

ALTER TABLE "RoleReady"."job" DROP CONSTRAINT IF EXISTS "job_job_type_check";
ALTER TABLE "RoleReady"."job" ADD CONSTRAINT "job_job_type_check"
    CHECK (job_type IN (
        'github_ingestion',
        'jira_ingestion',
        'confluence_ingestion',
        'document_ingestion',
        'infographic_generation',
        'mindmap_generation',
        'tts_generation',
        'video_generation'
    ));
