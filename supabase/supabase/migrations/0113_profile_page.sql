-- 0113_profile_page.sql — public player-profile page data:
-- owner-curated gear bag + usual times + gallery storage (editor is a
-- follow-up; the column ships so the page reads real data), and the three
-- privacy toggles Gabriel specified (courts / teams / tournaments visibility).

alter table public.profiles
  add column if not exists gear jsonb not null default '[]'::jsonb,
  add column if not exists usual_times text,
  add column if not exists profile_gallery jsonb not null default '[]'::jsonb,
  add column if not exists show_courts boolean not null default true,
  add column if not exists show_teams boolean not null default true,
  add column if not exists show_tournaments boolean not null default true;
