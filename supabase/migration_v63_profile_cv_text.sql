-- migration_v63_profile_cv_text.sql
-- Persist the profile "Your CV text" field the web /profile page collects for
-- AI CV review. `target_role` already exists (migration_v38); this adds the
-- free-text CV body so the Target Role + Your CV Text inputs survive a reload
-- instead of living only in client state.
--
-- Writes go through app/api/profile (service-role admin client) — the
-- column-level GRANT from migration_v9 still restricts the `authenticated`
-- role to (name, updated_at), so no new client-side write privilege is opened
-- here and the migration_v62 privileged-column trigger is untouched.
--
-- Idempotent and additive — safe to run on any environment.
alter table public.profiles
  add column if not exists cv_text text;
