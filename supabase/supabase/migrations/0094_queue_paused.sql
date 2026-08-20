-- 0094_queue_paused.sql — a live queue can be paused (held) without ending it.
-- While paused, players can't join and the next match can't be started, but every
-- team keeps its place in line. Orthogonal to status (setup/live/ended): resuming
-- just clears the flag. Turning a queue OFF is a separate reset (handled in app
-- code: it clears teams/matches/requests and returns the session to 'setup' so the
-- next start begins fresh). Idempotent.

alter table public.court_sessions
  add column if not exists paused boolean not null default false;
