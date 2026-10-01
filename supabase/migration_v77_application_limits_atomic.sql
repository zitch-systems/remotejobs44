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
