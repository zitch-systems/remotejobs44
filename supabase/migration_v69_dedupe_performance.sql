-- migration_v69_dedupe_performance.sql
-- Make the nightly dedupe_jobs() sweep survive a large jobs table.
--
-- Symptom in production — every 06:00 UTC run observed from 2026-07-29 to
-- 2026-08-08 logged:
--     cron.daily.dedupe_failed — "canceling statement due to statement timeout"
-- and the /api/cron/daily function then blew its own budget. dedupe runs as
-- TASK 3.7, ahead of TASK 4, so a run that burned the budget here also
-- starved the Pro job-alert emails: they silently stopped going out on any
-- night this fired.
--
-- Cause: dedupe_jobs() ranked EVERY active job with a window function whose
-- PARTITION BY keys are expressions — lower(btrim(...)) — that no index
-- covered. Postgres had to materialise and sort the whole active set on each
-- run, and past a certain table size that alone exceeds the statement
-- timeout. Raising the Vercel maxDuration (done separately in 43ddc61)
-- cannot fix this: Postgres cancels the statement on its own clock, well
-- before the function budget is reached.
--
-- Fix, in two parts:
--   1) An expression index matching the dedupe identity exactly, partial on
--      is_active — the only rows the sweep ever looks at. The planner can
--      then reach the identity groups through an ordered index scan instead
--      of sorting the entire table.
--   2) Bound the work. Find the duplicated identity groups first (cheap once
--      the index exists), cap how many are collapsed per run, and rank only
--      the rows inside those groups rather than every active job.
--
-- Semantics are unchanged: the best row per (title, company, location) is
-- kept — most engagement first, then freshest — and the rest are deactivated
-- (is_active = false, never deleted, fully reversible). Distinct locations
-- are still preserved. The zero-argument signature is kept deliberately so
-- /api/cron/daily's supabase.rpc('dedupe_jobs') keeps resolving unchanged and
-- no application redeploy is coupled to this migration.

-- 1) ------------------------------------------------------------------------
-- The dedupe identity, indexed. The three expressions below must stay
-- byte-identical to the ones in dedupe_jobs() or the planner will not match
-- the index. title/company/location are all NOT NULL (see schema.sql), so the
-- coalesce on location is belt-and-braces carried over from migration_v30.
--
-- Partial on is_active because the sweep — and the duplicate-group probe that
-- now drives it — only ever consider active rows, which keeps the index small.
--
-- NOTE: this builds with a normal ACCESS SHARE-blocking lock. On the current
-- table size that is a few seconds. If you are applying this by hand against a
-- much larger table and NOT inside a transaction, prefer:
--     create index concurrently if not exists jobs_dedupe_identity_idx ...
-- CONCURRENTLY cannot be used here because migrations in this directory are
-- applied as a single transactional script.
create index if not exists jobs_dedupe_identity_idx
  on public.jobs (
    lower(btrim(title)),
    lower(btrim(company)),
    lower(btrim(coalesce(location, '')))
  )
  where is_active;

-- 2) ------------------------------------------------------------------------
-- Bounded, index-backed rewrite. Same name, same zero arguments, same return
-- (count of rows deactivated), same keep-the-best-row rule.
create or replace function public.dedupe_jobs()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- Ceiling on identity groups collapsed per invocation, so one run can never
  -- grow without bound as the table grows. The sweep is nightly and
  -- idempotent, so a backlog bigger than this simply drains over the
  -- following nights instead of timing out and achieving nothing.
  max_groups constant integer := 5000;
  affected   integer;
begin
  with dupe_group as (
    -- Which identities actually have more than one active row? This is the
    -- only pass over the full active set, and jobs_dedupe_identity_idx covers
    -- it, so it is a grouped index scan rather than a sort of the table.
    select lower(btrim(title))                  as k_title,
           lower(btrim(company))                as k_company,
           lower(btrim(coalesce(location, ''))) as k_location
      from public.jobs
     where is_active
     group by 1, 2, 3
    having count(*) > 1
     limit max_groups
  ),
  ranked as (
    -- Rank only inside the duplicated groups. Every non-duplicated job — the
    -- overwhelming majority — is never touched by the window function now.
    select j.id,
           row_number() over (
             partition by lower(btrim(j.title)),
                          lower(btrim(j.company)),
                          lower(btrim(coalesce(j.location, '')))
             order by (coalesce(j.views, 0) + coalesce(j.applications, 0)) desc,
                      j.last_seen_at desc nulls last,
                      j.posted_at    desc nulls last,
                      j.created_at   desc nulls last,
                      j.id
           ) as rn
      from public.jobs j
      join dupe_group g
        on lower(btrim(j.title))                  = g.k_title
       and lower(btrim(j.company))                = g.k_company
       and lower(btrim(coalesce(j.location, ''))) = g.k_location
     where j.is_active
  ),
  upd as (
    update public.jobs j
       set is_active = false, updated_at = now()
      from ranked r
     where j.id = r.id and r.rn > 1
    returning j.id
  )
  select count(*) into affected from upd;
  return affected;
end;
$$;

-- Unchanged from migration_v30: EXECUTE stays restricted to service_role so
-- the sweep can't be triggered through the public PostgREST RPC endpoint.
revoke all     on function public.dedupe_jobs() from public, anon, authenticated;
grant  execute on function public.dedupe_jobs() to service_role;

notify pgrst, 'reload schema';
