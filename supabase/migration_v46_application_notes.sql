-- migration_v46_application_notes.sql
-- A free-text note per application (e.g. recruiter name, next step, salary
-- discussed). Read/written by the mobile Applications tracker; the existing
-- self-scoped RLS on applications (user_id = auth.uid()) covers it.
alter table public.applications
  add column if not exists notes text;
