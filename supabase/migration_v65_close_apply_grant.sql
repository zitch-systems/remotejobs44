-- ============================================================
-- RemoteJobs44 — Migration v65
-- Run AFTER migration_v64_rls_advisor_cleanup.sql in: Supabase Dashboard → SQL Editor.
--
-- ⚠️ ROLLOUT ORDER — read before applying:
-- Apply this migration ONLY AFTER the mobile release that (a) stops selecting
-- apply_url/apply_email in its jobs queries and (b) fetches the apply channel
-- via the new job_apply_channel() RPC has fully rolled out. Older mobile
-- builds still select the two columns directly, and with column-level grants
-- in force PostgREST rejects the WHOLE query with 403 — the exact breakage
-- that motivated migration_v47's grant in the first place.
--
-- What this fixes: migration_v47 granted SELECT (apply_url, apply_email) back
-- to anon + authenticated to unbreak the mobile feed, silently undoing the
-- paywall lockdown migration_v16 put in place ("audit finding C-2"). With the
-- grant open, anyone holding the public anon key can read every job's apply
-- channel straight off PostgREST (or via the SECURITY INVOKER search RPCs),
-- bypassing the Day Pass/Pro paywall entirely. This migration closes the
-- grant again and gives entitled users a server-checked path instead.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- 1) -----------------------------------------------------------------------
-- Re-revoke the paid columns (restores v16's lockdown, undone by v47).
revoke select (apply_url, apply_email) on public.jobs from anon, authenticated;

-- 2) -----------------------------------------------------------------------
-- recommended_jobs was `returns setof public.jobs` + `select j.*` under
-- SECURITY INVOKER, so after (1) any authenticated call would fail with
-- "permission denied for column apply_url". Recreate it returning only the
-- safe columns the mobile "For you" feed actually maps.
drop function if exists public.recommended_jobs(integer);

create function public.recommended_jobs(limit_n integer default 30)
returns table (
  id           uuid,
  title        text,
  company      text,
  logo         text,
  category     text,
  type         text,
  level        text,
  location     text,
  description  text,
  requirements text[],
  skills       text[],
  salary_min   integer,
  salary_max   integer,
  currency     text,
  remote       boolean,
  featured     boolean,
  posted_at    timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  with me as (
    select coalesce(skills, '{}'::text[]) as skills,
           coalesce(lower(target_role), '') as role
    from public.profiles
    where id = auth.uid()
  )
  select j.id, j.title, j.company, j.logo, j.category, j.type, j.level,
         j.location, j.description, j.requirements, j.skills,
         j.salary_min, j.salary_max, j.currency, j.remote, j.featured,
         j.posted_at
  from public.jobs j
  cross join me
  where j.is_active = true
  order by (
    (select count(*) from unnest(j.skills) js
       where lower(js) in (select lower(ms) from unnest(me.skills) ms)) * 10
    + case when me.role <> '' and lower(coalesce(j.title, '')) like '%' || me.role || '%' then 8 else 0 end
    + case when j.featured then 3 else 0 end
    + case when j.posted_at > now() - interval '7 days'  then 4
           when j.posted_at > now() - interval '30 days' then 2 else 0 end
  ) desc, j.posted_at desc nulls last
  limit greatest(1, least(coalesce(limit_n, 30), 100));
$$;

revoke all on function public.recommended_jobs(integer) from public, anon;
grant execute on function public.recommended_jobs(integer) to authenticated;

-- 3) -----------------------------------------------------------------------
-- The FTS/trgm search functions are only ever called through the service-role
-- client (app/api/jobs + the /jobs SSR page); they were left with the default
-- PUBLIC execute grant, which let direct anon callers run `select j.*` reads.
-- After (1) those calls would merely error, but don't leave the surface open.
-- Dynamic lookup so this works whatever the exact signatures are.
do $$
declare fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('search_jobs', 'search_jobs_count',
                        'search_jobs_trgm', 'search_jobs_trgm_count')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn.sig);
    execute format('grant execute on function %s to service_role', fn.sig);
  end loop;
end $$;

-- 4) -----------------------------------------------------------------------
-- Server-checked apply channel for entitled callers. SECURITY DEFINER so it
-- can read the revoked columns; entitlement is verified inside — the caller
-- must be an admin or hold an unexpired daily/pro plan (same rule as
-- resolvePlan in lib/auth/plan.ts). Free/expired callers get zero rows.
create or replace function public.job_apply_channel(p_job_id uuid)
returns table (apply_url text, apply_email text)
language sql
stable
security definer
set search_path = public
as $$
  select j.apply_url, j.apply_email
  from public.jobs j
  where j.id = p_job_id
    and j.is_active = true
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and (
          p.role = 'admin'
          or (p.plan in ('daily', 'pro', 'admin')
              and (p.plan_expires_at is null or p.plan_expires_at > now()))
        )
    );
$$;

revoke all on function public.job_apply_channel(uuid) from public, anon;
grant execute on function public.job_apply_channel(uuid) to authenticated;
