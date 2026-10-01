-- Launch audit access safeguards. Apply before the matching app release.

-- Atomically verify an admin email OTP and consume one attempt.
-- Service role only: browser roles cannot inspect hashes or invoke this helper.
create or replace function public.verify_admin_2fa_code(
  p_user_id uuid,
  p_submitted_hash text,
  p_max_attempts integer default 5
) returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_code public.admin_2fa_codes%rowtype;
  v_attempts integer;
begin
  if p_user_id is null or p_submitted_hash is null or p_max_attempts < 1 then
    return 'missing';
  end if;

  select * into v_code
  from public.admin_2fa_codes
  where user_id = p_user_id
    and consumed_at is null
    and expires_at > now()
  order by created_at desc
  limit 1
  for update;

  if not found then return 'missing'; end if;
  if v_code.attempts >= p_max_attempts then
    update public.admin_2fa_codes set consumed_at = now() where id = v_code.id;
    return 'locked';
  end if;
  if v_code.code_hash = p_submitted_hash then
    update public.admin_2fa_codes set consumed_at = now() where id = v_code.id;
    return 'verified';
  end if;

  v_attempts := v_code.attempts + 1;
  update public.admin_2fa_codes
  set attempts = v_attempts,
      consumed_at = case when v_attempts >= p_max_attempts then now() else consumed_at end
  where id = v_code.id;
  return case when v_attempts >= p_max_attempts then 'locked' else 'mismatch' end;
end;
$$;

revoke all on function public.verify_admin_2fa_code(uuid,text,integer) from public, anon, authenticated;
grant execute on function public.verify_admin_2fa_code(uuid,text,integer) to service_role;


-- Employer identity is hydrated from jobs only for Pro/admin responses. Do not
-- retain company names or logos in user-owned application rows.
alter table public.applications alter column company drop not null;
update public.applications set company = null, company_logo = null
where company is not null or company_logo is not null;


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


-- Make direct authenticated application inserts obey the same entitlement
-- limits as the API, including concurrent requests and subscription gaps.
create or replace function public.enforce_apply_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan text;
  v_role text;
  v_expires timestamptz;
  v_created timestamptz;
  v_suspended boolean;
  v_count integer;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_confirmed timestamptz;
begin
  if auth.role() is distinct from 'authenticated' then return new; end if;

  -- Guard trigger canonicalizes new.user_id first. Serialize every quota check
  -- for this user so both free and Day Pass counts remain atomic.
  perform pg_advisory_xact_lock(hashtext('apply:' || new.user_id::text));

  select p.plan, p.role, p.plan_expires_at, p.created_at, p.suspended, u.email_confirmed_at
    into v_plan, v_role, v_expires, v_created, v_suspended, v_confirmed
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.id = new.user_id;

  if not found then
    raise exception 'application_profile_missing' using errcode = 'check_violation';
  end if;
  if coalesce(v_suspended, false) then
    raise exception 'application_account_suspended' using errcode = 'check_violation';
  end if;
  if v_confirmed is null then
    raise exception 'application_email_unconfirmed' using errcode = 'check_violation';
  end if;
  if v_role = 'admin' or v_plan = 'admin' then return new; end if;

  if v_plan = 'pro' and (v_expires is null or v_expires > now()) then return new; end if;

  if v_plan = 'daily' and v_expires > now() then
    select current_period_start, current_period_end
      into v_period_start, v_period_end
    from public.subscriptions
    where user_id = new.user_id
      and billing = 'daily'
      and status = 'active'
      and current_period_start <= now()
      and current_period_end > now()
    order by current_period_start desc
    limit 1;
    if v_period_start is null or v_period_end is null then
      raise exception 'day_pass_not_active' using errcode = 'check_violation';
    end if;
    select count(*) into v_count from public.applications
      where user_id = new.user_id and applied_at >= v_period_start;
    if v_count >= 10 then
      raise exception 'day_pass_limit_reached' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if v_plan in ('pro', 'daily') then
    raise exception 'subscription_expired' using errcode = 'check_violation';
  end if;
  if v_created is null or now() > v_created + interval '7 days' then
    raise exception 'free_trial_window_expired' using errcode = 'check_violation';
  end if;
  select count(*) into v_count from public.applications where user_id = new.user_id;
  if v_count >= 3 then
    raise exception 'free_trial_limit_reached' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_apply_limit() from public, anon, authenticated;
drop trigger if exists enforce_apply_limit_trg on public.applications;
create trigger enforce_apply_limit_trg before insert on public.applications
for each row execute function public.enforce_apply_limit();


-- Keep the direct mobile apply-channel RPC aligned with the server route:
-- visible jobs only, effective paid entitlement, and the Day Pass period cap.
create or replace function public.job_apply_channel(p_job_id uuid)
returns table (apply_url text, apply_email text)
language sql
stable
security definer
set search_path = ''
as $$
  select j.apply_url, j.apply_email
  from public.jobs j
  where j.id = p_job_id
    and j.is_active = true
    and coalesce(j.flagged, false) = false
    and (j.expires_at is null or j.expires_at > now())
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and coalesce(p.suspended, false) = false
        and (
          p.role = 'admin'
          or (
            p.plan = 'pro'
            and (p.plan_expires_at is null or p.plan_expires_at > now())
          )
          or (
            p.plan = 'daily'
            and p.plan_expires_at > now()
            and exists (
              select 1
              from public.subscriptions s
              where s.user_id = p.id
                and s.billing = 'daily'
                and s.status = 'active'
                and s.current_period_start <= now()
                and s.current_period_end > now()
                and (
                  exists (
                    -- Historical access to a channel already consumed by this
                    -- user remains available, including their tenth apply.
                    select 1 from public.applications a
                    where a.user_id = p.id and a.job_id = p_job_id
                  )
                  or (
                    select count(*)
                    from public.applications a
                    where a.user_id = p.id
                      and a.applied_at >= s.current_period_start
                  ) < 10
                )
              )
          )
        )
    );
$$;

revoke all on function public.job_apply_channel(uuid) from public, anon;
grant execute on function public.job_apply_channel(uuid) to authenticated;


notify pgrst, 'reload schema';
