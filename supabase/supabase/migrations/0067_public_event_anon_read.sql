-- 0067_public_event_anon_read.sql — let logged-out visitors view a PUBLISHED
-- event's public page (/e/<code>) with no Klimr account.
--
-- Reads on the public page run as the `anon` role. anon already holds
-- table-level SELECT grants (0043/0063), and RLS is enabled on these tables, so
-- without an anon policy anon sees nothing. Add SELECT policies scoped to
-- *visible* (published, non-draft/cancelled) events via the existing
-- security-definer helper. Draft/cancelled events stay invisible to the public.
--
-- Organizer-private data (registrations, registration_players, payments,
-- custom_fields, managers) is intentionally NOT exposed to anon.
-- Idempotent.

grant execute on function public.tournament_is_visible(uuid) to anon;

drop policy if exists "tournaments public read" on public.tournaments;
create policy "tournaments public read" on public.tournaments
  for select to anon
  using (tournament_is_visible(id));

drop policy if exists "tournament_divisions public read" on public.tournament_divisions;
create policy "tournament_divisions public read" on public.tournament_divisions
  for select to anon
  using (tournament_is_visible(tournament_id));

drop policy if exists "tournament_draws public read" on public.tournament_draws;
create policy "tournament_draws public read" on public.tournament_draws
  for select to anon
  using (tournament_is_visible(tournament_id));
