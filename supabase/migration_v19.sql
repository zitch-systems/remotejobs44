-- ============================================================
-- RemoteJobs44 — Migration v19
-- RLS hygiene: drop duplicate policies + cache auth.uid() in all
-- own-row policies. Closes Supabase advisors
-- multiple_permissive_policies and auth_rls_initplan.
--
-- Neither change has semantic impact — same predicates, same row
-- visibility. The "multiple_permissive_policies" advisor was tripping
-- because each table had two policies for the same (role, cmd) tuple
-- that were textually different but logically identical; the
-- "auth_rls_initplan" advisor wanted auth.uid() wrapped in a
-- subselect so the planner evaluates it ONCE per query instead of
-- per-row. Both are perf wins, not security changes.
--
-- Admin write paths and admin/companies aggregation RPCs landed in
-- separate migrations earlier this session — see
--   admin_companies_aggregate_v2_groupby
--   admin_companies_aggregate_rpc
--   fix_search_vector_trigger_benefits_array
--   harden_jobs_search_vector_update_search_path
-- which were each applied directly via the MCP tool. v19 only
-- captures the RLS hygiene work for the repo's reproducible-from-
-- repo guarantee.
-- ============================================================

begin;

-- ── 1. Drop duplicate policies (multiple_permissive_policies advisor)
drop policy if exists "jobs_public_read"  on public.jobs;
drop policy if exists "profiles_insert"   on public.profiles;
drop policy if exists "alerts_all"        on public.job_alerts;
drop policy if exists "sources_all"       on public.job_sources;

-- ── 2. Cache auth.uid() in own-row policies (auth_rls_initplan)
alter policy "apps_insert" on public.applications
  with check ((select auth.uid()) = user_id);
alter policy "apps_select" on public.applications
  using ((select auth.uid()) = user_id);
alter policy "apps_update" on public.applications
  using ((select auth.uid()) = user_id);

alter policy "Users manage own alerts" on public.job_alerts
  using ((select auth.uid()) = user_id);

alter policy "saved_delete" on public.saved_jobs
  using ((select auth.uid()) = user_id);
alter policy "saved_insert" on public.saved_jobs
  with check ((select auth.uid()) = user_id);
alter policy "saved_select" on public.saved_jobs
  using ((select auth.uid()) = user_id);

alter policy "subs_read" on public.subscriptions
  using ((select auth.uid()) = user_id);

alter policy "own_insert" on public.profiles
  with check ((select auth.uid()) = id);
alter policy "own_read" on public.profiles
  using ((select auth.uid()) = id);
alter policy "own_update" on public.profiles
  using ((select auth.uid()) = id);

alter policy "admin_actions_insert" on public.admin_actions
  with check (exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'admin'
  ));
alter policy "admin_actions_select" on public.admin_actions
  using (exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'admin'
  ));

alter policy "paystack_webhook_events_admin_select" on public.paystack_webhook_events
  using (is_admin((select auth.uid())));

commit;
