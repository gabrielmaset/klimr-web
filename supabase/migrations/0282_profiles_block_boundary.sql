-- 0282_profiles_block_boundary.sql — B2 / KFU-004: the block holds at the table.
--
-- FINDING. 0236 built `profiles_public`, a block-aware view, and it works. But
-- 0191 also grants `authenticated` SELECT on ~35 columns of the BASE profiles
-- table, whose RLS SELECT policy is literally `using (true)`. A blocked member
-- can therefore skip the view entirely and read the same columns straight from
-- PostgREST. The view was a front door with the back door still open.
--
-- FIX. The base table enforces the same two-way predicate the view uses, so the
-- boundary is the table rather than the caller's choice of relation:
--
--   * a member always sees their own row (no self-lockout, and moderation flows
--     that read your own state keep working);
--   * otherwise the row is visible only if the viewer and subject are not
--     blocked in EITHER direction;
--   * `is_blocked_pair(auth.uid(), id)` is the same helper the view uses — one
--     definition of "blocked", not a second copy that can drift (0238 deleted
--     two such copies for exactly this reason). Its in-body guard permits the
--     call because the caller is one of the pair.
--
-- Service role and SECURITY DEFINER paths bypass RLS and are unaffected, which
-- is required: moderation, feed projection and admin surfaces must still resolve
-- names for people who have blocked each other.
--
-- COST. `blocks_blocked_idx (blocked_id, blocker_id)` from 0099 and the pair
-- index added by 0236 cover both directions of the EXISTS, so this is an
-- indexed lookup per row rather than a scan.

drop policy if exists "profiles readable by authenticated" on public.profiles;
create policy "profiles readable by authenticated" on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or not public.is_blocked_pair(auth.uid(), id)
  );

comment on table public.profiles is
  'Member profiles. KFU-004: the base-table SELECT policy is block-aware in both directions, so a '
  'blocked pair cannot read each other through PostgREST even though profiles_public exists. Column '
  'exposure is still governed by the 0191 grant list.';

select public.journal_migration('0282', '0282_profiles_block_boundary.sql', null,
  'KFU-004: the base profiles SELECT policy enforces the same two way block predicate as profiles_public, closing the direct PostgREST path around the block aware view. Self rows always visible; service and definer paths unaffected.');
