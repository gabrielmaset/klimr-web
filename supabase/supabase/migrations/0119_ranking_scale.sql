-- 0119_ranking_scale.sql — ranking system at scale.
-- (1) snapshot_and_emit_ranking_moves ranked a LIFETIME raw sum of queue_points
--     (no window, no best-8, no tournament_points — inconsistent with the real
--     ladder) via a nightly full-table aggregate (O(all ledger rows ever)).
--     Rewritten to read player_sports.points — the canonical best-8/52-week
--     number recomputePlayerPoints maintains — one indexed pass over ranked
--     players, tournaments included, consistent by construction. The emitter
--     contract (object_kind 'ranking', meta sport/from/to/climbed, top-200,
--     climb ≥ 5, 14-day snapshot retention) is unchanged.
-- (2) Composite indexes for the recompute read pattern on both ledgers.

create index if not exists queue_points_user_sport_earned_idx
  on public.queue_points (user_id, sport_key, earned_at desc);
create index if not exists tournament_points_user_sport_earned_idx
  on public.tournament_points (user_id, sport_key, earned_at desc);

create or replace function public.snapshot_and_emit_ranking_moves()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare today date := current_date;
declare prev date;
begin
  insert into public.rank_snapshots (snap_date, user_id, sport_key, points, rank)
  select today, ps.user_id, ps.sport_key, ps.points::int,
         rank() over (partition by ps.sport_key order by ps.points desc)::int
  from public.player_sports ps
  where ps.points > 0
  on conflict (snap_date, user_id, sport_key) do update
    set points = excluded.points, rank = excluded.rank;

  select max(snap_date) into prev from public.rank_snapshots where snap_date < today;
  if prev is null then return; end if;

  perform public.feed_emit(
    'ranking_move', cur.user_id, p.home_zip, 'ranking', cur.user_id,
    jsonb_build_object('sport', cur.sport_key, 'from', old.rank, 'to', cur.rank, 'climbed', old.rank - cur.rank),
    'ranking_move:' || cur.user_id || ':' || cur.sport_key || ':' || today,
    'region', cur.sport_key)
  from public.rank_snapshots cur
  join public.rank_snapshots old
    on old.snap_date = prev and old.user_id = cur.user_id and old.sport_key = cur.sport_key
  join public.profiles p on p.id = cur.user_id
  where cur.snap_date = today
    and cur.rank <= 200
    and old.rank - cur.rank >= 5
    and p.home_zip is not null;

  delete from public.rank_snapshots where snap_date < today - interval '14 days';
end $$;
