-- =============================================================
-- Fix: add missing UNIQUE constraint on project_infographic.project_id
--
-- The table had a unique INDEX but not a UNIQUE CONSTRAINT.
-- PostgREST requires a UNIQUE constraint for on_conflict upserts.
-- Drop the index first, then add the constraint (which creates
-- its own underlying unique index).
-- =============================================================

DROP INDEX IF EXISTS "RoleReady".idx_project_infographic_project_id;

ALTER TABLE "RoleReady"."project_infographic"
  ADD CONSTRAINT project_infographic_project_id_key UNIQUE (project_id);
