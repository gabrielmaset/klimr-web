-- 0160_tournament_lifecycle.sql — roster-change policy, date sanity, and
-- automatic ranking points (Gabriel's tournament-integrity batch).
--
-- (1) ROSTER POLICY: organizers choose until when registered teams may
--     substitute players (14d/7d/3d/24h before, at start, or a custom
--     cutoff). Enforcement rides the per-registration roster snapshots
--     (tournament_registration_players) — each entry is its own locked
--     copy, so a team in several tournaments edits each registration
--     independently under that tournament's own deadline; the team's
--     living roster is never forked.
-- (2) DATE SANITY: ends_at may never precede starts_at. Existing rows with
--     an inverted or missing end are healed to the start, then a CHECK
--     enforces it forever (app validates both directions on every save).
-- (3) AUTO-AWARD: results_finalized_at + points_awarded_at stamps. A
--     Vercel cron (vercel.json → /api/cron/finalize-tournaments, daily)
--     finalizes and awards ranking points for any tournament 72h past its
--     end that no organizer finalized — registered players never lose
--     points to a forgotten button. Manual award stamps the same fields.
-- Idempotent.

alter table public.tournaments add column if not exists roster_lock_policy text not null default 'at_start';
alter table public.tournaments add column if not exists roster_lock_custom timestamptz;
alter table public.tournaments add column if not exists results_finalized_at timestamptz;
alter table public.tournaments add column if not exists points_awarded_at timestamptz;

-- Heal, then guard.
update public.tournaments set ends_at = starts_at
  where starts_at is not null and (ends_at is null or ends_at < starts_at);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tournaments_ends_after_starts'
  ) then
    alter table public.tournaments
      add constraint tournaments_ends_after_starts
      check (starts_at is null or ends_at is null or ends_at >= starts_at);
  end if;
end;
$$;

create index if not exists tournaments_finalize_due_idx
  on public.tournaments (ends_at)
  where results_finalized_at is null and cancelled_at is null;
