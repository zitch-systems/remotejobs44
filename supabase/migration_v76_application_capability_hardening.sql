-- Application rows are user-owned tracker state, not authority to choose an
-- arbitrary job or rewrite quota timestamps. Preserve status/note editing while
-- making ownership, job linkage, and application time immutable.

-- Preserve useful role titles while removing the canonical employer name and
-- contact channels. A small PL/pgSQL loop performs a literal, case-insensitive
-- replacement, avoiding dynamic-regex escaping bugs for names such as C++ Co.
create or replace function public.application_safe_job_title(p_title text, p_company text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_out text := coalesce(p_title, 'Saved application');
  v_remaining text;
  v_scrubbed text := '';
  v_pos integer;
begin
  v_out := regexp_replace(v_out, '(https?://|www\.)[^[:space:]]+', '[application details available after applying]', 'gi');
  v_out := regexp_replace(v_out, '[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}', '[application details available after applying]', 'gi');
  if nullif(btrim(p_company), '') is not null then
    v_remaining := v_out;
    loop
      v_pos := strpos(lower(v_remaining), lower(p_company));
      exit when v_pos = 0;
      v_scrubbed := v_scrubbed || left(v_remaining, v_pos - 1) || '[Hidden Company]';
      v_remaining := substring(v_remaining from v_pos + char_length(p_company));
    end loop;
    v_out := v_scrubbed || v_remaining;
  end if;
  return coalesce(nullif(btrim(v_out), ''), 'Saved application');
end;
$$;

update public.applications a
set company = null,
    company_logo = null,
    job_title = public.application_safe_job_title(j.title, j.company)
from public.jobs j
where j.id = a.job_id;

create or replace function public.applications_guard_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.jobs%rowtype;
begin
  if auth.role() is distinct from 'authenticated' then return new; end if;

  if tg_op = 'INSERT' then
    select * into v_job from public.jobs where id = new.job_id;
    if not found or not v_job.is_active or coalesce(v_job.flagged, false)
       or (v_job.expires_at is not null and v_job.expires_at <= now()) then
      raise exception 'job_not_available' using errcode = 'check_violation';
    end if;
    new.user_id := auth.uid();
    new.job_title := public.application_safe_job_title(v_job.title, v_job.company);
    new.company := null;
    new.company_logo := null;
    new.applied_at := now();
    new.auto_applied := false;
    return new;
  end if;

  if new.user_id is distinct from old.user_id
     or new.job_id is distinct from old.job_id
     or new.job_title is distinct from old.job_title
     or new.company is distinct from old.company
     or new.company_logo is distinct from old.company_logo
     or new.applied_at is distinct from old.applied_at
     or new.auto_applied is distinct from old.auto_applied then
    raise exception 'application_identity_is_immutable' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists applications_guard_write_trg on public.applications;
create trigger applications_guard_write_trg
  before insert or update on public.applications
  for each row execute function public.applications_guard_write();

-- Supabase projects commonly start with table-level grants. Replace UPDATE ALL
-- with the tracker fields used by the mobile client.
revoke update on public.applications from anon, authenticated;
grant update (status, notes, steps, updated_at) on public.applications to authenticated;

revoke all on function public.applications_guard_write() from public, anon, authenticated;
revoke all on function public.application_safe_job_title(text,text) from public, anon, authenticated;
