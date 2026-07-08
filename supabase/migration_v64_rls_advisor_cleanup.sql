-- migration_v64_rls_advisor_cleanup.sql
-- Resolves the Supabase database advisor findings (performance + one security):
--   * 7 × auth_rls_initplan  (per-row auth.role() re-evaluation)
--   * ~all multiple_permissive_policies (overlapping permissive policies)
--   * 2 × security-definer trigger fn publicly callable via RPC
--
-- Every statement is idempotent and additive-safe. No access semantics change:
-- verified `service_role` has rolbypassrls=true, and anon never satisfied any
-- of the own/admin predicates being consolidated.
--
-- ── 1. Drop redundant service-role policies ─────────────────────────────────
-- `service_role` bypasses RLS entirely (rolbypassrls=true), so a policy whose
-- predicate is `auth.role() = 'service_role'` can only ever be true for a role
-- that never evaluates RLS in the first place. These policies grant nothing;
-- they only cost a per-row auth.role() call for anon/authenticated (the
-- auth_rls_initplan warning) and add a second permissive policy the planner
-- ORs in (multiple_permissive_policies). Removing them is a pure cleanup.
-- (cron_locks is left service-role-only afterwards — same intentional pattern
-- as admin_2fa_codes / paystack_transactions: RLS on, no policy, deny-all to
-- end users, service_role bypasses.)
drop policy if exists "Service role full access to ai_provider_configs" on public.ai_provider_configs;
drop policy if exists "cron_locks_service_role"                          on public.cron_locks;
drop policy if exists "Service role full access to job_alerts"           on public.job_alerts;
drop policy if exists "Service role full access to job_sources"          on public.job_sources;
drop policy if exists "Service role full access to jobs"                 on public.jobs;
drop policy if exists "service_all"                                      on public.profiles;
drop policy if exists "subs_service"                                     on public.subscriptions;

-- ── 2. Consolidate own+admin SELECT/UPDATE into one policy per command ──────
-- profiles + subscriptions each had two permissive policies (own row + admin
-- sees all) for the same command, both `TO public`. Merge each pair into a
-- single `TO authenticated` policy with the OR of both predicates. anon never
-- satisfied either branch, so scoping to authenticated is behaviour-preserving
-- and drops anon out of the per-row evaluation. auth.uid() stays wrapped in a
-- scalar subselect so it is evaluated once per statement, not once per row.
drop policy if exists "own_read"                on public.profiles;
drop policy if exists "Admins can view all profiles" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
  for select to authenticated
  using ( (( select auth.uid() ) = id) or public.is_admin(( select auth.uid() )) );

drop policy if exists "own_update"              on public.profiles;
drop policy if exists "Admins can update all profiles" on public.profiles;
create policy "profiles_update_own_or_admin" on public.profiles
  for update to authenticated
  using ( (( select auth.uid() ) = id) or public.is_admin(( select auth.uid() )) );

drop policy if exists "subs_read"               on public.subscriptions;
drop policy if exists "Admins can view all subscriptions" on public.subscriptions;
create policy "subscriptions_select_own_or_admin" on public.subscriptions
  for select to authenticated
  using ( (( select auth.uid() ) = user_id) or public.is_admin(( select auth.uid() )) );

-- ── 3. Scope admin-manage policies to `authenticated` ───────────────────────
-- These `is_admin(...)` policies were `TO public`, so anon evaluated them per
-- row too. Admins are always authenticated and anon is never an admin, so
-- narrowing the role is behaviour-preserving. The big win is `jobs`: the
-- high-volume anonymous read path now evaluates only the single public-read
-- policy instead of also running is_admin() for every row.
alter policy "Admins can manage jobs"                on public.jobs                to authenticated;
alter policy "Admins can manage job_sources"         on public.job_sources         to authenticated;
alter policy "Admins can manage ai_provider_configs" on public.ai_provider_configs to authenticated;

-- ── 4. Security: stop end-users calling the guard trigger fn over RPC ────────
-- profiles_guard_privileged() is a BEFORE-UPDATE trigger function (v62). It is
-- SECURITY DEFINER, so PostgREST exposes it at /rest/v1/rpc/... to anon +
-- authenticated. Direct calls can't actually do anything useful (it reads
-- trigger-only NEW/OLD/TG_OP), but a SECURITY DEFINER function should not be
-- publicly invokable. Trigger functions don't need EXECUTE to fire as triggers.
revoke execute on function public.profiles_guard_privileged() from anon, authenticated, public;
