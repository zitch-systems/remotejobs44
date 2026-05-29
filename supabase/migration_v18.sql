-- ============================================================
-- RemoteJobs44 — Migration v18
-- Trigram typo fallback for the search box.
--
-- BEFORE v18:
--   v17 added FTS + relevance ranking, so "react" finds React jobs in
--   the right order. But "reactt", "pythn", "designr" — common
--   one-character typos — return zero rows. Users (especially mobile
--   thumb-typers) see an empty state and leave.
--
-- AFTER v18:
--   1. search_jobs_trgm() / search_jobs_trgm_count() RPCs use the
--      existing jobs_title_trgm_idx + jobs_company_trgm_idx GIN
--      indexes via the `<%` word-similarity operator (default
--      threshold 0.6).
--
--      The Supabase role doesn't have permission to override
--      pg_trgm.word_similarity_threshold at the function level, so we
--      use the default. In testing this catches:
--        reactt → React (ws 0.71), pythn → Python (0.67),
--        designr → Designer (0.75), javascrpt → JavaScript (0.70),
--        marketin → Marketing (0.89), analyts → Analyst (0.63).
--      It misses single-letter-dropped variants below 0.6
--      (engneer 0.55, devloper 0.58). Acceptable: this is a fallback
--      that only runs when strict FTS returns nothing.
--
--   2. 3-char minimum guard — sub-3-char queries match too much and
--      have no useful ranking signal, so the function returns 0 rows
--      for them.
--
--   3. The route layer (app/api/jobs/route.ts and app/jobs/page.tsx)
--      calls these RPCs only when the FTS pair returns total=0, and
--      surfaces a `fuzzy: true` flag so the UI can show a "No exact
--      matches — showing similar results" hint.
-- ============================================================

begin;

-- pg_trgm + trigram indexes already exist from earlier migrations.
-- We don't recreate them here; just sanity-check they're present.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_trgm') then
    create extension pg_trgm;
  end if;
end$$;

create index if not exists jobs_title_trgm_idx
  on public.jobs using gin (title gin_trgm_ops);
create index if not exists jobs_company_trgm_idx
  on public.jobs using gin (company gin_trgm_ops);

-- The fuzzy search RPC.
create or replace function public.search_jobs_trgm(
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
  where length(coalesce(substring(q from 1 for 80), '')) >= 3
    and (substring(q from 1 for 80) <% j.title
         or substring(q from 1 for 80) <% j.company)
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
  order by greatest(word_similarity(substring(q from 1 for 80), j.title),
                    word_similarity(substring(q from 1 for 80), j.company) * 0.7) desc,
           j.featured desc nulls last,
           j.posted_at desc
  offset v_offset
  limit  v_limit;
$$;

create or replace function public.search_jobs_trgm_count(
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
  where length(coalesce(substring(q from 1 for 80), '')) >= 3
    and (substring(q from 1 for 80) <% j.title
         or substring(q from 1 for 80) <% j.company)
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

notify pgrst, 'reload schema';

commit;
