-- migration_v39_cv_storage.sql
-- Storage bucket for CV uploads from the mobile app (lib/profile.ts uploadCv).
-- Files live under a per-user folder: cvs/<auth.uid()>/cv-<ts>.<ext>.

insert into storage.buckets (id, name, public)
values ('cvs', 'cvs', true)
on conflict (id) do nothing;

-- Each authenticated user may write only into their own uid folder.
drop policy if exists "cv insert own folder" on storage.objects;
create policy "cv insert own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "cv update own folder" on storage.objects;
create policy "cv update own folder" on storage.objects for update to authenticated
  using (bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "cv delete own folder" on storage.objects;
create policy "cv delete own folder" on storage.objects for delete to authenticated
  using (bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text);

-- The bucket is PUBLIC so getPublicUrl() works (read by URL, no auth). CV URLs
-- are unguessable (uuid folder + timestamp) and stored on the profile. If CVs
-- must be private, flip `public` to false and switch the app to signed URLs.
