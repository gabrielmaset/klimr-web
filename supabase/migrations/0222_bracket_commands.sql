-- 0222_bracket_commands.sql — KCDX-046 (P1): tournament bracket, result,
-- rollback and schedule graph edits can partially commit.
--
-- ── RECORDING A RESULT ───────────────────────────────────────────────────
-- `recordMatchScore` updates the match with no compare-and-swap on status, then
-- pushes the winner into the next match's slot as a SEPARATE statement.
--
-- Two staff at a desk recording different scores for the same match — which is
-- exactly what happens when one person is entering results from a sheet while
-- another is entering them from the court — both write. Last one wins, and each
-- has already pushed a different entrant into the downstream slot, so the
-- bracket can end up advancing the player who lost. If the process dies between
-- the two statements, the match is completed and nobody advances at all.
--
-- ── CLEARING A RESULT: THE DANGEROUS ONE ─────────────────────────────────
-- `clearMatchScore` sets the source back to pending and nulls the downstream
-- slot **unconditionally** — with no check on whether that downstream match has
-- already been played.
--
-- So correcting a quarter-final score after the semi-final has been played
-- removes a player from the semi they already won, while the semi's own result
-- and its own advancement stay exactly where they are. The bracket is left with
-- a completed match whose entrant is null and a final containing someone who
-- advanced from a match that no longer says they won. Nothing detects it, and
-- there is no way to reconstruct what happened from the rows that remain.
--
-- A correction that invalidates played matches is not a correction — it is an
-- adjudication, and it needs a human decision about the downstream results. The
-- command refuses and says so, rather than quietly making the bracket
-- incoherent.
--
-- ── WHAT IS NOT HERE ─────────────────────────────────────────────────────
-- Graph GENERATION (draw creation, round linking, bye advancement) still runs as
-- application loops, and the finding asks for revisioned procedures for that
-- too. It is a larger piece — an immutable structure revision that schedules and
-- brackets bind to — and doing it badly would be worse than the current state,
-- because a half-revisioned graph is harder to reason about than an unrevisioned
-- one. Recorded as outstanding rather than half-built.

create or replace function public.tournament_score_match(
  p_match           uuid,
  p_score_a         integer,
  p_score_b         integer,
  p_expected_status text default null   -- optimistic concurrency: what the caller saw
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_m record; v_winner uuid; v_next record;
begin
  select * into v_m from public.tournament_matches where id = p_match for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

  if not (public.is_privileged_writer() or public.is_tournament_staff(v_m.tournament_id)) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;

  -- If the caller told us what they were looking at, refuse when it has moved.
  -- Two people entering results for the same match is not hypothetical: one
  -- works from the sheet, one from the court.
  if p_expected_status is not null and v_m.status is distinct from p_expected_status then
    return jsonb_build_object('ok', false, 'error', 'changed_since_view', 'status', v_m.status);
  end if;

  v_winner := case
                when p_score_a > p_score_b then v_m.entry_a
                when p_score_b > p_score_a then v_m.entry_b
                else null
              end;

  -- If this match already advanced someone and the winner is changing, the
  -- downstream slot must not be left holding the loser.
  if v_m.next_match_id is not null then
    select * into v_next from public.tournament_matches where id = v_m.next_match_id for update;
    if v_next.status = 'completed' and v_m.winner_id is distinct from v_winner then
      return jsonb_build_object('ok', false, 'error', 'downstream_played',
        'detail', 'The next match has already been played. Changing this result needs an adjudication.');
    end if;
  end if;

  update public.tournament_matches
     set score_a = greatest(0, p_score_a),
         score_b = greatest(0, p_score_b),
         winner_id = v_winner,
         status = 'completed',
         updated_at = now()
   where id = p_match;

  -- Same transaction: the result and the advancement it implies cannot separate.
  if v_m.next_match_id is not null then
    if v_m.next_slot = 'b' then
      update public.tournament_matches set entry_b = v_winner, updated_at = now() where id = v_m.next_match_id;
    else
      update public.tournament_matches set entry_a = v_winner, updated_at = now() where id = v_m.next_match_id;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'winner_id', v_winner, 'tournament_id', v_m.tournament_id);
end;
$$;

create or replace function public.tournament_clear_match(p_match uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_m record; v_next record;
begin
  select * into v_m from public.tournament_matches where id = p_match for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

  if not (public.is_privileged_writer() or public.is_tournament_staff(v_m.tournament_id)) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;

  -- THE CHECK THAT WAS MISSING. Clearing a result that has already been played
  -- forward removes an entrant from a match that has finished — leaving a
  -- completed match with a null side, and a bracket nobody can reconstruct.
  if v_m.next_match_id is not null then
    select * into v_next from public.tournament_matches where id = v_m.next_match_id for update;
    if v_next.status = 'completed' or v_next.score_a is not null or v_next.score_b is not null then
      return jsonb_build_object('ok', false, 'error', 'downstream_played',
        'detail', 'The next match has already been played. Clearing this result needs an adjudication.');
    end if;
  end if;

  update public.tournament_matches
     set score_a = null, score_b = null, winner_id = null, status = 'pending', updated_at = now()
   where id = p_match;

  if v_m.next_match_id is not null then
    if v_m.next_slot = 'b' then
      update public.tournament_matches set entry_b = null, updated_at = now() where id = v_m.next_match_id;
    else
      update public.tournament_matches set entry_a = null, updated_at = now() where id = v_m.next_match_id;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'tournament_id', v_m.tournament_id);
end;
$$;

revoke all on function public.tournament_score_match(uuid, integer, integer, text) from public, anon;
revoke all on function public.tournament_clear_match(uuid) from public, anon;
grant execute on function public.tournament_score_match(uuid, integer, integer, text) to authenticated, service_role;
grant execute on function public.tournament_clear_match(uuid) to authenticated, service_role;

-- ── the invariant a broken bracket violates ──────────────────────────────
create or replace function public.bracket_graph_intact()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- A completed match with an empty side is the signature of a rollback that
  -- reached past played matches.
  select not exists (
    select 1 from public.tournament_matches
     where status = 'completed'
       and (entry_a is null or entry_b is null)
       and winner_id is not null
  );
$$;

revoke all on function public.bracket_graph_intact() from public, anon, authenticated;
grant execute on function public.bracket_graph_intact() to service_role;
