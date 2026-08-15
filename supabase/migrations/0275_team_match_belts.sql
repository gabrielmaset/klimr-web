-- 0275_team_match_belts.sql — the challenge rules become database belts.
-- D-41, hardening half.
--
-- WHAT EXISTS. The application enforces every rule (same sport, manager
-- gating, away-side accept, terminal states) and RLS already restricts
-- writes to involved managers. But the UPDATE policy is flat: any involved
-- manager may set any status — a HOME manager could accept their own
-- challenge with a direct API call, bypassing respondChallenge. And the
-- same-sport rule exists only in application code.
--
-- WHAT THIS ADDS. One guard trigger mirroring the application semantics
-- exactly, so a direct PostgREST write obeys the same rules the buttons do:
--   INSERT   both teams alive, distinct, and the SAME SPORT; the row's
--            sport_key must equal the teams' sport.
--   UPDATE   the transition matrix —
--              proposed  → scheduled | declined   AWAY managers only
--              proposed  → cancelled              either side's managers
--              scheduled → completed              either side's managers,
--                                                 with both scores present
--                                                 and winner consistent
--              scheduled → cancelled              either side's managers
--            everything else is refused; completed, declined and cancelled
--            are terminal. Non-status edits (scheduling details) stay under
--            the existing manager policy.
--
-- The trigger reuses is_team_manager — the same helper the RLS policies
-- use — so the challenge rule (owner, manager, staff) has exactly one
-- definition.

create or replace function public.team_matches_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_home_sport text;
  v_away_sport text;
begin
  if tg_op = 'INSERT' then
    if new.home_team_id = new.away_team_id then
      raise exception 'same_team' using errcode = 'P0001';
    end if;
    v_home_sport := (select t.sport_key from public.teams t where t.id = new.home_team_id and t.deleted_at is null);
    v_away_sport := (select t.sport_key from public.teams t where t.id = new.away_team_id and t.deleted_at is null);
    if v_home_sport is null or v_away_sport is null then
      raise exception 'team_not_found' using errcode = 'P0002';
    end if;
    if v_home_sport <> v_away_sport then
      raise exception 'sport_mismatch' using errcode = 'P0001';
    end if;
    if new.sport_key <> v_home_sport then
      raise exception 'sport_mismatch' using errcode = 'P0001';
    end if;
    return new;
  end if;

  -- UPDATE
  if new.status is distinct from old.status then
    if old.status = 'proposed' and new.status in ('scheduled','declined') then
      if not public.is_team_manager(old.away_team_id, auth.uid()) then
        raise exception 'away_managers_only' using errcode = 'P0001';
      end if;
    elsif old.status = 'proposed' and new.status = 'cancelled' then
      null; -- either side's managers; the RLS update policy already requires one
    elsif old.status = 'scheduled' and new.status = 'completed' then
      if new.home_score is null or new.away_score is null then
        raise exception 'scores_required' using errcode = 'P0001';
      end if;
      if new.winner_team_id is not null
         and new.winner_team_id not in (old.home_team_id, old.away_team_id) then
        raise exception 'winner_not_in_match' using errcode = 'P0001';
      end if;
    elsif old.status = 'scheduled' and new.status = 'cancelled' then
      null;
    else
      raise exception 'bad_transition' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.team_matches_guard() from public, anon, authenticated;

drop trigger if exists team_matches_guard on public.team_matches;
create trigger team_matches_guard
  before insert or update on public.team_matches
  for each row execute function public.team_matches_guard();

select public.journal_migration('0275', '0275_team_match_belts.sql', null,
  'Challenge rules become database belts: one guard trigger enforces same sport at insert and the status transition matrix, with away managers alone able to accept or decline a proposal. Mirrors the application semantics through the shared is_team_manager helper.');
