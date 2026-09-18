-- =============================================================
-- Curriculum Structure: lesson / step hierarchy for Duolingo-style
-- learning path with unlock conditions.
--
-- New tables (all in "RoleReady" schema):
--   training_lesson      – ordered lesson within a training
--   lesson_step          – ordered step within a lesson
--   lesson_dependency    – prerequisite relationships between lessons
-- =============================================================

BEGIN;

-- =============================================================
-- 1. training_lesson
-- =============================================================
CREATE TABLE "RoleReady".training_lesson (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    training_id     uuid        NOT NULL REFERENCES "RoleReady".training(id) ON DELETE CASCADE,
    title           text        NOT NULL,
    description     text,
    sort_order      integer     NOT NULL DEFAULT 0,
    is_required     boolean     NOT NULL DEFAULT true,
    unlock_rule     text        NOT NULL DEFAULT 'sequential'
                                CHECK (unlock_rule IN ('sequential', 'manual', 'always_open')),
    estimated_duration_minutes integer,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_training_lesson_training_id ON "RoleReady".training_lesson(training_id);
CREATE INDEX idx_training_lesson_sort        ON "RoleReady".training_lesson(training_id, sort_order);

-- =============================================================
-- 2. lesson_step
-- =============================================================
CREATE TABLE "RoleReady".lesson_step (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    lesson_id       uuid        NOT NULL REFERENCES "RoleReady".training_lesson(id) ON DELETE CASCADE,
    title           text        NOT NULL,
    description     text,
    step_type       text        NOT NULL
                                CHECK (step_type IN (
                                    'video', 'audio', 'document', 'quiz',
                                    'infographic', 'mindmap', 'summary', 'exercise'
                                )),
    sort_order      integer     NOT NULL DEFAULT 0,
    content_url     text,
    content_body    text,
    is_required     boolean     NOT NULL DEFAULT true,
    is_scorable     boolean     NOT NULL DEFAULT false,
    max_score       smallint,
    pass_threshold  smallint    DEFAULT 70
                                CHECK (pass_threshold IS NULL OR pass_threshold BETWEEN 0 AND 100),
    estimated_duration_minutes integer,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lesson_step_lesson_id ON "RoleReady".lesson_step(lesson_id);
CREATE INDEX idx_lesson_step_sort      ON "RoleReady".lesson_step(lesson_id, sort_order);

-- =============================================================
-- 3. lesson_dependency (prerequisite graph)
-- =============================================================
CREATE TABLE "RoleReady".lesson_dependency (
    id                  uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
    lesson_id           uuid    NOT NULL REFERENCES "RoleReady".training_lesson(id) ON DELETE CASCADE,
    prerequisite_id     uuid    NOT NULL REFERENCES "RoleReady".training_lesson(id) ON DELETE CASCADE,
    UNIQUE (lesson_id, prerequisite_id),
    CHECK (lesson_id <> prerequisite_id)
);

CREATE INDEX idx_lesson_dependency_lesson       ON "RoleReady".lesson_dependency(lesson_id);
CREATE INDEX idx_lesson_dependency_prerequisite ON "RoleReady".lesson_dependency(prerequisite_id);

-- =============================================================
-- 4. Backfill: convert existing training_module rows to lessons
--    Each module becomes a single-step lesson.
-- =============================================================
INSERT INTO "RoleReady".training_lesson (
    id, training_id, title, description, sort_order,
    is_required, unlock_rule, estimated_duration_minutes,
    created_at, updated_at
)
SELECT
    gen_random_uuid(),
    tm.training_id,
    tm.title,
    tm.description,
    tm.sort_order,
    tm.is_required,
    'sequential',
    tm.estimated_duration_minutes,
    tm.created_at,
    tm.updated_at
FROM "RoleReady".training_module tm
ORDER BY tm.training_id, tm.sort_order;

-- Insert corresponding lesson_steps referencing the new lessons.
-- We match by training_id + sort_order since that's unique per training.
INSERT INTO "RoleReady".lesson_step (
    id, lesson_id, title, description, step_type,
    sort_order, content_url, content_body, is_required,
    is_scorable, max_score, estimated_duration_minutes,
    created_at, updated_at
)
SELECT
    gen_random_uuid(),
    tl.id,
    tm.title,
    tm.description,
    tm.module_type,
    0,
    tm.content_url,
    tm.content_body,
    true,
    CASE WHEN tm.module_type = 'quiz' THEN true ELSE false END,
    NULL,
    tm.estimated_duration_minutes,
    tm.created_at,
    tm.updated_at
FROM "RoleReady".training_module tm
JOIN "RoleReady".training_lesson tl
  ON tl.training_id = tm.training_id
 AND tl.sort_order = tm.sort_order
 AND tl.title = tm.title;

-- =============================================================
-- 5. Add lesson_id reference to module_progress for migration period
-- =============================================================
ALTER TABLE "RoleReady".module_progress
    ADD COLUMN lesson_id uuid REFERENCES "RoleReady".training_lesson(id) ON DELETE SET NULL,
    ADD COLUMN step_id   uuid REFERENCES "RoleReady".lesson_step(id) ON DELETE SET NULL;

-- =============================================================
-- 6. RLS — training_lesson
-- =============================================================
ALTER TABLE "RoleReady".training_lesson ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can view training lessons"
    ON "RoleReady".training_lesson FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM "RoleReady".training t
            JOIN "RoleReady".project p ON p.id = t.project_id
            WHERE t.id = training_lesson.training_id
              AND public.is_org_member(p.organization_id)
        )
    );

CREATE POLICY "org admins can manage training lessons"
    ON "RoleReady".training_lesson FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM "RoleReady".training t
            JOIN "RoleReady".project p ON p.id = t.project_id
            WHERE t.id = training_lesson.training_id
              AND public.is_org_admin(p.organization_id)
        )
    );

-- =============================================================
-- 7. RLS — lesson_step
-- =============================================================
ALTER TABLE "RoleReady".lesson_step ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can view lesson steps"
    ON "RoleReady".lesson_step FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM "RoleReady".training_lesson tl
            JOIN "RoleReady".training t ON t.id = tl.training_id
            JOIN "RoleReady".project p ON p.id = t.project_id
            WHERE tl.id = lesson_step.lesson_id
              AND public.is_org_member(p.organization_id)
        )
    );

CREATE POLICY "org admins can manage lesson steps"
    ON "RoleReady".lesson_step FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM "RoleReady".training_lesson tl
            JOIN "RoleReady".training t ON t.id = tl.training_id
            JOIN "RoleReady".project p ON p.id = t.project_id
            WHERE tl.id = lesson_step.lesson_id
              AND public.is_org_admin(p.organization_id)
        )
    );

-- =============================================================
-- 8. RLS — lesson_dependency
-- =============================================================
ALTER TABLE "RoleReady".lesson_dependency ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can view lesson dependencies"
    ON "RoleReady".lesson_dependency FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM "RoleReady".training_lesson tl
            JOIN "RoleReady".training t ON t.id = tl.training_id
            JOIN "RoleReady".project p ON p.id = t.project_id
            WHERE tl.id = lesson_dependency.lesson_id
              AND public.is_org_member(p.organization_id)
        )
    );

CREATE POLICY "org admins can manage lesson dependencies"
    ON "RoleReady".lesson_dependency FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM "RoleReady".training_lesson tl
            JOIN "RoleReady".training t ON t.id = tl.training_id
            JOIN "RoleReady".project p ON p.id = t.project_id
            WHERE tl.id = lesson_dependency.lesson_id
              AND public.is_org_admin(p.organization_id)
        )
    );

-- =============================================================
-- 9. Grants
-- =============================================================
GRANT SELECT ON "RoleReady".training_lesson   TO authenticated;
GRANT SELECT ON "RoleReady".lesson_step       TO authenticated;
GRANT SELECT ON "RoleReady".lesson_dependency TO authenticated;

COMMIT;
