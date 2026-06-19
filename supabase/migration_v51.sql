-- ============================================================
-- RemoteJobs44 — Migration v51
-- Run AFTER migration_v50.sql in: Supabase Dashboard → SQL Editor.
--
-- Performance: wrap auth.uid() in a subselect in the mobile_devices policies so
-- Postgres evaluates it once per query instead of once per row (clears the
-- auth_rls_initplan advisor on the policies added in v38). Same access logic.
-- Idempotent — safe to re-run.
-- ============================================================

drop policy if exists "own device read" on public.mobile_devices;
drop policy if exists "own device insert" on public.mobile_devices;
drop policy if exists "own device update" on public.mobile_devices;
create policy "own device read"   on public.mobile_devices for select using ((select auth.uid()) = user_id);
create policy "own device insert" on public.mobile_devices for insert with check ((select auth.uid()) = user_id);
create policy "own device update" on public.mobile_devices for update using ((select auth.uid()) = user_id);
