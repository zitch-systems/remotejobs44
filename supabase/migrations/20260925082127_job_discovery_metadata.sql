-- Public discovery metadata; existing application-link and identity access
-- controls remain in force. No guessed salary, country or relocation claims.
create or replace function public.job_workplace(loc text, remote_flag boolean, hint text)
returns text language sql immutable parallel safe set search_path = '' as $$
 select case
   when hint in ('remote','hybrid','onsite') then hint
   when coalesce(loc,'') ~* '\mhybrid\M' then 'hybrid'
   when coalesce(loc,'') ~* '\m(on[- ]?site|in[- ]office|office[- ]based)\M' then 'onsite'
   when remote_flag is true or coalesce(loc,'') ~* '\m(remote|worldwide|anywhere|work from home|wfh)\M' then 'remote'
   else 'unknown' end;
$$;

-- Require an affirmative offer in a single clause. Negated and conditional
-- statements and candidate-only willingness to relocate are not offers.
create or replace function public.job_support(body text, kind text)
returns boolean language sql immutable parallel safe set search_path = '' as $$
 select exists (
   select 1 from regexp_split_to_table(left(regexp_replace(coalesce(body,''), '<[^>]*>', '. ', 'g'),100000), '[.!?;\n\r]') clause
   where clause !~* '\m(no|not|without|unavailable|cannot|unable|may|might|could|if|eligible|eligibility|case.by.case|must|willing|require|required)\M|n''t\M'
   and case when kind = 'visa' then
     clause ~* '\m(offer|offers|offering|provide|provides|providing|available|sponsor|sponsorship|support)\M.{0,60}\m(visa|visas|work permit)\M|\m(visa|visas|work permit)\M.{0,40}\m(available|provided|offered|sponsored)\M'
     else clause ~* '\m(relocation|relocating)\M.{0,35}\m(package|assistance|support|provided|covered|paid|available)\M|\m(offer|offers|provide|provides|support|pay|paid|cover|covers)\M.{0,35}\mrelocation\M'
   end
 );
$$;

alter table public.jobs add column if not exists salary_text text;
alter table public.jobs add column if not exists workplace_hint text;
alter table public.jobs add column if not exists workplace_type text not null default 'unknown';
alter table public.jobs add column if not exists relocation_supported boolean not null default false;
alter table public.jobs add column if not exists visa_sponsorship boolean not null default false;

-- A trigger computes discovery metadata for new and refreshed rows. Plain
-- columns avoid a table rewrite that would evaluate the description regex over
-- every historical job inside this migration transaction; the narrow backfill
-- is run separately after the schema lands.
create or replace function public.set_job_discovery_metadata()
returns trigger language plpgsql set search_path='' as $$
begin
  new.workplace_type := public.job_workplace(new.location, new.remote, new.workplace_hint);
  new.relocation_supported := public.job_support(new.description, 'relocation');
  new.visa_sponsorship := public.job_support(new.description, 'visa');
  return new;
end;
$$;
drop trigger if exists set_job_discovery_metadata on public.jobs;
create trigger set_job_discovery_metadata
before insert or update of location, remote, workplace_hint, description on public.jobs
for each row execute function public.set_job_discovery_metadata();
grant select(salary_text, workplace_type, relocation_supported, visa_sponsorship) on public.jobs to anon, authenticated;

-- Update metadata in bounded batches instead of ON CONFLICT DO NOTHING leaving
-- old salary/location/description forever. Never unflag or reactivate rows here.
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
 where j.source_url=p_source_url and j.source='api' and j.apply_url=x->>'apply_url';
 get diagnostics changed = row_count;
 return jsonb_build_object('updated', changed, 'reactivated', revived);
end;
$$;
revoke all on function public.update_ats_metadata(text,jsonb) from public, anon, authenticated;
grant execute on function public.update_ats_metadata(text,jsonb) to service_role;

-- Greenhouse and Ashby expose complete public snapshots. Once one of those
-- snapshots succeeds, retire only that exact board's missing postings. Partial
-- and paginated providers never call this function.
create or replace function public.retire_missing_ats_jobs(p_source_url text, p_seen_urls text[])
returns integer language plpgsql security invoker set search_path='' as $$
declare changed integer;
begin
 if p_seen_urls is null or cardinality(p_seen_urls) > 5000 then
   raise exception 'expected at most 5000 posting URLs';
 end if;
 update public.jobs
 set is_active=false, is_new=false
 where source='api' and source_url=p_source_url and is_active=true
   and not (apply_url = any(p_seen_urls));
 get diagnostics changed = row_count;
 return changed;
end;
$$;
revoke all on function public.retire_missing_ats_jobs(text,text[]) from public, anon, authenticated;
grant execute on function public.retire_missing_ats_jobs(text,text[]) to service_role;
notify pgrst, 'reload schema';
