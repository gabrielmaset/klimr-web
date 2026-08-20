-- 0060_team_location.sql — store a team's home location as ZIP + state.
-- The city is derived from the ZIP (via the offline zipcodes dataset) and kept
-- in the existing `city` column for display/search. `neighborhood` is no longer
-- collected (the column stays for backward compatibility).

alter table public.teams
  add column if not exists zip text,
  add column if not exists state text;
