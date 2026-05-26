-- ============================================================
-- RemoteJobs44 — Migration v7
-- Run AFTER migration_v6.sql in: Supabase Dashboard → SQL Editor.
--
-- Closes an open RLS hole in the profiles_insert policy. Idempotent.
-- ============================================================

-- The profiles_insert policy in migration_v3.sql:18 was WITH CHECK (true),
-- which allowed any authenticated user to insert a profile row with any
-- `id`. The auth.users → profiles trigger (handle_new_user) is the
-- intended write path; an attacker racing the trigger could bind a
-- profile to a victim's auth.uid and inherit their plan/role.
--
-- Tighten the policy so an INSERT must satisfy `auth.uid() = id`. The
-- trigger runs as SECURITY DEFINER (bypasses RLS), so this doesn't
-- affect the legitimate signup flow.

drop policy if exists profiles_insert on public.profiles;

create policy profiles_insert on public.profiles
  for insert
  with check (auth.uid() = id);
