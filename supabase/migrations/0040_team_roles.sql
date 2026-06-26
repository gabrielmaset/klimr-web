-- 0040_team_roles.sql — real club structure for teams.
--   role:        owner | manager | staff | member   (admin level)
--   designation: captain | co_captain | sub | null   (playing role)
-- The original creator (previously stored as 'captain') becomes the owner.
-- Idempotent.

alter table public.team_members drop constraint if exists team_members_role_check;
alter table public.team_members
  add constraint team_members_role_check check (role in ('owner','manager','staff','member'));

alter table public.team_members
  add column if not exists designation text;
alter table public.team_members drop constraint if exists team_members_designation_check;
alter table public.team_members
  add constraint team_members_designation_check check (designation is null or designation in ('captain','co_captain','sub'));

-- Promote existing creators (stored as 'captain') to 'owner'.
update public.team_members set role = 'owner' where role = 'captain';
