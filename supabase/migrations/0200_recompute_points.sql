-- 0200_recompute_points.sql — KCDX-050 (P1): ranking recomputation can
-- overwrite canonical points after partial reads.
--
-- WHAT THE OLD CODE DID. `recomputePlayerPoints` issued two reads — the
-- tournament ledger and the queue ledger — then computed the best-N total and
-- upserted it into `player_sports.points`. Both reads were consumed as
-- `result.data ?? []`. A supabase-js read that ERRORS returns `data: null`, so a
-- transient failure on either ledger silently became an empty ledger, the total
-- was computed from whatever survived, and that number was written as canonical.
--
-- The failure is quiet and it is durable. Nobody sees an error; a player's
-- tournament results simply stop counting until something recomputes them again,
-- and rankings are the product's core claim. "Read failed, so write zero" is the
-- worst possible interpretation of a network blip.
--
-- WHY A FUNCTION RATHER THAN AN ERROR CHECK. Checking both reads would fix the
-- silent-zero, and the audit says as much — but it leaves two round trips with a
-- window between them, and a ledger row landing in that window still produces a
-- total that was never true at any instant. Computed inside one statement, the
-- two ledgers are read in one snapshot: the answer corresponds to a real state of
-- the database, and there is no partial-read case left to handle.
--
-- CONSTANTS. ROLLING_WEEKS = 52 and ROLLING_BEST = 8 are mirrored from
-- `lib/ranking.ts`. Duplicated constants drift, so `tests/doc-claims.test.ts`
-- asserts these two numbers match the TypeScript source — change one and the
-- build tells you about the other.

create or replace function public.recompute_player_points(
  p_user  uuid,
  p_sport text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff timestamptz := now() - interval '52 weeks';   -- ROLLING_WEEKS
  v_total  integer;
begin
  -- One statement, one snapshot, both ledgers. There is no arrangement of
  -- concurrent writes that yields a total which was never true.
  select coalesce(sum(points), 0) into v_total
    from (
      select points
        from (
          select points, earned_at from public.tournament_points
           where user_id = p_user and sport_key = p_sport and earned_at > v_cutoff
          union all
          select points, earned_at from public.queue_points
           where user_id = p_user and sport_key = p_sport and earned_at > v_cutoff
        ) pool
       order by points desc
       limit 8                                            -- ROLLING_BEST
    ) best;

  -- `guard_player_stats` reverts any change to points/matches_played/wins unless
  -- `current_user` is literally `service_role`. Inside a SECURITY DEFINER function
  -- the current_user is the DEFINER — postgres — so without this flag the write
  -- below is silently discarded and this function returns a correct number that
  -- was never stored. (Which is exactly what the first run of this migration did;
  -- the test caught it only because it asserted the STORED value, not the
  -- returned one.) The flag is transaction-local and names itself.
  perform set_config('klimr.stats_writer', 'on', true);

  -- Only `points` is written here. matches_played / wins belong to their own
  -- writers and an upsert that names them would silently reset them.
  insert into public.player_sports (user_id, sport_key, points, updated_at)
  values (p_user, p_sport, v_total, now())
  on conflict (user_id, sport_key)
  do update set points = excluded.points, updated_at = excluded.updated_at;

  return v_total;
end;
$$;

revoke all on function public.recompute_player_points(uuid, text) from public, anon, authenticated;
grant execute on function public.recompute_player_points(uuid, text) to service_role;

comment on function public.recompute_player_points is
  'KCDX-050: best-8-of-52-weeks across both points ledgers, computed and written in one snapshot. '
  'The caller must treat an error as "do not write" — which it now is, because the write is in here.';

-- ── the guard learns about the canonical writer ───────────────────────────
-- `guard_player_stats` exists to stop MEMBERS editing their own ranking stats,
-- and it should keep doing exactly that. It now also honours the transaction-local
-- flag that `recompute_player_points` sets — the one function whose entire job is
-- to write `points`. Anything else still has to be `service_role`.
--
-- A flag rather than a role check because the check that failed was a role check:
-- `current_user` is not the caller's role inside a definer function, and every
-- future definer function that touches this table would hit the same wall.
create or replace function public.guard_player_stats()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user <> 'service_role'
     and coalesce(current_setting('klimr.stats_writer', true), '') <> 'on' then
    new.points := old.points;
    new.matches_played := old.matches_played;
    new.wins := old.wins;
  end if;
  return new;
end;
$$;
