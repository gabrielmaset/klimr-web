-- 0066_tournament_select_returning_fix.sql — fix INSERT ... RETURNING (42501).
--
-- Creating a tournament failed with "new row violates row-level security policy
-- for table tournaments" even though the INSERT policy's WITH CHECK
-- (owner_id = auth.uid()) passed and auth.uid() was the owner.
--
-- Cause: the app inserts with RETURNING (.select("id")). Postgres applies the
-- SELECT policy to the row being returned. The SELECT policy was built only from
-- STABLE security-definer helpers (is_tournament_staff / tournament_is_visible),
-- which query the tournaments table. A STABLE function evaluates against the
-- statement-start snapshot, which does NOT yet contain the row being inserted —
-- so both helpers returned false for the new row and the RETURNING (and thus the
-- whole INSERT) was rejected.
--
-- Fix: add a DIRECT owner_id = auth.uid() term (a plain column comparison, not a
-- subquery/function) so the owner can read their own row immediately, including
-- during the INSERT ... RETURNING. Semantics are unchanged (the owner was always
-- meant to see their tournaments); only the new-row visibility is fixed.
-- Idempotent.

drop policy if exists "tournaments readable" on public.tournaments;
create policy "tournaments readable" on public.tournaments
  for select to authenticated
  using (owner_id = auth.uid() or is_tournament_staff(id) or tournament_is_visible(id));
