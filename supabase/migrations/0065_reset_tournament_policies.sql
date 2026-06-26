-- 0065_reset_tournament_policies.sql — normalize the RLS policies on tournaments.
--
-- A live database hit "new row violates row-level security policy for table
-- tournaments" (42501) on insert even though the row's owner_id equalled
-- auth.uid() — which the intended INSERT policy (owner_id = auth.uid()) would
-- pass. That means the live policy set had drifted from the migrations (a stray,
-- altered, or restrictive policy from a re-run). This drops EVERY policy on the
-- table and recreates the exact known-good set, so the live database and fresh
-- setups are guaranteed identical. Reads use the security-definer helpers from
-- 0050 (no cross-table recursion). Idempotent.

do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'tournaments' loop
    execute format('drop policy if exists %I on public.tournaments', p.policyname);
  end loop;
end $$;

create policy "tournaments readable" on public.tournaments
  for select to authenticated
  using (is_tournament_staff(id) or tournament_is_visible(id));

create policy "tournaments insert own" on public.tournaments
  for insert to authenticated
  with check (owner_id = auth.uid());

create policy "tournaments update own" on public.tournaments
  for update to authenticated
  using (is_tournament_staff(id))
  with check (is_tournament_staff(id));

create policy "tournaments delete own" on public.tournaments
  for delete to authenticated
  using (owner_id = auth.uid());
