-- 0127_session_activated_at.sql — the retire clock's true reference: when this
-- queue DAY went live. Revival stamps it; the 12h idle auto-off measures from
-- max(activated_at, last activity) instead of the session row's creation age —
-- which made every revived (empty, days-old) session retire itself on the very
-- next page read, the root of the turn-on saga.
alter table public.court_sessions
  add column if not exists activated_at timestamptz not null default now();
