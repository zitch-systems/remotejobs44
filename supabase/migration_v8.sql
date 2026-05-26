-- supabase/migration_v8.sql
-- Demote every admin in profiles whose email is NOT admin@remotejobs44.com.
-- The hardcoded admin allowlist (lib/admin-emails.ts) has been narrowed to
-- a single address; this brings the DB into the same state so users who got
-- promoted via the old broader list (or via a legacy onboarding flow) lose
-- admin access at the next login.
--
-- Run once in the Supabase SQL editor.

update public.profiles
   set role = 'user',
       updated_at = now()
 where role = 'admin'
   and lower(coalesce(email, '')) <> 'admin@remotejobs44.com';

-- Sanity-check report — should return exactly the rows you wanted to demote.
-- (Comment / uncomment as needed.)
-- select id, email, role, updated_at
--   from public.profiles
--  order by role desc, email;
