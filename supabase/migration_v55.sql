-- ============================================================
-- RemoteJobs44 — Migration v55
-- Run AFTER migration_v54.sql in: Supabase Dashboard → SQL Editor.
--
-- Server-side enforcement of the free-plan daily application cap. It was
-- client-only (clearing app data or using multiple devices bypassed it). Paid
-- plans (pro/daily/admin) are unlimited; the free cap is read from the
-- admin-editable site_settings.mobileFreeApplyLimit (default 10).
--
-- A BEFORE INSERT trigger on applications raises when a free user exceeds the
-- cap for the current UTC day. The mobile client already shows a friendly
-- "daily limit reached" prompt before applying; this is the authoritative gate.
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
  v_plan  text;
  v_count integer;
  v_limit integer;
begin
  select plan into v_plan from public.profiles where id = new.user_id;
  if v_plan in ('pro', 'daily', 'admin') then
    return new; -- paid: unlimited
  end if;

  v_limit := coalesce(nullif((select "mobileFreeApplyLimit" from public.site_settings where id = 1), '')::integer, 10);

  select count(*) into v_count
  from public.applications
  where user_id = new.user_id
    and applied_at >= date_trunc('day', now());

  if v_count >= v_limit then
    raise exception 'daily_application_limit_reached'
      using errcode = 'check_violation',
            hint = 'Upgrade to Pro for unlimited applications.';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_apply_limit() from anon, authenticated, public;

drop trigger if exists enforce_apply_limit_trg on public.applications;
create trigger enforce_apply_limit_trg
  before insert on public.applications
  for each row execute function public.enforce_apply_limit();
