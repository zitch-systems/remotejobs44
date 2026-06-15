-- migration_v45_avatars.sql
-- Storage bucket for profile photos uploaded from the mobile app
-- (lib/profile.ts uploadAvatar). Files live under a per-user folder:
-- avatars/<auth.uid()>/avatar-<ts>.<ext>. Public read (unguessable URL stored
-- on the profile); each user may only write into their own uid folder.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatar insert own folder" on storage.objects;
create policy "avatar insert own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatar update own folder" on storage.objects;
create policy "avatar update own folder" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatar delete own folder" on storage.objects;
create policy "avatar delete own folder" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
