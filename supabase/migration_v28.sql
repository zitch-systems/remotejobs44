-- migration_v28.sql
-- Allow job_sources.status = 'paused'.
--
-- The admin "pause source" feature (app/api/admin/sources/[id]/route.ts
-- PATCH, surfaced in /admin/sources) and the ingest pipeline both use
-- status='paused' (ingest skips paused feeds). But the live CHECK
-- constraint only permitted active/error/pending/disabled, so pausing a
-- source violated the constraint and returned 500 -- the feature silently
-- never worked. Add 'paused' to the allowed set.
--
-- Applied to the live DB in-session via MCP (same as v26/v27).

alter table public.job_sources drop constraint if exists job_sources_status_check;
alter table public.job_sources add constraint job_sources_status_check
  check (status in ('active','error','pending','disabled','paused'));
