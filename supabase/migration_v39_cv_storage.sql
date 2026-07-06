-- migration_v39_cv_storage.sql
-- Storage bucket for CV uploads (mobile app lib/profile.ts uploadCv + web
-- app/api/cv). Files live under a per-user folder: cvs/<auth.uid()>/cv-<ts>.<ext>.
--
-- SECURITY: the bucket is PRIVATE. CVs contain personal data (name, contact,
-- address, employment history), so they must NOT be world-readable by URL.
-- Reads go through short-lived SIGNED URLs (supabase.storage.createSignedUrl),
-- which is what both the web route and the mobile client do. An earlier version
-- of this migration created the bucket PUBLIC (public=true) with no SELECT
-- policy; on a fresh migration-based provision that would have exposed every CV
-- to anyone with the object path. This file now matches supabase/setup.sql,
-- which already provisions the bucket private.
insert into storage.buckets (id, name, public)
values ('cvs', 'cvs', false)
on conflict (id) do nothing;

-- Each authenticated user may read/write only their own uid folder. All four
-- verbs are covered: SELECT so createSignedUrl works on the private bucket,
-- INSERT for the first upload, UPDATE so an upsert re-upload (Replace CV) to an
-- existing object key is allowed, and DELETE for removal.
drop policy if exists "cv select own folder" on storage.objects;
create policy "cv select own folder" on storage.objects for select to authenticated
  using (bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "cv insert own folder" on storage.objects;
create policy "cv insert own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "cv update own folder" on storage.objects;
create policy "cv update own folder" on storage.objects for update to authenticated
  using (bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "cv delete own folder" on storage.objects;
create policy "cv delete own folder" on storage.objects for delete to authenticated
  using (bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text);
