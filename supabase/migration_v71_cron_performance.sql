-- migration_v71_cron_performance.sql
-- Bound the two large daily freshness scans and make stale ATS board discovery
-- use a selective index. Production logs on 2026-09-16/17 showed both paths
-- being cancelled by the database statement timeout.

-- The daily cron selects the oldest matching IDs before updating them in
-- 500-row batches. Partial indexes keep those probes small as the jobs table
-- grows.
create index if not exists jobs_freshness_is_new_posted_idx
  on public.jobs (posted_at, id)
  where is_new = true;

create index if not exists jobs_freshness_active_last_seen_idx
  on public.jobs (last_seen_at, id)
  where is_active = true;

-- migration_v70 indexed every non-null source_url, including aggregator feeds.
-- ATS rows are consistently stored with source='api', so index only the rows
-- the ATS refresh RPC can return.
create index if not exists jobs_ats_api_source_last_seen_idx
  on public.jobs (source_url, last_seen_at)
  where source = 'api' and source_url is not null;

drop index if exists public.jobs_ats_source_url_last_seen_idx;

create or replace function public.stale_ats_boards(p_limit integer default 150)
returns table (
  source_url text,
  job_count  integer,
  last_seen  timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select j.source_url,
         count(*)::integer   as job_count,
         max(j.last_seen_at) as last_seen
    from public.jobs j
   where j.source = 'api'
     and j.source_url is not null
     and j.source_url ~* '^https?://(boards-api\.greenhouse\.io/|api\.lever\.co/|api\.ashbyhq\.com/|apply\.workable\.com/|api\.smartrecruiters\.com/|[a-z0-9._-]+\.recruitee\.com/|[a-z0-9._-]+\.jobs\.personio\.de/|[a-z0-9._-]+\.bamboohr\.com/|[a-z0-9._-]+\.breezy\.hr/)'
   group by j.source_url
   order by max(j.last_seen_at) asc nulls first
   limit greatest(1, least(coalesce(p_limit, 150), 2000));
$$;

revoke all on function public.stale_ats_boards(integer)
  from public, anon, authenticated;
grant execute on function public.stale_ats_boards(integer) to service_role;

notify pgrst, 'reload schema';
