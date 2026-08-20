-- 0062_tournament_promoted.sql — paid placement flag for tournaments.
-- When true, a tournament surfaces in the "Promoted" section of the Tournaments
-- hub (broader, cross-region placement). Set via the future paid-placement flow
-- / admin for now; defaults off so nothing is promoted without intent.

alter table public.tournaments
  add column if not exists promoted boolean not null default false;

create index if not exists tournaments_promoted_idx
  on public.tournaments (promoted) where promoted;
