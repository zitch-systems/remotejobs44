-- ============================================================
-- RemoteJobs44 — Migration v59
-- Run AFTER migration_v58_admin_2fa.sql in: Supabase Dashboard → SQL Editor.
--
-- Close the Day Pass 10-applications-per-period TOCTOU race.
--
-- The web route (/api/applications) enforces the Day Pass cap by reading
-- COUNT(applications since current_period_start) and rejecting at >= 10, THEN
-- inserting — a classic check-then-act with no atomicity. N concurrent applies
-- to N distinct jobs can each read count < 10 and all insert, letting a Day
-- Pass user exceed 10 applications in a burst. There was no DB-level cap for
-- the daily 10 (migration_v56's trigger explicitly defers it to the API, and
-- the unique(user_id, job_id) constraint only blocks duplicate applies to the
-- SAME job, not the count across distinct jobs).
--
-- This redefines enforce_apply_limit() to ALSO enforce the Day Pass cap inside
-- the BEFORE INSERT trigger, serialized per-user with a transaction-scoped
-- advisory lock so the count-and-insert can't be raced. Everything from v56 is
-- preserved verbatim (free-trial backstop, admin/pro bypass, service-role
-- pass-through); only the daily branch gains the atomic cap.
--
-- Defensive: if no active Day Pass subscription row is found (e.g. the brief
-- post-purchase webhook race), the trigger stays PERMISSIVE — the API already
-- refuses that case with a 503 before insert, so blocking here would only risk
-- false negatives on a legitimate apply. Availability over a marginal cap.
--
-- Keep c_daily_cap in lock-step with the 10 in app/api/applications/route.ts.
-- Idempotent — safe to re-run.
-- ============================================================

create or replace function public.enforce_apply_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan         text;
  v_role         text;
  v_expires      timestamptz;
  v_created      timestamptz;
  v_effective    text;
  v_count        integer;
  v_period_start timestamptz;
  c_trial_apps constant integer := 3;   -- keep in sync with FREE_TRIAL_APPLICATIONS
  c_trial_days constant integer := 7;   -- keep in sync with FREE_TRIAL_DAYS
  c_daily_cap  constant integer := 10;  -- keep in sync with /api/applications daily cap
begin
  -- Only gate real end-user (authenticated) inserts. Service-role / back-office
  -- / SQL-editor inserts (auth.role() = 'service_role' or null) pass through.
  if auth.role() is distinct from 'authenticated' then
    return new;
  end if;

  select plan, role, plan_expires_at, created_at
    into v_plan, v_role, v_expires, v_created
  from public.profiles
  where id = new.user_id;

  -- Unknown profile → don't block here; RLS / FK constraints govern it.
  if not found then
    return new;
  end if;

  if v_role = 'admin' or v_plan = 'admin' then
    return new;
  end if;

  -- Effective plan: a lapsed pro/daily falls back to free (mirrors resolvePlan).
  v_effective := v_plan;
  if v_plan in ('pro', 'daily') and v_expires is not null and v_expires < now() then
    v_effective := 'free';
  end if;

  -- Active Pro: unlimited.
  if v_effective = 'pro' then
    return new;
  end if;

  -- Active Day Pass: enforce the 10-per-period cap ATOMICALLY. The advisory
  -- lock is transaction-scoped (released at commit/rollback) and keyed on the
  -- user, so concurrent inserts for the same user serialize here — closing the
  -- count-then-insert race the API alone can't.
  if v_effective = 'daily' then
    perform pg_advisory_xact_lock(hashtext('apply_daily:' || new.user_id::text));

    select current_period_start
      into v_period_start
    from public.subscriptions
    where user_id = new.user_id
      and billing = 'daily'
      and status  = 'active'
    order by current_period_start desc nulls last
    limit 1;

    -- No active Day Pass row → stay permissive (the API gates this case with a
    -- 503 before insert; don't risk blocking a legitimate apply).
    if v_period_start is null then
      return new;
    end if;

    select count(*)
      into v_count
    from public.applications
    where user_id = new.user_id
      and applied_at >= v_period_start;

    if v_count >= c_daily_cap then
      raise exception 'day_pass_limit_reached'
        using errcode = 'check_violation',
              hint = 'You have reached the 10-application limit for your day pass. Upgrade to Pro for unlimited access.';
    end if;

    return new;
  end if;

  -- Free trial: window closed?
  if v_created is not null and now() > v_created + make_interval(days => c_trial_days) then
    raise exception 'free_trial_window_expired'
      using errcode = 'check_violation',
            hint = 'Your free trial has ended. Subscribe to keep applying.';
  end if;

  -- Free trial: allowance used up?
  select count(*) into v_count
  from public.applications
  where user_id = new.user_id;

  if v_count >= c_trial_apps then
    raise exception 'free_trial_limit_reached'
      using errcode = 'check_violation',
            hint = 'You have used all free applications. Subscribe to apply for more.';
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_apply_limit() from anon, authenticated, public;

-- Re-assert the trigger idempotently (unchanged wiring).
drop trigger if exists enforce_apply_limit_trg on public.applications;
create trigger enforce_apply_limit_trg
  before insert on public.applications
  for each row execute function public.enforce_apply_limit();
