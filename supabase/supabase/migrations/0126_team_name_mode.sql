-- 0126_team_name_mode.sql — organizer-chosen team naming for live queues:
-- 'letters' (Team A/B), 'first_player' (first joiner's first name), or
-- 'initials' (every member's first initial). Presentation-only — stored team
-- identity stays letter-based, so switching modes mid-session just works.
alter table public.court_sessions
  add column if not exists team_name_mode text not null default 'letters'
  check (team_name_mode in ('letters','first_player','initials'));
