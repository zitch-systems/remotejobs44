-- migration_v27.sql
-- Track when a job was last seen in an ingest feed, and key the 60-day
-- "stale -> is_active=false" sweep off that instead of posted_at.
--
-- Before: the daily cron deactivated any job with posted_at older than 60
-- days. A posting an ATS/feed keeps listing would still be hidden after
-- 60 days and (since migration_v25 made ingest ON CONFLICT DO NOTHING)
-- never came back. Now ingest bumps last_seen_at every time a posting
-- appears in a feed, and the sweep deactivates only jobs not seen in any
-- feed for 60 days -- so still-listed jobs stay visible.
--
-- Applied to the live DB in-session via MCP (same as v23/v24/v25).

alter table public.jobs
  add column if not exists last_seen_at timestamptz;

-- Backfill existing rows: best-known "last seen" is the posting date.
update public.jobs
   set last_seen_at = coalesce(last_seen_at, posted_at, created_at, now())
 where last_seen_at is null;

alter table public.jobs
  alter column last_seen_at set default now();

create index if not exists jobs_last_seen_at_idx
  on public.jobs (last_seen_at);
