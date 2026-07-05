-- migration_v61_cv_update_policy.sql
-- Fixes CV *replacement* on existing installs.
--
-- Installs provisioned from supabase/setup.sql got INSERT / SELECT / DELETE
-- policies on the private `cvs` bucket but NO UPDATE policy. Supabase Storage's
-- upsert (`upload(..., { upsert: true })`) resolves an existing object key as an
-- UPDATE, so replacing an already-uploaded CV (web writes a fixed `<uid>/cv.<ext>`
-- key; mobile always upserts) was denied by RLS and surfaced as a 500 / failed
-- upload. Adding an own-folder UPDATE policy makes "Replace CV" work while
-- keeping the scope identical to the insert/delete policies (users touch only
-- their own uid folder).
--
-- Idempotent and additive — safe to run on any environment. Also asserts the
-- bucket is private, in case a stale public=true crept in from the old v39.

update storage.buckets set public = false where id = 'cvs' and public is distinct from false;

drop policy if exists "cv update own folder" on storage.objects;
create policy "cv update own folder" on storage.objects for update to authenticated
  using (bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text);
