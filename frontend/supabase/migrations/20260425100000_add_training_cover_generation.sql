-- =============================================================
-- Training cover generation
--
-- Adds first-class generated cover metadata to training rows, allows
-- training cover generation jobs, and publishes training row changes
-- through Supabase Realtime so cover status/image updates reach clients.
-- =============================================================

ALTER TABLE "RoleReady".training
    ADD COLUMN IF NOT EXISTS cover_image_url text,
    ADD COLUMN IF NOT EXISTS cover_image_status text NOT NULL DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS cover_image_prompt text,
    ADD COLUMN IF NOT EXISTS cover_image_error text,
    ADD COLUMN IF NOT EXISTS cover_image_generated_at timestamptz;

ALTER TABLE "RoleReady".training
    DROP CONSTRAINT IF EXISTS training_cover_image_status_check;

ALTER TABLE "RoleReady".training
    ADD CONSTRAINT training_cover_image_status_check
    CHECK (cover_image_status IN ('pending', 'generating', 'ready', 'failed'));

CREATE INDEX IF NOT EXISTS idx_training_cover_image_status
    ON "RoleReady".training(cover_image_status);

ALTER TABLE "RoleReady"."job" DROP CONSTRAINT IF EXISTS "job_job_type_check";
ALTER TABLE "RoleReady"."job" ADD CONSTRAINT "job_job_type_check"
    CHECK (job_type IN (
        'project_pipeline',
        'github_ingestion',
        'jira_ingestion',
        'confluence_ingestion',
        'document_ingestion',
        'infographic_generation',
        'mindmap_generation',
        'tts_generation',
        'video_generation',
        'training_cover_generation'
    ));

ALTER TABLE "RoleReady".training REPLICA IDENTITY FULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'RoleReady'
          AND tablename = 'training'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE "RoleReady".training;
    END IF;
END $$;
