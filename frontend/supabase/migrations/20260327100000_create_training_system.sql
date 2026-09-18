-- =============================================================
-- Training System: core tables for curriculum, assignment,
-- and progress tracking.
--
-- New tables (all in "RoleReady" schema):
--   training             – training entity linked to a project
--   training_module      – ordered curriculum items
--   training_assignment  – user ↔ training binding
--   module_progress      – per-user, per-module completion
--
-- Also applies security fixes to existing tables:
--   - Removes overly permissive anon INSERT on embedding
--   - Adds missing SELECT RLS policies on asset tables
-- =============================================================

BEGIN;

-- =============================================================
-- 1. training
-- =============================================================
CREATE TABLE "RoleReady".training (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id     uuid        NOT NULL REFERENCES "RoleReady".project(id) ON DELETE CASCADE,
    title          text        NOT NULL,
    description    text,
    status         text        NOT NULL DEFAULT 'draft'
                               CHECK (status IN ('draft', 'published', 'archived')),
    created_by     uuid        NOT NULL REFERENCES auth.users(id),
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_training_project_id ON "RoleReady".training(project_id);
CREATE INDEX idx_training_status     ON "RoleReady".training(status);

-- =============================================================
-- 2. training_module
-- =============================================================
CREATE TABLE "RoleReady".training_module (
    id                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    training_id                uuid        NOT NULL REFERENCES "RoleReady".training(id) ON DELETE CASCADE,
    title                      text        NOT NULL,
    description                text,
    module_type                text        NOT NULL
                               CHECK (module_type IN (
                                   'video', 'audio', 'document', 'quiz',
                                   'infographic', 'mindmap', 'summary'
                               )),
    sort_order                 integer     NOT NULL DEFAULT 0,
    -- Content resolution (all nullable):
    --   content_url  → external resource (video URL, doc link, etc.)
    --   content_body → inline content (quiz JSON, reading material)
    --   Neither      → resolve from parent project asset table via module_type
    content_url                text,
    content_body               text,
    is_required                boolean     NOT NULL DEFAULT true,
    estimated_duration_minutes integer,
    created_at                 timestamptz NOT NULL DEFAULT now(),
    updated_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_training_module_training_id ON "RoleReady".training_module(training_id);
CREATE INDEX idx_training_module_sort        ON "RoleReady".training_module(training_id, sort_order);

-- =============================================================
-- 3. training_assignment
-- =============================================================
CREATE TABLE "RoleReady".training_assignment (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    training_id  uuid        NOT NULL REFERENCES "RoleReady".training(id) ON DELETE CASCADE,
    user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    assigned_by  uuid        NOT NULL REFERENCES auth.users(id),
    status       text        NOT NULL DEFAULT 'assigned'
                              CHECK (status IN ('assigned', 'in_progress', 'completed')),
    due_date     timestamptz,
    started_at   timestamptz,
    completed_at timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (training_id, user_id)
);

CREATE INDEX idx_training_assignment_training_id ON "RoleReady".training_assignment(training_id);
CREATE INDEX idx_training_assignment_user_id     ON "RoleReady".training_assignment(user_id);
CREATE INDEX idx_training_assignment_status      ON "RoleReady".training_assignment(status);

-- =============================================================
-- 4. module_progress
-- =============================================================
CREATE TABLE "RoleReady".module_progress (
    id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id         uuid        NOT NULL REFERENCES "RoleReady".training_assignment(id) ON DELETE CASCADE,
    module_id             uuid        NOT NULL REFERENCES "RoleReady".training_module(id) ON DELETE CASCADE,
    status                text        NOT NULL DEFAULT 'not_started'
                                      CHECK (status IN ('not_started', 'in_progress', 'completed')),
    progress_pct          smallint    NOT NULL DEFAULT 0
                                      CHECK (progress_pct BETWEEN 0 AND 100),
    -- Video / audio playback position
    last_position_seconds integer,
    -- Quiz scoring
    score                 smallint,
    max_score             smallint,
    attempts              integer     NOT NULL DEFAULT 0,
    started_at            timestamptz,
    completed_at          timestamptz,
    updated_at            timestamptz NOT NULL DEFAULT now(),
    UNIQUE (assignment_id, module_id)
);

CREATE INDEX idx_module_progress_assignment_id ON "RoleReady".module_progress(assignment_id);
CREATE INDEX idx_module_progress_module_id     ON "RoleReady".module_progress(module_id);

-- =============================================================
-- 5. project_video
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

-- =============================================================
-- 6. RLS — training
-- =============================================================
ALTER TABLE "RoleReady".training ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can view trainings"
    ON "RoleReady".training FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM "RoleReady".project p
            WHERE p.id = training.project_id
              AND public.is_org_member(p.organization_id)
        )
    );

CREATE POLICY "org admins can create trainings"
    ON "RoleReady".training FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM "RoleReady".project p
            WHERE p.id = training.project_id
              AND public.is_org_admin(p.organization_id)
        )
    );

CREATE POLICY "org admins can update trainings"
    ON "RoleReady".training FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM "RoleReady".project p
            WHERE p.id = training.project_id
              AND public.is_org_admin(p.organization_id)
        )
    );

CREATE POLICY "org admins can delete trainings"
    ON "RoleReady".training FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM "RoleReady".project p
            WHERE p.id = training.project_id
              AND public.is_org_admin(p.organization_id)
        )
    );

-- =============================================================
-- 7. RLS — training_module
-- =============================================================
ALTER TABLE "RoleReady".training_module ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can view training modules"
    ON "RoleReady".training_module FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM "RoleReady".training t
            JOIN "RoleReady".project p ON p.id = t.project_id
            WHERE t.id = training_module.training_id
              AND public.is_org_member(p.organization_id)
        )
    );

CREATE POLICY "org admins can create training modules"
    ON "RoleReady".training_module FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM "RoleReady".training t
            JOIN "RoleReady".project p ON p.id = t.project_id
            WHERE t.id = training_module.training_id
              AND public.is_org_admin(p.organization_id)
        )
    );

CREATE POLICY "org admins can update training modules"
    ON "RoleReady".training_module FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM "RoleReady".training t
            JOIN "RoleReady".project p ON p.id = t.project_id
            WHERE t.id = training_module.training_id
              AND public.is_org_admin(p.organization_id)
        )
    );

CREATE POLICY "org admins can delete training modules"
    ON "RoleReady".training_module FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM "RoleReady".training t
            JOIN "RoleReady".project p ON p.id = t.project_id
            WHERE t.id = training_module.training_id
              AND public.is_org_admin(p.organization_id)
        )
    );

-- =============================================================
-- 8. RLS — training_assignment
-- =============================================================
ALTER TABLE "RoleReady".training_assignment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can view own assignments"
    ON "RoleReady".training_assignment FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "org admins can view all assignments"
    ON "RoleReady".training_assignment FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM "RoleReady".training t
            JOIN "RoleReady".project p ON p.id = t.project_id
            WHERE t.id = training_assignment.training_id
              AND public.is_org_admin(p.organization_id)
        )
    );

CREATE POLICY "org admins can create assignments"
    ON "RoleReady".training_assignment FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM "RoleReady".training t
            JOIN "RoleReady".project p ON p.id = t.project_id
            WHERE t.id = training_assignment.training_id
              AND public.is_org_admin(p.organization_id)
        )
    );

CREATE POLICY "org admins can update assignments"
    ON "RoleReady".training_assignment FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM "RoleReady".training t
            JOIN "RoleReady".project p ON p.id = t.project_id
            WHERE t.id = training_assignment.training_id
              AND public.is_org_admin(p.organization_id)
        )
    );

CREATE POLICY "users can update own assignment status"
    ON "RoleReady".training_assignment FOR UPDATE
    USING (user_id = auth.uid());

CREATE POLICY "org admins can delete assignments"
    ON "RoleReady".training_assignment FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM "RoleReady".training t
            JOIN "RoleReady".project p ON p.id = t.project_id
            WHERE t.id = training_assignment.training_id
              AND public.is_org_admin(p.organization_id)
        )
    );

-- =============================================================
-- 9. RLS — module_progress
-- =============================================================
ALTER TABLE "RoleReady".module_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can view own progress"
    ON "RoleReady".module_progress FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM "RoleReady".training_assignment ta
            WHERE ta.id = module_progress.assignment_id
              AND ta.user_id = auth.uid()
        )
    );

CREATE POLICY "users can insert own progress"
    ON "RoleReady".module_progress FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM "RoleReady".training_assignment ta
            WHERE ta.id = module_progress.assignment_id
              AND ta.user_id = auth.uid()
        )
    );

CREATE POLICY "users can update own progress"
    ON "RoleReady".module_progress FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM "RoleReady".training_assignment ta
            WHERE ta.id = module_progress.assignment_id
              AND ta.user_id = auth.uid()
        )
    );

CREATE POLICY "org admins can view all progress"
    ON "RoleReady".module_progress FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM "RoleReady".training_assignment ta
            JOIN "RoleReady".training t ON t.id = ta.training_id
            JOIN "RoleReady".project p ON p.id = t.project_id
            WHERE ta.id = module_progress.assignment_id
              AND public.is_org_admin(p.organization_id)
        )
    );

-- =============================================================
-- 10. Grants — authenticated role (Realtime + direct queries)
-- =============================================================
GRANT SELECT ON "RoleReady".training            TO authenticated;
GRANT SELECT ON "RoleReady".training_module     TO authenticated;
GRANT SELECT, UPDATE ON "RoleReady".training_assignment TO authenticated;
GRANT SELECT, INSERT, UPDATE ON "RoleReady".module_progress TO authenticated;

-- =============================================================
-- 11. Realtime — publish assignment & progress tables
-- =============================================================
ALTER TABLE "RoleReady".training_assignment REPLICA IDENTITY FULL;
ALTER TABLE "RoleReady".module_progress     REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE "RoleReady".training_assignment;
ALTER PUBLICATION supabase_realtime ADD TABLE "RoleReady".module_progress;

-- =============================================================
-- 12. Security fixes on existing tables
-- =============================================================

-- Remove overly permissive anon INSERT policy on embedding
DROP POLICY IF EXISTS "Enable insert for anon" ON "RoleReady".embedding;

-- Add missing SELECT RLS policies on asset tables
-- (RLS was enabled but no policies existed — only service_role could access)

CREATE POLICY "org members can view project summaries"
    ON "RoleReady".project_summary FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM "RoleReady".project p
            WHERE p.id = project_summary.project_id
              AND public.is_org_member(p.organization_id)
        )
    );

CREATE POLICY "org members can view project infographics"
    ON "RoleReady".project_infographic FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM "RoleReady".project p
            WHERE p.id = project_infographic.project_id
              AND public.is_org_member(p.organization_id)
        )
    );

CREATE POLICY "org members can view project mindmaps"
    ON "RoleReady".project_mindmap FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM "RoleReady".project p
            WHERE p.id = project_mindmap.project_id
              AND public.is_org_member(p.organization_id)
        )
    );

CREATE POLICY "org members can view project audio"
    ON "RoleReady".project_audio FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM "RoleReady".project p
            WHERE p.id = project_audio.project_id
              AND public.is_org_member(p.organization_id)
        )
    );

CREATE POLICY "org members can view project videos"
    ON "RoleReady".project_video FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM "RoleReady".project p
            WHERE p.id = project_video.project_id
              AND public.is_org_member(p.organization_id)
        )
    );

CREATE POLICY "org members can view documents"
    ON "RoleReady".document FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM "RoleReady".project p
            WHERE p.id = document.project_id
              AND public.is_org_member(p.organization_id)
        )
    );

COMMIT;
