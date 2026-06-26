-- 0053_tournament_draws.sql — append-only draw log (audit trail for the pool draw).
--
-- Pools are drawn at random; organizers may redraw if entries change. Every draw —
-- the original and each redraw — is recorded here with its timestamp and who ran
-- it, so the history is transparent and contestable actions stay on the record for
-- both organizers and participants. Append-only: there are no update/delete
-- policies, so the log can't be quietly altered. Visibility mirrors the rest of
-- competition data (staff always; the public once the tournament is visible).
-- Idempotent.

create table if not exists public.tournament_draws (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  division_id   uuid not null references public.tournament_divisions(id) on delete cascade,
  draw_number   int  not null,                                              -- 1 = original, 2+ = redraw
  drawn_by      uuid references public.profiles(id) on delete set null,
  drawn_at      timestamptz not null default now()
);
create index if not exists idx_draws_division on public.tournament_draws(division_id);

alter table public.tournament_draws enable row level security;

drop policy if exists "draws select" on public.tournament_draws;
create policy "draws select" on public.tournament_draws
  for select to authenticated using (is_tournament_staff(tournament_id) or tournament_is_visible(tournament_id));

drop policy if exists "draws insert" on public.tournament_draws;
create policy "draws insert" on public.tournament_draws
  for insert to authenticated with check (is_tournament_staff(tournament_id));

-- intentionally no update/delete policies: the draw log is append-only.
