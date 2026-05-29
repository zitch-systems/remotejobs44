-- ============================================================
-- RemoteJobs44 — Migration v16
-- Closes audit finding C-2: the direct-Supabase-REST anon-key leak
-- of apply_url and apply_email.
--
-- BEFORE this migration:
--   The Next.js layer (lib/auth/requester-plan.ts) scrubs apply_url
--   and apply_email from /api/jobs, /jobs SSR, and /jobs/[id] SSR
--   responses for anon + free callers. But a scraper can bypass the
--   Next.js layer entirely:
--
--     curl 'https://<ref>.supabase.co/rest/v1/jobs?select=*' \
--          -H "apikey: <NEXT_PUBLIC_SUPABASE_ANON_KEY>"
--
--   That request lands at PostgREST with the anon role, hits the
--   public-SELECT RLS policy (is_active=true), and returns the full
--   row including apply_url. The Pro paywall is bypassed.
--
-- AFTER this migration:
--   1. Anon and authenticated roles lose SELECT permission on the
--      apply_url + apply_email columns of public.jobs. PostgREST
--      returns 403 "permission denied for column apply_url" when a
--      direct anon/authenticated request asks for them.
--   2. A new VIEW public.jobs_public exposes every other column so
--      direct callers who legitimately need the listing data have a
--      clean endpoint to hit.
--   3. Service-role retains full access — the admin Supabase client
--      (createAdminSupabaseClient) bypasses the column grants and is
--      what /api/jobs uses to fetch apply_url for paying customers
--      after the plan check.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. View — public surface for the jobs listing
-- ────────────────────────────────────────────────────────────
-- Lists every column we want anonymous/listing-tier callers to read.
-- apply_url and apply_email are DELIBERATELY EXCLUDED — direct callers
-- who need them must authenticate as a paying user and route through
-- /api/jobs (which uses service-role behind plan gating).
--
-- security_invoker = true makes the view run with the caller's role,
-- so the underlying jobs.is_active=true RLS policy still applies.
-- Without this, the view would silently surface inactive/flagged rows
-- that the RLS policy hides at the table level.
create or replace view public.jobs_public
with (security_invoker = true)
as
  select
    id, title, company, company_id, logo,
    category, type, level, location, timezone,
    description, requirements, skills, benefits,
    salary_min, salary_max, currency,
    remote, featured, is_new, is_active,
    source, source_url, views, applications,
    posted_at, expires_at, created_at,
    -- flagged + flagged_reason + search_vector exist on the underlying
    -- table from earlier migrations (v15 added search_vector). Include
    -- them so the view is a true subset of the public columns — clients
    -- doing full-text search against jobs_public.search_vector keep
    -- working without round-tripping through the table.
    flagged, flagged_reason, search_vector
  from public.jobs;

-- Public read on the view — same audience as jobs had before.
grant select on public.jobs_public to anon, authenticated;
-- service_role inherits all on schema-level grants, but spell it out
-- for self-documenting purposes.
grant select on public.jobs_public to service_role;

-- ────────────────────────────────────────────────────────────
-- 2. Revoke direct column access on the underlying table
-- ────────────────────────────────────────────────────────────
-- This is the actual leak-closer. After these revokes any direct
-- PostgREST query against /rest/v1/jobs that mentions apply_url or
-- apply_email — or that uses ?select=* and so implicitly asks for
-- every column — returns 403 from anon/authenticated. Pro users
-- accessing the apply URL go through /api/jobs which uses the
-- service-role admin client.
--
-- These statements are idempotent — REVOKE on a permission that
-- doesn't exist is a no-op (no NOTICE, no error).
revoke select (apply_url)   on public.jobs from anon;
revoke select (apply_email) on public.jobs from anon;
revoke select (apply_url)   on public.jobs from authenticated;
revoke select (apply_email) on public.jobs from authenticated;

-- ────────────────────────────────────────────────────────────
-- 3. Re-grant SELECT on every other column so SELECT * in app code
--    still works for anon/authenticated. Without these, the column-
--    level revoke above silently removes column-level SELECT for
--    EVERY column — Postgres treats `GRANT SELECT ON table` as a
--    coarse permission, and the column-level revokes downgrade it
--    to "no columns granted". We have to re-grant the safe columns
--    explicitly.
-- ────────────────────────────────────────────────────────────
grant select (
  id, title, company, company_id, logo,
  category, type, level, location, timezone,
  description, requirements, skills, benefits,
  salary_min, salary_max, currency,
  remote, featured, is_new, is_active,
  source, source_url, views, applications,
  posted_at, expires_at, created_at,
  flagged, flagged_reason, search_vector
) on public.jobs to anon, authenticated;

-- ────────────────────────────────────────────────────────────
-- DONE ✓
-- After running this migration:
-- 1. Confirm direct REST is blocked:
--      curl -s 'https://<ref>.supabase.co/rest/v1/jobs?select=apply_url&limit=1' \
--           -H "apikey: <NEXT_PUBLIC_SUPABASE_ANON_KEY>"
--    Expected: HTTP 403 with body
--      {"code":"42501","message":"permission denied for table jobs"}
--    or "permission denied for column apply_url".
-- 2. /api/jobs and SSR pages keep working — the matching code change
--    switches their SELECT lists to omit apply_url for the anon-context
--    paths and uses the admin client for the paid-user apply URL
--    fetch.
-- ────────────────────────────────────────────────────────────
