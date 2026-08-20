-- 0045_court_website.sql — store a court's official website (from Google Places
-- `websiteUri`) so the directory and court pages can offer a "Website" link
-- alongside "Open in Maps". Mostly useful for private clubs (e.g. PickletownLA).
-- Idempotent.

alter table public.courts add column if not exists website text;
