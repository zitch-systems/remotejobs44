-- migration_v38_profile_preferences.sql
-- Mobile "Job preferences": the user's skills (used to personalise the match
-- score), plus an optional target role + headline shown in the app. Read/
-- written by the mobile app (mobile/src/lib/profile.ts); the existing
-- self-update RLS on profiles covers these columns.

alter table public.profiles
  add column if not exists skills      text[] default '{}'::text[],
  add column if not exists target_role text,
  add column if not exists headline    text;
