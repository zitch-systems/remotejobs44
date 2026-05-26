-- supabase/migration_v9.sql
-- Column-level UPDATE lockdown on public.profiles.
--
-- Background: the RLS policy `profiles_update` (schema.sql:147) checks
-- `auth.uid() = id`, which is row-level only. With no column scope, any
-- authenticated user could open the browser console and run:
--
--   supabase.from('profiles').update({ role: 'admin', plan: 'pro' }).eq('id', uid)
--
-- and self-elevate. This migration revokes blanket UPDATE from the
-- `authenticated` Postgres role and re-grants it only on the columns
-- users may legitimately edit themselves (`name` + `updated_at`). All
-- other writes — `role`, `plan`, `plan_expires_at`, `suspended`,
-- `paystack_*`, `cv_url`, `profile_completion`, etc. — must go through
-- a route using the service-role client, which bypasses these grants.
--
-- Run once in the Supabase SQL editor.

revoke update on public.profiles from authenticated;
grant update (name, updated_at) on public.profiles to authenticated;

-- Sanity check: list which columns `authenticated` can update on profiles.
-- Should show ONLY name + updated_at. Uncomment to verify:
-- select column_name, privilege_type
--   from information_schema.column_privileges
--  where grantee = 'authenticated'
--    and table_schema = 'public'
--    and table_name = 'profiles'
--    and privilege_type = 'UPDATE'
--  order by column_name;
