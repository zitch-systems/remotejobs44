-- supabase/migration_v21.sql
-- Defense-in-depth: align the `anon` role's column grants on
-- public.profiles with the principle of least privilege.
--
-- Background: the Supabase default-grant template for new tables hands
-- `anon` and `authenticated` UPDATE + INSERT on every column. In v9
-- (migration_v9.sql) we tightened `authenticated` UPDATE to just
-- (name, updated_at). But `anon` still has UPDATE + INSERT on the full
-- column set, including `plan`, `role`, `plan_expires_at`,
-- `paystack_customer_code`, `paystack_subscription_code`, etc.
--
-- Today this is gated by RLS: every UPDATE / INSERT policy on the table
-- checks `auth.uid() = id`, and an anonymous request has `auth.uid()`
-- of null, so the predicate is always false and the write is blocked.
-- The risk is what happens if RLS is ever disabled mid-migration, or a
-- future policy gets a `permissive` `for all using (true)` rule added
-- by mistake — anon would then have direct UPDATE on billing/role
-- columns over PostgREST.
--
-- A logged-out user has no business writing to profiles at all. Revoke
-- both UPDATE and INSERT from anon outright. Authenticated stays as v9
-- left it (UPDATE on name + updated_at; INSERT for the upsert-on-login
-- path).
--
-- Idempotent: REVOKE is a no-op if the privilege is already absent.

revoke update on public.profiles from anon;
revoke insert on public.profiles from anon;

-- Sanity check (uncomment to verify):
--   select grantee, privilege_type, column_name
--     from information_schema.column_privileges
--    where table_schema = 'public' and table_name = 'profiles'
--      and grantee = 'anon'
--    order by privilege_type, column_name;
-- Expected after running: no rows for grantee='anon' under UPDATE/INSERT
-- (SELECT may still be present so /signup probes etc. continue to work).
