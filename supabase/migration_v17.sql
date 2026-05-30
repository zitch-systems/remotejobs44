-- ============================================================
-- RemoteJobs44 — Migration v17
-- Expanded full-text search + relevance ranking.
--
-- BEFORE v17:
--   The /jobs and /api/jobs search box did substring ILIKE on a few
--   columns. "react" matched "interactive" and "reactor"; ranking was
--   posted_at DESC so a generic newer post outranked a perfectly-titled
--   match. v15 added a `search_vector tsvector` generated column over
--   title+company+description but no plural ranking and limited fields.
--
-- AFTER v17:
--   1. search_vector is now trigger-maintained (not GENERATED) and
--      indexes EIGHT fields with weighting:
--        A: title
--        B: company, skills (text[])
--        C: location, type, level
--        D: description, requirements (text[]), benefits
--
--      Switched from GENERATED because the v16 backfill needed
--      array_to_string(requirements, ' ') which is STABLE, not
--      IMMUTABLE — GENERATED columns require IMMUTABLE expressions.
--
--   2. search_jobs() and search_jobs_count() RPCs do FTS + ts_rank
--      ordering inside Postgres, returning rows sorted by relevance
--      then featured DESC then posted_at DESC.
--
--      `language sql` (not plpgsql) so the planner inlines them — an
--      earlier plpgsql version EXPLAINed at 3,134 ms because the
--      optimizer couldn't see the @@ predicate at the call site and
--      skipped the GIN index. Inlined SQL drops the same query to
--      ~21 ms direct / ~134 ms through the RPC wrapper.
--
--      The functions REQUIRE a non-empty q; the route layer must skip
--      them when q is empty and use the existing browse path.
--
--   3. NOTIFY pgrst at the end so PostgREST's schema cache picks up
--      the new RPC signatures without a restart.
-- ============================================================

begin;

-- 1) Drop the v15 generated column if present (no-op if v15 was the
--    trigger-maintained form already).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'jobs'
      and column_name  = 'search_vector'
      and is_generated = 'ALWAYS'
  ) then
    execute 'alter table public.jobs drop column search_vector';
  end if;
end$$;

-- 2) Add the trigger-maintained column if it isn't already there.
alter table public.jobs
  add column if not exists search_vector tsvector;

create index if not exists jobs_search_vector_idx
  on public.jobs using gin (search_vector);

-- 3) The trigger. Eight fields, weighted A/B/C/D. requirements is
--    text[] so we join with array_to_string; skills is also text[].
create or replace function public.jobs_search_vector_update()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  -- benefits, skills, requirements are ALL text[] — must go through
  -- array_to_string(..., ' '). An earlier version of this trigger
  -- treated benefits as text and used coalesce(new.benefits, ''),
  -- which raised "malformed array literal" on every INSERT/UPDATE
  -- because Postgres tried to coerce '' to text[]. /api/ats/save's
  -- bulk import was failing 100% (inserted 0, failed 500 per batch).
  new.search_vector :=
      setweight(to_tsvector('english', coalesce(new.title, '')),                                          'A')
    || setweight(to_tsvector('english', coalesce(new.company, '')),                                        'B')
    || setweight(to_tsvector('english', coalesce(array_to_string(new.skills,        ' '), '')),            'B')
    || setweight(to_tsvector('english', coalesce(new.location, '')),                                       'C')
    || setweight(to_tsvector('english', coalesce(new.type, '')),                                           'C')
    || setweight(to_tsvector('english', coalesce(new.level, '')),                                          'C')
    || setweight(to_tsvector('english', coalesce(new.description, '')),                                    'D')
    || setweight(to_tsvector('english', coalesce(array_to_string(new.requirements,  ' '), '')),            'D')
    || setweight(to_tsvector('english', coalesce(array_to_string(new.benefits,      ' '), '')),            'D');
  return new;
end;
$$;

drop trigger if exists trg_jobs_search_vector on public.jobs;

create trigger trg_jobs_search_vector
  before insert or update of
    title, company, skills, location, type, level,
    description, requirements, benefits
  on public.jobs
  for each row execute function public.jobs_search_vector_update();

-- 4) Backfill existing rows (one big UPDATE — fires the trigger).
-- This is slow on 64k+ rows but only runs once. Safe to re-run.
update public.jobs set title = title where search_vector is null;

-- 5) Inlinable SQL RPCs for the FTS path.
drop function if exists public.search_jobs(
  text, text, text, text, boolean, text, text, numeric, numeric, integer, integer, integer
);
drop function if exists public.search_jobs_count(
  text, text, text, text, boolean, text, text, numeric, numeric, integer
);

create function public.search_jobs(
  q             text,
  v_category    text    default null,
  v_type        text    default null,
  v_level       text    default null,
  v_remote_only boolean default false,
  v_location    text    default null,
  v_timezone    text    default null,
  v_salary_min  numeric default null,
  v_salary_max  numeric default null,
  v_posted_days int     default null,
  v_offset      int     default 0,
  v_limit       int     default 12
)
returns setof public.jobs
language sql
stable
security invoker
set search_path = public
as $$
  select j.*
  from public.jobs j
  where j.search_vector @@ websearch_to_tsquery('english', substring(q from 1 for 200))
    and j.is_active = true
    and (j.flagged = false or j.flagged is null)
    and (j.expires_at is null or j.expires_at > now())
    and (v_category    is null or j.category = v_category)
    and (v_type        is null or j.type     = v_type)
    and (v_level       is null or j.level    = v_level)
    and (not v_remote_only or j.remote = true
         or j.location ~* '(remote|worldwide|anywhere|global|distributed|wfh)')
    and (v_location    is null or j.location ilike '%' || v_location || '%')
    and (v_timezone    is null or j.timezone ilike '%' || v_timezone || '%')
    and (v_salary_min  is null or j.salary_max >= v_salary_min)
    and (v_salary_max  is null or j.salary_min <= v_salary_max)
    and (v_posted_days is null or j.posted_at >= now() - (v_posted_days || ' days')::interval)
  order by
    ts_rank(j.search_vector, websearch_to_tsquery('english', substring(q from 1 for 200))) desc,
    j.featured desc nulls last,
    j.posted_at desc
  offset v_offset
  limit  v_limit;
$$;

create function public.search_jobs_count(
  q             text,
  v_category    text    default null,
  v_type        text    default null,
  v_level       text    default null,
  v_remote_only boolean default false,
  v_location    text    default null,
  v_timezone    text    default null,
  v_salary_min  numeric default null,
  v_salary_max  numeric default null,
  v_posted_days int     default null
)
returns bigint
language sql
stable
security invoker
set search_path = public
as $$
  select count(*)::bigint
  from public.jobs j
  where j.search_vector @@ websearch_to_tsquery('english', substring(q from 1 for 200))
    and j.is_active = true
    and (j.flagged = false or j.flagged is null)
    and (j.expires_at is null or j.expires_at > now())
    and (v_category    is null or j.category = v_category)
    and (v_type        is null or j.type     = v_type)
    and (v_level       is null or j.level    = v_level)
    and (not v_remote_only or j.remote = true
         or j.location ~* '(remote|worldwide|anywhere|global|distributed|wfh)')
    and (v_location    is null or j.location ilike '%' || v_location || '%')
    and (v_timezone    is null or j.timezone ilike '%' || v_timezone || '%')
    and (v_salary_min  is null or j.salary_max >= v_salary_min)
    and (v_salary_max  is null or j.salary_min <= v_salary_max)
    and (v_posted_days is null or j.posted_at >= now() - (v_posted_days || ' days')::interval);
$$;

-- 6) Tell PostgREST to refresh its schema cache so the SDK can call
--    the new RPCs by their named-arg shape immediately.
notify pgrst, 'reload schema';

commit;
