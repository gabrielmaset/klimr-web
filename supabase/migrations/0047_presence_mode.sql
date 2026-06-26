-- 0047_presence_mode.sql — user-chosen presence for the top-bar status control.
--
-- 'auto'    → derive online/away from profiles.last_seen_at (the heartbeat the
--             app shell already records).
-- 'online'  → always show the green dot.
-- 'away'    → always show the amber dot.
-- 'offline' → "Appear offline": browse privately, no dot shown to others.
--
-- No new RLS needed: the existing "update own profile" policy already covers a
-- user changing their own row (this is the same mechanism the last_seen_at
-- heartbeat uses), and the verification / account_status guard triggers only
-- fire when those specific columns change — not this one.
alter table public.profiles
  add column if not exists presence_mode text not null default 'auto'
  check (presence_mode in ('auto', 'online', 'away', 'offline'));
