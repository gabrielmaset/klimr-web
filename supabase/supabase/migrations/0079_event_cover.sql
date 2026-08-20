-- 0079_event_cover.sql — optional creator-uploaded cover photo for events
-- (open play, ladder nights, clinics, socials, round-robins). Stores the storage
-- path; the public URL is derived at render time from the tournament-gallery bucket.
alter table public.events add column if not exists cover_path text;
