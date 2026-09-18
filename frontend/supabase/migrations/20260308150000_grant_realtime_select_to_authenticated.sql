-- =============================================================
-- Grant SELECT on Realtime-enabled tables to authenticated role
--
-- The harden migration (20260301010000) revoked ALL privileges
-- from authenticated on the RoleReady schema. This was correct
-- for direct API access (the backend uses service_role), but it
-- also broke Supabase Realtime: the Realtime server evaluates
-- RLS policies using the subscriber's JWT (authenticated role),
-- so SELECT + schema USAGE are required for events to be
-- delivered to frontend subscribers.
--
-- This migration grants the minimum privileges needed for
-- Realtime to function on the project and job tables.
-- =============================================================

-- Schema usage is required before any table access
GRANT USAGE ON SCHEMA "RoleReady" TO authenticated;

-- SELECT-only on tables that have Realtime subscriptions
GRANT SELECT ON "RoleReady"."project" TO authenticated;
GRANT SELECT ON "RoleReady"."job" TO authenticated;
