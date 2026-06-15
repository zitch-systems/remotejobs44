-- migration_v43_profile_details.sql
-- Structured profile fields for the mobile "Edit profile" screen: a short bio,
-- professional links (github / linkedin / website), and a work-experience list.
-- Read/written by mobile lib/profile.ts (fetchDetails / saveDetails); the
-- existing self-update RLS on profiles covers these columns.
alter table public.profiles
  add column if not exists bio        text,
  add column if not exists links      jsonb not null default '{}'::jsonb,
  add column if not exists experience jsonb not null default '[]'::jsonb;
