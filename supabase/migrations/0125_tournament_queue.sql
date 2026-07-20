-- 0125_tournament_queue.sql — the live queue becomes available to tournaments:
-- an OPTIONAL open-court queue for players outside the groups/brackets (which
-- stay in Match schedule). Same sessions, codes, courtside app, and front door.
alter table public.court_sessions
  add column if not exists tournament_id uuid references public.tournaments(id) on delete set null;
create index if not exists court_sessions_tournament_idx on public.court_sessions (tournament_id, created_at desc);
alter table public.court_sessions
  add constraint court_sessions_one_owner check (not (event_id is not null and tournament_id is not null));
alter table public.tournaments
  add column if not exists queue_enabled boolean not null default false;
