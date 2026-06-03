-- migration_v30.sql
-- Recurring job de-duplication.
--
-- jobs already has a UNIQUE index on apply_url (migration_v25), so identical
-- apply_urls can't duplicate. But aggregated sources hand out a fresh apply_url
-- for the same role on each pull, so the same title+company+location slowly
-- accumulates multiple active rows. dedupe_jobs() collapses those: it keeps the
-- best row per (lower(title), lower(company), lower(location)) — most
-- engagement first, then freshest — and deactivates the rest (is_active=false,
-- never deleted, fully reversible). Distinct locations are preserved, so the
-- same role posted across many cities is left intact.
--
-- Called daily from /api/cron/daily. EXECUTE is restricted to service_role so
-- it can't be invoked through the public PostgREST RPC endpoint.

create or replace function public.dedupe_jobs()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  affected integer;
begin
  with ranked as (
    select id,
      row_number() over (
        partition by lower(btrim(title)), lower(btrim(company)), lower(btrim(coalesce(location, '')))
        order by (coalesce(views, 0) + coalesce(applications, 0)) desc,
                 last_seen_at desc nulls last,
                 posted_at    desc nulls last,
                 created_at   desc nulls last,
                 id
      ) as rn
    from public.jobs
    where is_active
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

revoke all     on function public.dedupe_jobs() from public, anon, authenticated;
grant  execute on function public.dedupe_jobs() to service_role;
