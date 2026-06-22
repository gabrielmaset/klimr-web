-- 0058_team_category.sql — teams are Recreational or Pro.
--
-- Recreational: a basic in-app team page (the existing /teams/[id] page).
-- Pro: the full team workspace/profile at /team/[id]/*.
-- Set at creation; existing teams default to Recreational.

alter table public.teams
  add column if not exists category text not null default 'recreational'
  check (category in ('recreational', 'pro'));

create index if not exists teams_category_idx on public.teams (category);
