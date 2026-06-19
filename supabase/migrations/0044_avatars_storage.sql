-- 0044_avatars_storage.sql — make avatar + cover photo uploads work.
--
-- Both the profile photo and the cover photo are stored in the `avatars` bucket
-- under <uid>/… . Uploads use createSignedUploadUrl(), which requires the
-- authenticated role to hold an INSERT policy on storage.objects for that bucket.
-- If the bucket was created in the dashboard without an upload policy, every
-- upload silently fails (the "Add cover photo" button appears to do nothing).
--
-- This guarantees: the bucket exists and is public (so images display), and that
-- a signed-in user may upload / replace / delete files only inside their own
-- <uid>/ folder. Idempotent.

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

-- Public read (also covered by the bucket being public, but explicit is fine).
drop policy if exists "avatars read" on storage.objects;
create policy "avatars read" on storage.objects
  for select using (bucket_id = 'avatars');

-- Upload into your own folder only.
drop policy if exists "avatars insert own" on storage.objects;
create policy "avatars insert own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Replace your own files.
drop policy if exists "avatars update own" on storage.objects;
create policy "avatars update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Remove your own files.
drop policy if exists "avatars delete own" on storage.objects;
create policy "avatars delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
