-- migration_v62_rls_hardening.sql
-- Defense-in-depth hardening surfaced by the platform security/DB audit.
-- Every statement is idempotent and additive — safe to run on any environment.
--
-- Three independent fixes:
--   1. jobs public-read policy: enforce the flagged/expired visibility invariant
--      in RLS, not just in app query code.
--   2. profiles: block browser-side privilege escalation at the policy layer,
--      so security no longer rests solely on column-level GRANTs.
--   3. subscriptions: index the paystack_subscription_code lookup used on the
--      billing hot path.

-- ── 1. jobs: stop leaking flagged (scam-suspected) + expired rows via REST ──
-- The only public SELECT filter was `is_active = true`. The app additionally
-- filters `flagged` and `expires_at` in every query (lib/jobs-visibility.ts),
-- but a direct anon PostgREST call (…/rest/v1/jobs?is_active=eq.true) still
-- returned flagged and expired postings because those predicates lived only in
-- app code. Push the app's exact invariant into the policy. NULL columns stay
-- visible (legacy rows: flagged NULL / expires_at NULL are safe), matching the
-- app's `flagged.is.null` / `expires_at.is.null` allowances. Admin + service
-- role reads are unaffected — they match their own (OR'd) permissive policies.
drop policy if exists "Jobs are publicly readable" on public.jobs;
drop policy if exists "jobs_select" on public.jobs;
create policy "Jobs are publicly readable" on public.jobs
  for select using (
    is_active = true
    and coalesce(flagged, false) = false
    and (expires_at is null or expires_at > now())
  );

-- ── 2. profiles: guard privileged columns at the policy layer ───────────────
-- profiles_update uses `using (auth.uid() = id)` with no WITH CHECK and no
-- column scope, so RLS alone would let a user rewrite their own role / plan /
-- plan_expires_at / suspended. Today that's blocked only by the column-level
-- GRANT (update restricted to name, updated_at) from migration_v9 — correct,
-- but fragile: one stray `GRANT UPDATE ON profiles` silently reopens full
-- self-elevation with no policy change to catch in review. This BEFORE UPDATE
-- trigger makes the row itself reject privileged-column changes from any
-- authenticated end-user, independent of the GRANT set. Service-role writes
-- (the app's admin routes via createAdminSupabaseClient) and direct DB / SQL
-- access (auth.uid() IS NULL, e.g. migrations, dashboard) are exempt.
create or replace function public.profiles_guard_privileged()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Only constrain a real, authenticated, non-service end-user session.
  if auth.uid() is null or auth.role() = 'service_role' then
    return new;
  end if;
  if new.role is distinct from old.role
     or new.plan is distinct from old.plan
     or new.plan_expires_at is distinct from old.plan_expires_at
     or new.suspended is distinct from old.suspended then
    raise exception 'privileged profile columns are read-only for this role';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_privileged on public.profiles;
create trigger profiles_guard_privileged
  before update on public.profiles
  for each row execute function public.profiles_guard_privileged();

-- ── 3. subscriptions: index the billing-webhook lookup ──────────────────────
-- invoice.payment_failed resolves the user via
--   .eq('paystack_subscription_code', subCode)
-- (app/api/paystack/webhook/route.ts). That column was unindexed, so the lookup
-- is a seq scan that grows linearly with paying users on a payment hot path.
create index if not exists subscriptions_paystack_sub_code_idx
  on public.subscriptions (paystack_subscription_code)
  where paystack_subscription_code is not null;
