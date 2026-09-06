-- migration_v70_stale_ats_boards.sql
-- Create the stale_ats_boards() function that lib/ats-refresh.ts has been
-- calling since the ATS refresh cron was added.
--
-- Symptom: /api/cron/ats-refresh returns
--     {"success":true,"boardsConsidered":0,"boardsRefreshed":0,"added":0,
--      "reactivated":0,"errors":0,"timedOut":false}
-- on every run, and the public job count keeps shrinking.
--
-- Cause: refreshStaleATSBoards() opens with
--     supabase.rpc('stale_ats_boards', { p_limit: maxBoards })
-- and that function exists in no migration in this directory — the module
-- shipped without its SQL half. PostgREST answers PGRST202 ("Could not find
-- the function public.stale_ats_boards(p_limit) in the schema cache"), the
-- caller logWarns and returns its zeroed result struct, and the route reports
-- success. So the entire ATS refresh path — the thing that keeps the ~34k
-- source='api' postings alive — has never done anything.
--
-- Why that shrinks the catalogue: the daily cron deactivates every job whose
-- last_seen_at is older than 60 days (app/api/cron/daily TASK 3). ATS jobs are
-- inserted once by the admin company-import / companies-refresh flow and are
-- re-affirmed by nothing else, so each one is retired 60 days after insert
-- even while the company still lists it. That is the "jobs not syncing"
-- report: the aggregator feeds keep topping up a few hundred rows a day while
-- the sweep quietly retires tens of thousands.
--
-- What the function returns: one row per distinct ATS board URL found in
-- jobs.source_url, oldest-seen first, so a budget-limited caller always works
-- on the boards closest to the 60-day cliff.

-- 1) ------------------------------------------------------------------------
-- Index for the grouped scan below. Partial on the ATS-board predicate so it
-- stays small (the aggregator feeds share a handful of source_url values and
-- are excluded by the same regex the function uses).
create index if not exists jobs_ats_source_url_last_seen_idx
  on public.jobs (source_url, last_seen_at)
  where source_url is not null;

-- 2) ------------------------------------------------------------------------
-- The board list.
--
-- The host alternation MUST stay in step with parseATSApiUrl() in
-- lib/ats-refresh.ts: that function is the reverse of each fetcher's URL
-- builder in lib/ats-engine.ts and returns null for any shape it doesn't
-- recognise. A URL matched here but not there costs a wasted row in the
-- p_limit window (the caller skips it without fetching); a URL matched there
-- but not here is a board that never gets refreshed. Keep both lists together.
--
-- Rows are NOT filtered on is_active: a board whose postings the sweep already
-- retired is exactly the one that needs revisiting, because markSeen() flips
-- still-listed postings back to is_active = true.
--
-- Output column names avoid `last_seen_at` deliberately — in a LANGUAGE sql
-- function the RETURNS TABLE columns are visible as names inside the body, and
-- reusing a real column name there makes every reference ambiguous.
create or replace function public.stale_ats_boards(p_limit integer default 150)
returns table (
  source_url  text,
  job_count   integer,
  last_seen   timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select j.source_url,
         count(*)::integer      as job_count,
         max(j.last_seen_at)    as last_seen
    from public.jobs j
   where j.source_url is not null
     and j.source_url ~* '^https?://(boards-api\.greenhouse\.io/|api\.lever\.co/|api\.ashbyhq\.com/|apply\.workable\.com/|api\.smartrecruiters\.com/|[a-z0-9._-]+\.recruitee\.com/|[a-z0-9._-]+\.jobs\.personio\.de/|[a-z0-9._-]+\.bamboohr\.com/|[a-z0-9._-]+\.breezy\.hr/)'
   group by j.source_url
   -- nulls first: a board with no last_seen_at at all is the most stale thing
   -- we have, not the freshest (which is what a plain `asc` would imply).
   order by max(j.last_seen_at) asc nulls first
   limit greatest(1, least(coalesce(p_limit, 150), 2000));
$$;

-- Same posture as dedupe_jobs(): the cron reaches this through the
-- service-role key, so EXECUTE stays off the public PostgREST RPC endpoint.
revoke all     on function public.stale_ats_boards(integer) from public, anon, authenticated;
grant  execute on function public.stale_ats_boards(integer) to service_role;

notify pgrst, 'reload schema';
