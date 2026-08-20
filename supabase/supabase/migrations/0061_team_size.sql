-- 0061_team_size.sql — per-team squad-size cap.
-- Min is always 2 (a one-person "team" can't exist); default/max are per-sport,
-- enforced in the app. Stored here as the team's chosen cap on roster growth.

alter table public.teams
  add column if not exists max_size int;

-- Backfill existing teams to their sport's maximum, so no current roster is over-cap.
update public.teams set max_size = case sport_key
  when 'beach_volleyball' then 6
  else 4
end
where max_size is null;

-- A team can never be configured for a single person.
alter table public.teams drop constraint if exists teams_max_size_check;
alter table public.teams add constraint teams_max_size_check check (max_size is null or max_size >= 2);
