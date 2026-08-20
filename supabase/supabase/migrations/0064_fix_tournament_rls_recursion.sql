-- 0064_fix_tournament_rls_recursion.sql — break infinite RLS recursion (42P17).
--
-- 0049 wrote the SELECT policies on `tournaments` and `tournament_managers` to
-- reference each other with direct subqueries: reading a tournament checked
-- tournament_managers, and reading tournament_managers checked tournaments. When
-- Postgres evaluates one it recurses into the other and aborts with
-- "infinite recursion detected in policy for relation" (SQLSTATE 42P17). This
-- broke EVERY tournament read — creating a draft (the INSERT ... RETURNING),
-- the public hub listings, and the /e/<code> page.
--
-- 0050 already added SECURITY DEFINER helpers that resolve ownership/visibility
-- WITHOUT triggering RLS (so they can't recurse):
--   • is_tournament_staff(tid)   → caller is the owner or a manager
--   • tournament_is_visible(tid) → tournament status is past draft (and not cancelled)
-- The registration tables use exactly this pair. This migration rewrites the two
-- base policies the same way. Logic is unchanged; only the recursion is removed.
-- Idempotent.

drop policy if exists "tournaments readable" on public.tournaments;
create policy "tournaments readable" on public.tournaments
  for select to authenticated
  using (is_tournament_staff(id) or tournament_is_visible(id));

drop policy if exists "tournament_managers readable" on public.tournament_managers;
create policy "tournament_managers readable" on public.tournament_managers
  for select to authenticated
  using (is_tournament_staff(tournament_id) or tournament_is_visible(tournament_id));
