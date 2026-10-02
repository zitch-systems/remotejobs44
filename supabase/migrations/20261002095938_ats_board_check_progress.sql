-- A successful empty board has no jobs whose last_seen_at can advance.
-- Track board-level completion independently so empty/filtered boards cannot
-- monopolise the oldest-first queue. Never fabricate a job freshness timestamp.
create table if not exists public.ats_board_checks (
  source_url text primary key,
  checked_at timestamptz not null,
  next_check_at timestamptz not null
);
alter table public.ats_board_checks enable row level security;
revoke all on public.ats_board_checks from public, anon, authenticated;
grant select, insert, update, delete on public.ats_board_checks to service_role;

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
       select 1 from public.ats_board_checks c
        where c.source_url = stats.source_url and c.next_check_at > now()
     ) and not exists (
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
