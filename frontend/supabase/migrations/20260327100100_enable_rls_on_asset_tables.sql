-- =============================================================
-- Fix: enable RLS on asset tables that had policies added
-- but RLS was never enabled.
--
-- project_mindmap, project_audio, project_video had SELECT
-- policies created in 20260327100000 but the policies are
-- inert without ALTER TABLE ... ENABLE ROW LEVEL SECURITY.
-- =============================================================

ALTER TABLE "RoleReady".project_mindmap ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RoleReady".project_audio   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RoleReady".project_video   ENABLE ROW LEVEL SECURITY;
