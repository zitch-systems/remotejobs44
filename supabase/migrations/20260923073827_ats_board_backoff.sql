-- Suppress confirmed removed ATS boards temporarily so recurring 404s do not
-- consume the entire daily refresh budget. Retrying after seven days detects
-- restored boards; existing jobs remain untouched and age out normally.
create table if not exists public.ats_board_backoff (
  source_url text primary key,
  retry_after timestamptz not null,
  last_failed_at timestamptz not null default now(),
  last_error text not null
);
alter table public.ats_board_backoff enable row level security;
revoke all on public.ats_board_backoff from public, anon, authenticated;
grant select, insert, update, delete on public.ats_board_backoff to service_role;

-- migration_v72_stale_ats_boards_skip_scan.sql
--
-- v71 narrowed the index to source='api', but stale_ats_boards() still read
-- every ATS job, grouped ~144k rows, sorted every group, and only then applied
-- p_limit. Production's service-role statement timeout cancels that aggregate.
--
-- Walk the existing (source_url, last_seen_at) partial index one distinct
-- source_url at a time instead. Each recursive step is an index seek to the
-- next board plus an index-backed MAX probe. We sort only the resulting board
-- summaries and count rows only for the selected output batch.

create or replace function public.stale_ats_boards(p_limit integer default 150)
returns table (
  source_url text,
  job_count  integer,
  last_seen  timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with recursive board_stats(source_url, last_seen) as (
    select first_board.source_url,
           (select max(j2.last_seen_at)
              from public.jobs j2
             where j2.source = 'api'
               and j2.source_url = first_board.source_url)
      from lateral (
        select j.source_url
          from public.jobs j
         where j.source = 'api'
           and j.source_url is not null
         order by j.source_url
         limit 1
      ) first_board

    union all

    select next_board.source_url,
           (select max(j2.last_seen_at)
              from public.jobs j2
             where j2.source = 'api'
               and j2.source_url = next_board.source_url)
      from board_stats stats
      cross join lateral (
        select j.source_url
          from public.jobs j
         where j.source = 'api'
           and j.source_url is not null
           and j.source_url > stats.source_url
         order by j.source_url
         limit 1
      ) next_board
  ),
  selected as materialized (
    select stats.source_url, stats.last_seen
      from board_stats stats
     where not exists (
       select 1 from public.ats_board_backoff b
        where b.source_url = stats.source_url and b.retry_after > now()
     )
       and stats.source_url ~* '^https?://(boards-api\.greenhouse\.io/|api\.lever\.co/|api\.ashbyhq\.com/|apply\.workable\.com/|api\.smartrecruiters\.com/|[a-z0-9._-]+\.recruitee\.com/|[a-z0-9._-]+\.jobs\.personio\.de/|[a-z0-9._-]+\.bamboohr\.com/|[a-z0-9._-]+\.breezy\.hr/)'
     order by stats.last_seen asc nulls first
     limit greatest(1, least(coalesce(p_limit, 150), 2000))
  )
  select selected.source_url,
         (select count(*)::integer
            from public.jobs counted
           where counted.source = 'api'
             and counted.source_url = selected.source_url) as job_count,
         selected.last_seen
    from selected
   order by selected.last_seen asc nulls first;
$$;

revoke all on function public.stale_ats_boards(integer)
  from public, anon, authenticated;
grant execute on function public.stale_ats_boards(integer) to service_role;

notify pgrst, 'reload schema';
