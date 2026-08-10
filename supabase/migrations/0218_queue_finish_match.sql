-- 0218_queue_finish_match.sql — KCDX-041 (P1): queue match and ranking
-- transitions are non-transactional and retry-unsafe.
--
-- ── WHAT FINISHING A MATCH DID ───────────────────────────────────────────
-- Eight separate writes, in sequence, from application code:
--
--   1. finalize the match           (CAS on status='live' — this one was right)
--   2. loser team → done
--   3. read winner.wins, add one, write status/wins/hold_court
--   4. upsert the points ledger     (idempotent on (match_id, user_id))
--   5. per player: READ matches_played/wins, upsert +1
--   6. recompute ranking points
--   7. stamp last_result_at
--   8. start the next match
--
-- The CAS on (1) makes a full retry a no-op, which sounds protective and is the
-- opposite. If the process dies after (1) — a serverless invocation reclaimed,
-- a deploy mid-request, a network drop — the match is FINAL and steps 2 through
-- 7 never happen. And because the CAS now fails, no retry can ever fix it: the
-- winner never advances, nobody gets their points, the counters never move, and
-- nothing anywhere records that any of it is owed.
--
-- Step (5) is separately wrong even on the happy path: read-modify-write on
-- `matches_played` and `wins`. Two matches finishing on two courts at the same
-- venue at the same moment, sharing a player, and one increment is lost.
--
-- ── ONE TRANSACTION ──────────────────────────────────────────────────────
-- All of it moves into a single command that locks the match, validates the
-- transition, and writes every consequence together. Either the match is
-- finished and everyone has their points, or nothing happened and the caller can
-- retry safely.
--
-- Counters are incremented ATOMICALLY (`matches_played = matches_played + 1`)
-- rather than read-then-written, so concurrent finishes on different courts
-- cannot lose an increment. The ledger keeps its natural key, so a retry that
-- somehow re-enters cannot double-award.
--
-- Points values mirror `lib/ranking.ts` (PICKUP_WIN_POINTS 12, PICKUP_LOSS_POINTS
-- 4); a guardrail test asserts the two stay in step.

create or replace function public.queue_finish_match(
  p_match  uuid,
  p_winner uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m       record;
  v_loser   uuid;
  v_sport   text;
  v_cap     int;
  v_wins    int;
  v_players int := 0;
begin
  -- Lock the match first: it is the thing two operators can race on.
  select * into v_m from public.queue_matches where id = p_match for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

  -- Idempotent by state, not by luck: a second call on a finished match reports
  -- success without re-awarding anything.
  if v_m.status <> 'live' then
    return jsonb_build_object('ok', true, 'already_final', true);
  end if;
  if p_winner is distinct from v_m.team_a and p_winner is distinct from v_m.team_b then
    return jsonb_build_object('ok', false, 'error', 'winner_not_in_match');
  end if;

  v_loser := case when p_winner = v_m.team_a then v_m.team_b else v_m.team_a end;

  select sport_key, coalesce(win_cap, 2) into v_sport, v_cap
    from public.court_sessions where id = v_m.session_id;

  update public.queue_matches
     set status = 'final', winner_team = p_winner, ended_at = now()
   where id = p_match;

  update public.queue_teams set status = 'done' where id = v_loser;

  -- Winner: atomic increment, then hold the court or retire at the cap.
  update public.queue_teams
     set wins = coalesce(wins, 0) + 1
   where id = p_winner
  returning wins into v_wins;

  if v_wins >= v_cap then
    update public.queue_teams set status = 'done' where id = p_winner;
  else
    update public.queue_teams
       set status = 'queued', hold_court = true, queued_at = now()
     where id = p_winner;
  end if;

  -- The immutable ledger, in the same transaction as the result it records.
  if v_sport is not null then
    insert into public.queue_points (user_id, sport_key, session_id, match_id, points, won, earned_at)
    select m.user_id, v_sport, v_m.session_id, p_match,
           case when m.team_id = p_winner then 12 else 4 end,     -- lib/ranking.ts
           m.team_id = p_winner,
           now()
      from public.queue_team_members m
     where m.team_id in (v_m.team_a, v_m.team_b)
       and m.user_id is not null
    on conflict (match_id, user_id) do nothing;

    -- Counters, incremented rather than read-then-written: two courts finishing
    -- at once with a shared player used to lose one of the increments.
    perform set_config('klimr.privileged_write', 'on', true);

    insert into public.player_sports as ps (user_id, sport_key, matches_played, wins, last_result_at, updated_at)
    select m.user_id, v_sport, 1, case when m.team_id = p_winner then 1 else 0 end, now(), now()
      from public.queue_team_members m
     where m.team_id in (v_m.team_a, v_m.team_b)
       and m.user_id is not null
    on conflict (user_id, sport_key) do update
      set matches_played = coalesce(ps.matches_played, 0) + 1,
          wins           = coalesce(ps.wins, 0) + excluded.wins,
          last_result_at = now(),
          updated_at     = now();

    -- Ranking points are derived from the ledger, so this reads what was just
    -- written and cannot disagree with it.
    perform public.recompute_player_points(m.user_id, v_sport)
       from public.queue_team_members m
      where m.team_id in (v_m.team_a, v_m.team_b) and m.user_id is not null;

    select count(*) into v_players
      from public.queue_team_members m
     where m.team_id in (v_m.team_a, v_m.team_b) and m.user_id is not null;
  end if;

  return jsonb_build_object(
    'ok', true, 'session_id', v_m.session_id, 'court_id', v_m.court_id,
    'winner', p_winner, 'loser', v_loser, 'winner_wins', v_wins,
    'winner_retired', v_wins >= v_cap, 'players_scored', v_players);
end;
$$;

revoke all on function public.queue_finish_match(uuid, uuid) from public, anon, authenticated;
grant execute on function public.queue_finish_match(uuid, uuid) to service_role;

comment on function public.queue_finish_match is
  'KCDX-041: finishing a match in ONE transaction — finalize, advance or retire the winner, retire the '
  'loser, write the immutable ledger, increment counters atomically, recompute ranking. Idempotent by '
  'state: a second call on a finished match reports success and awards nothing.';
