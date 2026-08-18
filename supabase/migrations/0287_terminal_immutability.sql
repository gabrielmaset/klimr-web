-- 0287_terminal_immutability.sql — I-series: terminal facts stop being editable,
-- and meetups get a state machine. KFU-013 + KFU-010.
--
-- KFU-013 FINDING. 0275 froze team-match STATUS transitions and said so in its
-- own comment: non-status edits stay under the flat manager policy. So a
-- completed match's scores and winner remain rewritable indefinitely, and
-- `recordResult` in the app explicitly re-enters on status = 'completed'. A
-- competition record that can be silently rewritten after the fact is not a
-- record. Corrections are legitimate; SILENT corrections are not.
--
-- KFU-010 FINDING. listing_meetups has member DML with no transition matrix and
-- no frozen identities: the counterparties, the listing and the offer can be
-- swapped after the fact, and any status can jump to any other. This is the
-- surface where two strangers agree to meet in person.
--
-- DESIGN.
--   * Terminal team-match rows (completed / declined / cancelled) are frozen
--     against every result-bearing and identity column. The ONLY way to change
--     one is `team_match_correct_result`, which is manager-gated, records the
--     before and after in an append-only audit table, and unlocks the trigger
--     with a TRANSACTION-LOCAL flag — the 0256/0257 precedent, not a definer
--     bypass, so a direct write still cannot do it.
--   * listing_meetups gains an insert shape check, frozen identities, and a
--     transition matrix with terminal states.

-- ── A. corrections are recorded, never silent ───────────────────────────────
create table if not exists public.team_match_result_corrections (
  id            uuid primary key default gen_random_uuid(),
  match_id      uuid not null references public.team_matches(id) on delete cascade,
  corrected_by  uuid not null,
  reason        text not null,
  before_home   int,
  before_away   int,
  before_winner uuid,
  after_home    int,
  after_away    int,
  after_winner  uuid,
  corrected_at  timestamptz not null default now()
);

alter table public.team_match_result_corrections enable row level security;
revoke all on public.team_match_result_corrections from anon, authenticated;
grant all on public.team_match_result_corrections to service_role;

drop policy if exists "corrections readable by involved members" on public.team_match_result_corrections;
create policy "corrections readable by involved members" on public.team_match_result_corrections
  for select to authenticated using (
    exists (
      select 1 from public.team_matches m
       where m.id = match_id
         and (public.is_team_member(m.home_team_id, auth.uid())
              or public.is_team_member(m.away_team_id, auth.uid()))
    )
  );

comment on table public.team_match_result_corrections is
  'KFU-013: append-only before/after record of every change to a completed result. A correction that '
  'leaves no trace is indistinguishable from tampering.';

-- ── B. the guard: terminal rows are frozen ──────────────────────────────────
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

  -- KFU-013: a terminal row is a record. Every result-bearing and identity
  -- column is frozen unless the correction command has unlocked this
  -- transaction. 0275 froze the status transitions and left these editable —
  -- its own comment said so, which is how the gap was found.
  if old.status in ('completed','declined','cancelled')
     and coalesce(current_setting('klimr.result_correction', true), '') <> '1' then
    if new.home_score is distinct from old.home_score
       or new.away_score is distinct from old.away_score
       or new.winner_team_id is distinct from old.winner_team_id
       or new.home_team_id is distinct from old.home_team_id
       or new.away_team_id is distinct from old.away_team_id
       or new.sport_key is distinct from old.sport_key
       or new.status is distinct from old.status then
      raise exception 'result_is_final'
        using errcode = 'P0001',
              hint = 'Completed results are corrected through the recorded correction command, not by editing.';
    end if;
  end if;

  if new.status is distinct from old.status then
    if old.status = 'proposed' and new.status in ('scheduled','declined') then
      if not public.is_team_manager(old.away_team_id, auth.uid()) then
        raise exception 'away_managers_only' using errcode = 'P0001';
      end if;
    elsif old.status = 'proposed' and new.status = 'cancelled' then
      null;
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

-- ── C. the only legitimate way to change a finished result ──────────────────
create or replace function public.team_match_correct_result(
  p_match  uuid,
  p_home   int,
  p_away   int,
  p_winner uuid,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_status text;
  v_home_team uuid;
  v_away_team uuid;
  v_b_home int;
  v_b_away int;
  v_b_winner uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'sign_in_required' using errcode = 'P0001';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  if p_home is null or p_away is null then
    raise exception 'scores_required' using errcode = 'P0001';
  end if;

  perform 1 from public.team_matches where id = p_match for update;
  v_status    := (select m.status from public.team_matches m where m.id = p_match);
  v_home_team := (select m.home_team_id from public.team_matches m where m.id = p_match);
  v_away_team := (select m.away_team_id from public.team_matches m where m.id = p_match);
  if v_status is null then
    raise exception 'match_not_found' using errcode = 'P0002';
  end if;
  if v_status <> 'completed' then
    raise exception 'not_completed' using errcode = 'P0001';
  end if;
  if not (public.is_team_manager(v_home_team, v_uid) or public.is_team_manager(v_away_team, v_uid)) then
    raise exception 'not_a_manager' using errcode = 'P0001';
  end if;
  if p_winner is not null and p_winner not in (v_home_team, v_away_team) then
    raise exception 'winner_not_in_match' using errcode = 'P0001';
  end if;

  v_b_home   := (select m.home_score from public.team_matches m where m.id = p_match);
  v_b_away   := (select m.away_score from public.team_matches m where m.id = p_match);
  v_b_winner := (select m.winner_team_id from public.team_matches m where m.id = p_match);

  -- Record BEFORE mutating: an audit row written after the fact can be lost with
  -- the same failure that loses the reason for writing it.
  insert into public.team_match_result_corrections
    (match_id, corrected_by, reason, before_home, before_away, before_winner,
     after_home, after_away, after_winner)
  values
    (p_match, v_uid, btrim(p_reason), v_b_home, v_b_away, v_b_winner, p_home, p_away, p_winner);

  -- Transaction-local unlock (0256/0257 precedent). A direct UPDATE cannot set
  -- this, so the freeze still holds against the data plane.
  perform set_config('klimr.result_correction', '1', true);
  update public.team_matches
     set home_score = p_home, away_score = p_away, winner_team_id = p_winner
   where id = p_match;
  perform set_config('klimr.result_correction', '0', true);
end;
$$;

revoke all on function public.team_match_correct_result(uuid, int, int, uuid, text) from public, anon;
grant execute on function public.team_match_correct_result(uuid, int, int, uuid, text) to authenticated, service_role;

-- ── D. KFU-010: the meetup state machine ────────────────────────────────────
create or replace function public.listing_meetups_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller uuid;
begin
  if tg_op = 'INSERT' then
    if new.status is distinct from 'proposed' then
      raise exception 'meetups_start_proposed' using errcode = 'P0001';
    end if;
    -- The listings table names the owner `listed_by` (verified in the catalog,
    -- not assumed from the domain word 'seller').
    v_seller := (select l.listed_by from public.marketplace_listings l where l.id = new.listing_id);
    if v_seller is null then
      raise exception 'listing_not_found' using errcode = 'P0002';
    end if;
    -- Only the two counterparties may propose, and the proposer must be one of
    -- them: a third party arranging a meeting between strangers is the shape
    -- this guard exists to refuse.
    if auth.uid() is not null
       and new.proposed_by is distinct from auth.uid() then
      raise exception 'proposer_must_be_caller' using errcode = 'P0001';
    end if;
    if new.proposed_by not in (v_seller, new.buyer_id) then
      raise exception 'not_a_counterparty' using errcode = 'P0001';
    end if;
    return new;
  end if;

  -- Identities are frozen after the proposal: who is meeting whom, about what,
  -- cannot change underneath an agreement.
  if new.listing_id is distinct from old.listing_id
     or new.offer_id is distinct from old.offer_id
     or new.buyer_id is distinct from old.buyer_id
     or new.proposed_by is distinct from old.proposed_by then
    raise exception 'meetup_identities_frozen' using errcode = 'P0001';
  end if;

  if new.status is distinct from old.status then
    -- The vocabulary is the table's own CHECK constraint, read from the catalog:
    -- proposed | accepted | declined | cancelled. There is no 'completed' state,
    -- and a guard that permitted one would encode a status the schema forbids.
    if old.status = 'proposed' and new.status in ('accepted','declined','cancelled') then
      null;
    elsif old.status = 'accepted' and new.status = 'cancelled' then
      null;  -- an agreed meeting can still fall through
    else
      raise exception 'bad_meetup_transition' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.listing_meetups_guard() from public, anon, authenticated;

drop trigger if exists listing_meetups_guard on public.listing_meetups;
create trigger listing_meetups_guard
  before insert or update on public.listing_meetups
  for each row execute function public.listing_meetups_guard();

insert into public.function_contracts (signature, class, audience, caller_bound, note) values
  ('public.team_match_correct_result(uuid,integer,integer,uuid,text)', 'public_rpc', 'authenticated', true,
   'Derives the actor from auth.uid(); manager-gated; writes an append-only audit row before mutating.')
on conflict (signature) do update set class = excluded.class, note = excluded.note;

insert into public.data_inventory (table_name, user_ref, export_scope, dataset_name, erasure, note) values
  ('team_match_result_corrections','corrected_by','included','result_corrections','retain_legal',
   'Competition audit record; retained where a result stands.')
on conflict (table_name) do update set export_scope = excluded.export_scope, erasure = excluded.erasure;

select public.journal_migration('0287', '0287_terminal_immutability.sql', null,
  'KFU-013 and KFU-010: completed team match results are frozen against silent edits and can only change through a manager gated correction command that records before and after, and listing meetups gain an insert shape check, frozen counterparty identities and a transition matrix.');
