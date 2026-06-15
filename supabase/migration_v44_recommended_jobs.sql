-- migration_v44_recommended_jobs.sql
-- Server-side relevance: rank active jobs for the signed-in user against their
-- skills + target_role (a step toward a learned model — scoring now lives in
-- the DB instead of the client). Called by the mobile "For you" feed via
-- supabase.rpc('recommended_jobs'). SECURITY INVOKER: reads the caller's own
-- profile (RLS) + public jobs.
create or replace function public.recommended_jobs(limit_n integer default 30)
returns setof public.jobs
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
  select j.*
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

grant execute on function public.recommended_jobs(integer) to authenticated;
