-- ============================================================
-- RemoteJobs44 — Migration v56
-- Run AFTER migration_v55.sql in: Supabase Dashboard → SQL Editor.
--
-- Align the server-side application gate with the new free-trial model. v55
-- enforced a free "N applications per UTC day" cap (site_settings
-- .mobileFreeApplyLimit, default 10). The product now grants registered users
-- a fixed allowance within a window from signup — 3 applications in 7 days —
-- matching the web app (lib/auth/free-trial.ts) and the mobile client
-- (mobile/src/lib/free-trial.ts).
--
-- This redefines enforce_apply_limit() to:
--   • bypass any non-authenticated caller (service_role / back-office / SQL
--     editor) so admin tooling can still insert,
--   • allow admins and ACTIVE paid plans (pro/daily) unlimited applications —
--     a lapsed pro/daily (plan_expires_at in the past) falls back to the free
--     trial, mirroring the web's effective-plan logic,
--   • for free users, block once the 7-day window from profiles.created_at has
--     elapsed OR once 3 applications exist, whichever comes first.
--
-- The web route (/api/applications) still owns the daily-pass 10-per-period cap
-- and its own messaging; this trigger only adds the free-trial backstop, so the
-- two don't conflict. Keep the constants below in lock-step with
-- FREE_TRIAL_APPLICATIONS / FREE_TRIAL_DAYS in the app code.
--
-- Idempotent — safe to re-run.
-- ============================================================

create or replace function public.enforce_apply_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan       text;
  v_role       text;
  v_expires    timestamptz;
  v_created    timestamptz;
  v_effective  text;
  v_count      integer;
  c_trial_apps constant integer := 3;  -- keep in sync with FREE_TRIAL_APPLICATIONS
  c_trial_days constant integer := 7;  -- keep in sync with FREE_TRIAL_DAYS
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

  if v_effective in ('pro', 'daily') then
    return new; -- active paid plan: unlimited (daily's own cap lives in the API)
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

-- Trigger definition is unchanged from v55, but re-assert it idempotently so a
-- fresh database that skipped v55 still ends up wired correctly.
drop trigger if exists enforce_apply_limit_trg on public.applications;
create trigger enforce_apply_limit_trg
  before insert on public.applications
  for each row execute function public.enforce_apply_limit();
