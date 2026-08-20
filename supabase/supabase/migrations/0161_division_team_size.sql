-- 0161_division_team_size.sql — the schema decision from the tournament
-- integrity sprint: each division may declare its required TEAM SIZE
-- (null = flexible). signUpTeam enforces Gabriel's complete-roster rule:
-- a team registers only with a full roster that exactly matches the
-- division's size — no under-filled entries, no post-registration bloat
-- (each entry is a locked snapshot regardless). Idempotent.

alter table public.tournament_divisions
  add column if not exists team_size int
  check (team_size is null or (team_size between 1 and 12));
