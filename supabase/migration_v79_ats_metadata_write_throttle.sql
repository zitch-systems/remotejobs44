-- Avoid rewriting every row on every 15-minute ATS sweep. Fresh unchanged
-- rows are already healthy; inactive rows still reactivate immediately and
-- metadata changes still land on the first sweep that observes them.
create or replace function public.update_ats_metadata(p_source_url text, p_jobs jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare changed integer;
declare revived integer;
begin
 if jsonb_typeof(p_jobs) <> 'array' or jsonb_array_length(p_jobs) > 500 then
   raise exception 'expected at most 500 postings';
 end if;
 select count(*) into revived
 from public.jobs j
 join jsonb_array_elements(p_jobs) x on j.apply_url=x->>'apply_url'
 where j.source_url=p_source_url and j.source='api' and j.is_active=false;

 update public.jobs j set
   title = coalesce(x->>'title', j.title),
   description = coalesce(x->>'description', j.description),
   location = coalesce(x->>'location', j.location),
   remote = coalesce((x->>'remote')::boolean, j.remote),
   workplace_hint = x->>'workplace_hint',
   salary_text = x->>'salary_text',
   salary_min = (x->>'salary_min')::integer,
   salary_max = (x->>'salary_max')::integer,
   currency = coalesce(x->>'currency', j.currency),
   logo = case when x->>'logo' like 'https://%' then x->>'logo' else j.logo end,
   flagged = coalesce(j.flagged,false) or coalesce((x->>'flagged')::boolean,false),
   flagged_reason = case when coalesce(j.flagged,false) then j.flagged_reason else x->>'flagged_reason' end,
   is_active = true,
   last_seen_at = now()
 from jsonb_array_elements(p_jobs) x
 where j.source_url=p_source_url and j.source='api' and j.apply_url=x->>'apply_url'
   and (
     j.is_active=false or j.last_seen_at is null or j.last_seen_at < now()-interval '6 hours'
     or j.title is distinct from coalesce(x->>'title', j.title)
     or j.description is distinct from coalesce(x->>'description', j.description)
     or j.location is distinct from coalesce(x->>'location', j.location)
     or j.remote is distinct from coalesce((x->>'remote')::boolean, j.remote)
     or j.workplace_hint is distinct from x->>'workplace_hint'
     or j.salary_text is distinct from x->>'salary_text'
     or j.salary_min is distinct from (x->>'salary_min')::integer
     or j.salary_max is distinct from (x->>'salary_max')::integer
     or j.currency is distinct from coalesce(x->>'currency', j.currency)
     or (x->>'logo' like 'https://%' and j.logo is distinct from x->>'logo')
     or (not coalesce(j.flagged,false) and coalesce((x->>'flagged')::boolean,false))
     or (not coalesce(j.flagged,false) and j.flagged_reason is distinct from x->>'flagged_reason')
   );
 get diagnostics changed = row_count;
 return jsonb_build_object('updated', changed, 'reactivated', revived);
end;
$$;

revoke all on function public.update_ats_metadata(text,jsonb) from public, anon, authenticated;
grant execute on function public.update_ats_metadata(text,jsonb) to service_role;
