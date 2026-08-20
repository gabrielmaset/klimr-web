-- 0174_rank_snapshots_rls.sql — locks down public.rank_snapshots (audit SEC-009/ADD-03).
--
-- WHY: 0112 created rank_snapshots without enabling RLS, and 0043's DEFAULT
-- PRIVILEGES grant authenticated select/insert/update/delete (and anon select)
-- on every new table. Net effect today: any signed-in member can WRITE ranking
-- history over PostgREST and forge the nightly "ranking_move" feed cards.
-- The table is touched legitimately only by snapshot_and_emit_ranking_moves(),
-- a SECURITY DEFINER function — which bypasses both RLS and these grants, so
-- nothing operational changes.
--
-- Verified in a scratch Postgres 16 cluster before delivery: after this
-- migration, authenticated select/insert fail (42501) while the definer path
-- still inserts. Not risky — additive lockdown, no data touched, no backup
-- needed. FORWARD-FIX if ever required: re-grant select to authenticated and
-- add a read policy; never re-grant writes.

alter table public.rank_snapshots enable row level security;
-- No policies on purpose: with RLS on and zero policies, non-definer access is
-- denied even where a stray grant survives.

revoke all on table public.rank_snapshots from anon, authenticated, public;
