-- 0032_presence.sql — lightweight presence so admins can see who's active.
-- profiles.last_seen_at is touched (throttled) by the app shell on each page
-- load. No new RLS needed: the existing "update own profile" policy covers the
-- user-initiated heartbeat, and the verification / account_status guard triggers
-- only fire when those specific columns change — not this one.
alter table public.profiles add column if not exists last_seen_at timestamptz;
create index if not exists profiles_last_seen_idx on public.profiles (last_seen_at desc nulls last);
