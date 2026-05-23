-- ============================================================
-- Fix recursive RLS on public.profiles  (idempotent, safe to re-run)
--
-- Problem: "Admins can view/update all profiles" policies query
-- public.profiles from within RLS for public.profiles → recursion.
-- Symptom: 500 / hang on profile lookups, which breaks the
-- login-time role check and causes wrong-area redirects.
--
-- Fix: replace the inline subquery with a SECURITY DEFINER helper
-- function that bypasses RLS. Each table is patched in its own DO
-- block so the script keeps going if a table doesn't exist yet.
--
-- Run this in Supabase Dashboard → SQL Editor → New query.
-- ============================================================

-- 1) Admin check helper (always safe to (re)create)
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.role = 'admin'
  );
$$;

revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to authenticated, service_role;


-- 2) public.profiles  (must exist for the rest to be meaningful)
do $$
begin
  if to_regclass('public.profiles') is not null then
    execute 'drop policy if exists "Admins can view all profiles"   on public.profiles';
    execute 'drop policy if exists "Admins can update all profiles" on public.profiles';
    execute 'create policy "Admins can view all profiles"   on public.profiles for select using ( public.is_admin(auth.uid()) )';
    execute 'create policy "Admins can update all profiles" on public.profiles for update using ( public.is_admin(auth.uid()) )';
  end if;
end$$;


-- 3) public.jobs
do $$
begin
  if to_regclass('public.jobs') is not null then
    execute 'drop policy if exists "Admins can manage jobs" on public.jobs';
    execute 'create policy "Admins can manage jobs" on public.jobs for all using ( public.is_admin(auth.uid()) )';
  end if;
end$$;


-- 4) public.subscriptions
do $$
begin
  if to_regclass('public.subscriptions') is not null then
    execute 'drop policy if exists "Admins can view all subscriptions" on public.subscriptions';
    execute 'create policy "Admins can view all subscriptions" on public.subscriptions for select using ( public.is_admin(auth.uid()) )';
  end if;
end$$;


-- 5) public.job_sources
do $$
begin
  if to_regclass('public.job_sources') is not null then
    execute 'drop policy if exists "Admins can manage job_sources" on public.job_sources';
    execute 'create policy "Admins can manage job_sources" on public.job_sources for all using ( public.is_admin(auth.uid()) )';
  end if;
end$$;


-- 6) public.ai_provider_configs
do $$
begin
  if to_regclass('public.ai_provider_configs') is not null then
    execute 'drop policy if exists "Admins can manage ai_provider_configs" on public.ai_provider_configs';
    execute 'create policy "Admins can manage ai_provider_configs" on public.ai_provider_configs for all using ( public.is_admin(auth.uid()) )';
  end if;
end$$;
