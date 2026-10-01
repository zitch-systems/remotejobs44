-- Keep the existing indexed duplicate identity, but bound both group selection
-- and writes. A 5,000-group UPDATE repeatedly hit the production statement cap.
-- No rows are deleted: the best copy remains active and a backlog resumes on
-- the next run. Existing visibility/indexes are preserved.
create or replace function public.dedupe_jobs()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare affected integer;
begin
  with duplicate_groups as materialized (
    select lower(btrim(title)) as title_key,
           lower(btrim(company)) as company_key,
           lower(btrim(coalesce(location, ''))) as location_key
    from public.jobs
    where is_active
    group by 1, 2, 3
    having count(*) > 1
    limit 50
  ), ranked as (
    select j.id,
      row_number() over (
        partition by lower(btrim(j.title)), lower(btrim(j.company)),
                     lower(btrim(coalesce(j.location, '')))
        order by (coalesce(j.views, 0) + coalesce(j.applications, 0)) desc,
                 j.last_seen_at desc nulls last, j.posted_at desc nulls last,
                 j.created_at desc nulls last, j.id
      ) as position
    from public.jobs j
    join duplicate_groups g
      on lower(btrim(j.title)) = g.title_key
     and lower(btrim(j.company)) = g.company_key
     and lower(btrim(coalesce(j.location, ''))) = g.location_key
    where j.is_active
  ), victims as materialized (
    select id from ranked where position > 1 limit 100
  ), changed as (
    update public.jobs j set is_active = false, updated_at = now()
    from victims v where j.id = v.id and j.is_active
    returning j.id
  )
  select count(*)::integer into affected from changed;
  return affected;
end;
$$;
revoke all on function public.dedupe_jobs() from public, anon, authenticated;
grant execute on function public.dedupe_jobs() to service_role;
notify pgrst, 'reload schema';
