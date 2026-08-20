-- baseline_repair.sql — objects that EXIST IN PRODUCTION but no migration creates.
--
-- These are out-of-band schema changes (dashboard edits or uncommitted work)
-- discovered by the KCDX-004 empty replay. Applied immediately after 0001 in a
-- clean rebuild so the ordered history can replay; a no-op against production,
-- where the objects already exist. Every entry here is a KCDX-004 drift record
-- and must also ship as a forward migration (0189) so the two agree.
--
-- F1 · profiles.avatar_path — read by 0099's people_you_may_know, declared in
--      lib/database.types.ts, consumed by 36 app files. No migration adds it.
alter table public.profiles add column if not exists avatar_path text;

-- F4 · storage.buckets limits for `avatars` — production carries a 6 MiB cap and
--      an image MIME allowlist that no migration sets. Recorded here so a clean
--      rebuild produces the same (safer) bucket, and shipped forward in 0189.
update storage.buckets set file_size_limit = 6291456,
       allowed_mime_types = array['image/webp','image/jpeg','image/png']
 where id = 'avatars';
