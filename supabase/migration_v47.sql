-- ============================================================
-- RemoteJobs44 — Migration v47
-- Run AFTER migration_v46_application_notes.sql in: Supabase Dashboard → SQL Editor.
--
-- Two changes, both applied to production on 2026-06-18:
--
-- 1) Job read fix — the mobile app selects apply_url + apply_email, but those
--    two columns had no column-level SELECT grant for anon/authenticated. With
--    column-level grants in force, PostgREST rejects the WHOLE jobs query with
--    403, so the mobile feed loaded zero live jobs. Grant the two columns.
--
-- 2) Auto-archive — close jobs 45 days after posting and move them to an
--    archived state (is_active=false + archived_at stamp). Nothing is deleted,
--    so it is fully reversible. A daily pg_cron job runs the sweep.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- 1) -----------------------------------------------------------------------
-- Apply links are public job info (you need them to apply); grant read access.
grant select (apply_url, apply_email) on public.jobs to authenticated, anon;

-- 2) -----------------------------------------------------------------------
-- archived_at marks WHEN a job was auto-archived (distinct from a manual
-- is_active=false). Nothing is deleted, so archiving is reversible.
alter table public.jobs add column if not exists archived_at timestamptz;

-- Speeds the live feed (is_active + order by posted_at) and the archive sweep.
create index if not exists jobs_active_posted_at_idx
  on public.jobs (posted_at desc) where is_active;

-- Closes every active job whose posting is older than `max_age_days` and stamps
-- archived_at. Returns the number of jobs archived. SECURITY DEFINER so the
-- scheduled job (and admins) can run it regardless of RLS. EXECUTE is locked
-- away from the public PostgREST surface (anon/authenticated).
create or replace function public.archive_stale_jobs(max_age_days integer default 45)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update public.jobs
     set is_active = false,
         archived_at = now()
   where is_active = true
     and posted_at < now() - make_interval(days => max_age_days);
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.archive_stale_jobs(integer) from public, anon, authenticated;

-- Daily sweep at 03:00 UTC. Re-runnable: unschedule any existing job first so
-- we never create a duplicate.
create extension if not exists pg_cron;

select cron.unschedule('archive-stale-jobs')
where exists (select 1 from cron.job where jobname = 'archive-stale-jobs');

select cron.schedule('archive-stale-jobs', '0 3 * * *', $$select public.archive_stale_jobs(45)$$);

-- One-time backfill of the existing >45-day backlog (archived 25,848 rows on
-- 2026-06-18). Safe to re-run — it only ever touches still-active stale jobs.
select public.archive_stale_jobs(45) as jobs_archived;
