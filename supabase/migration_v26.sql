-- migration_v26.sql
-- Restore the per-job application counter.
--
-- jobs.applications (integer, default 0) has existed since the initial
-- schema, and POST /api/applications calls rpc('increment_applications')
-- after every successful apply -- but that function was never defined in
-- the database, so every call returned PGRST202 and the route's (faulty)
-- try/catch swallowed it. Net: jobs.applications stayed 0 across all rows
-- despite real applications. Define the function and backfill from truth.
--
-- Applied to the live DB in-session via MCP (same as v23/v24/v25).

create or replace function public.increment_applications(job_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.jobs
     set applications = coalesce(applications, 0) + 1
   where id = job_id;
$$;

-- Only the service-role ingest/apply path should ever touch this counter;
-- don't expose it to anon/authenticated (would let any user inflate any
-- job's count via PostgREST RPC).
revoke all on function public.increment_applications(uuid) from public;
revoke all on function public.increment_applications(uuid) from anon;
revoke all on function public.increment_applications(uuid) from authenticated;
grant execute on function public.increment_applications(uuid) to service_role;

-- Idempotent backfill: recompute each job's counter from the applications
-- table. Safe to re-run -- it sets the absolute count, not a delta.
update public.jobs j
   set applications = sub.cnt
  from (select job_id, count(*)::int as cnt
          from public.applications
         group by job_id) sub
 where sub.job_id = j.id
   and j.applications is distinct from sub.cnt;
