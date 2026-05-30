-- supabase/migration_v22.sql
-- Drop the hardcoded admin email list from handle_new_user().
--
-- Background: the previous version of handle_new_user() granted DB
-- role='admin' on auth.users insert when the new email matched any of:
--
--   'admin@remotejobs4.com'    <- typo / shadow domain (one '4')
--   'admin@remotejobs44.com'
--   'zitchinfo@gmail.com'
--
-- Two problems:
--
-- 1. `admin@remotejobs4.com` is a different domain than this product's
--    actual domain. If that domain is unregistered, anyone who buys it
--    and signs up with that address would get DB role='admin' the
--    instant they confirm — silently bypassing HARDCODED_ADMIN_EMAILS.
--
-- 2. The trigger's email list duplicates `lib/admin-emails.ts` (which
--    is what `requireAdmin()` and `/api/profile` overlay onto every
--    auth check). The two lists had already drifted: the env-var path
--    knew only `admin@remotejobs44.com`, the trigger had three. Drift
--    means rotating an admin requires touching SQL too — easy to miss.
--
-- Fix: trigger always inserts role='user'. App-side `requireAdmin()`
-- promotes a user to admin when their email is in HARDCODED_ADMIN_EMAILS
-- (or its FALLBACK_ADMINS const). One source of truth, rotatable via
-- Vercel env without a DB migration.
--
-- Existing rows are untouched — anyone with DB role='admin' today keeps
-- it. If you want to downgrade them to align with the env list, run a
-- separate manual UPDATE; this migration only fixes the trigger so new
-- accidental admins can't be minted.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, plan, role, created_at, updated_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    'free',
    'user',
    now(),
    now()
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
