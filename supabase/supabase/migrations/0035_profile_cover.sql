-- 0035_profile_cover.sql — cover photo for the player's own profile page.
-- Stored in the existing public "avatars" bucket under the user's own folder
-- (covers/<uid>/…), so no new bucket or storage policy is needed. Idempotent.

alter table public.profiles add column if not exists cover_path text;
