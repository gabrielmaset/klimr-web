-- 0292_tournament_party_capacity.sql — the whole party gets one honest admission.
--
-- KFU-012, all three citations, each reproduced by execution on 2026-08-18
-- against the unfixed head before this file existed:
--   * v_taken + 1: tournament_register reserved ONE seat while
--     tournament_register_team then seated the roster in the same transaction
--     with no capacity check — cap 4, five seated, ok:true.
--   * ON CONFLICT DO NOTHING filtering: a stranger in a roster of five produced
--     roster_added:3 and ok:true — silently, with the caller reading only ok.
--   * The app's capacityBlock counted persons: main.length while the command
--     counted +1 — KRA-034's app/command drift, again.
--
-- WHAT THIS DOES.
--   * tournament_register gains p_party_size (default 1: every existing caller
--     unchanged) and decides person-mode capacity as v_taken + party — one lock,
--     one count, one decision for the whole admission. Old signature dropped:
--     a defaulted overload would be ambiguous (the 0214 rule).
--   * tournament_register_team validates the roster EXACTLY first — duplicates
--     raise, non-members raise with the offending id — computes the party
--     (roster plus captain), passes it into the one decision, inserts the roster
--     with the captain excluded and NO conflict clause, and asserts the seated
--     count equals the party minus the captain. Silent filtering is gone;
--     every rejection is loud and names its reason.
--   * tournament_capacity_intact() additionally asserts the party math and the
--     absence of a conflict clause in the roster insert, so a regression turns
--     the readiness gate red.
-- Production data repair: none needed — production was wiped to zero entries
-- on 2026-08-18; the harness repro rolled back.

begin;

drop function if exists public.tournament_register(uuid, uuid, uuid, jsonb, boolean, boolean);

create or replace function public.tournament_register(
  p_tournament uuid,
  p_division   uuid default null,
  p_team       uuid default null,
  p_answers    jsonb default '{}'::jsonb,
  p_accept_waiver boolean default false,
  p_accept_rules  boolean default false,
  p_party_size    integer default 1          -- 0292: seats this admission takes in person mode
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me      uuid := auth.uid();
  v_t       record;
  v_div     record;
  v_div_cap int;
  v_taken   int;
  v_cap     int;
  v_status  text;
  v_reg     uuid;
  v_now     timestamptz := now();
  v_mode    text;
  v_unit    text;
begin
  if v_me is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;

  if not exists (select 1 from public.profiles where id = v_me and account_status = 'active') then
    return jsonb_build_object('ok', false, 'error', 'account_not_active');
  end if;

  -- The lock is the whole point: capacity is a fact about a set, and it has to
  -- stay true between the count and the insert.
  select * into v_t from public.tournaments where id = p_tournament for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

  if v_t.cancelled_at is not null or v_t.suspended_at is not null then
    return jsonb_build_object('ok', false, 'error', 'not_accepting');
  end if;
  if v_t.registration_opens_at is not null and v_t.registration_opens_at > v_now then
    return jsonb_build_object('ok', false, 'error', 'not_open_yet');
  end if;
  if v_t.registration_deadline is not null and v_t.registration_deadline < v_now then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;

  -- Cross-binding: a division id from another tournament is not a division here.
  if p_division is not null then
    select * into v_div from public.tournament_divisions
     where id = p_division and tournament_id = p_tournament;
    if not found then return jsonb_build_object('ok', false, 'error', 'bad_division'); end if;
    v_div_cap := v_div.capacity;
  end if;

  -- Cross-binding: you may only enter a team you manage.
  if p_team is not null then
    if v_t.entry_type = 'individual' then
      return jsonb_build_object('ok', false, 'error', 'individual_event');
    end if;
    if not exists (
      select 1 from public.team_members
       where team_id = p_team and user_id = v_me and role in ('owner','manager')
    ) then
      return jsonb_build_object('ok', false, 'error', 'not_your_team');
    end if;
  end if;

  if exists (
    select 1 from public.tournament_registrations r
     where r.tournament_id = p_tournament
       and (p_division is null or r.division_id = p_division)
       and r.registrant_id = v_me
       and r.status not in ('withdrawn','declined','cancelled')
  ) then
    return jsonb_build_object('ok', false, 'error', 'already_registered');
  end if;

  -- KRA-034: read the SAME configuration the UI reads, from format_config.
  -- Defaults match `capacityBlock()` exactly: pooled, and team.
  v_mode := case when coalesce(v_t.format_config ->> 'capacity_mode', '') = 'per_division'
                 then 'per_division' else 'pooled' end;
  v_unit := case when coalesce(v_t.format_config ->> 'capacity_unit', '') = 'person'
                 then 'person' else 'team' end;

  -- In per_division mode a registration with no division cannot breach a
  -- division cap, matching the UI's `if (!divisionId) return null`.
  if v_mode = 'per_division' then
    v_cap := case when p_division is null then null else v_div_cap end;
  else
    v_cap := v_t.capacity;
  end if;

  if v_cap is not null then
    if v_unit = 'person' then
      -- Count non-reserve PLAYERS: a doubles pair fills two seats of a
      -- person-capped draw, which is the entire reason the unit exists.
      select count(*) into v_taken
        from public.tournament_registration_players rp
        join public.tournament_registrations r on r.id = rp.registration_id
       where r.tournament_id = p_tournament
         and (v_mode <> 'per_division' or r.division_id = p_division)
         and rp.is_reserve = false
         and r.status not in ('withdrawn','declined','cancelled','disqualified','waitlisted');
    else
      select count(*) into v_taken
        from public.tournament_registrations r
       where r.tournament_id = p_tournament
         and (v_mode <> 'per_division' or r.division_id = p_division)
         and r.status not in ('withdrawn','declined','cancelled','disqualified','waitlisted');
    end if;

    -- This registration adds one seat in team mode, and one PERSON below (the
    -- registrant); a roster added afterwards is checked by its own path.
    -- 0292 (KFU-012): admit the PARTY, not one seat. A team entry's roster lands
    -- in this same transaction; counting +1 admitted five people into a four-
    -- person draw (executed repro 2026-08-18). The app's own capacityBlock
    -- already counted persons: main.length — command and UI now agree again.
    v_status := case when v_taken + greatest(coalesce(p_party_size, 1), 1) > v_cap
                     then 'waitlisted' else 'pending' end;
  else
    v_status := 'pending';
  end if;

  insert into public.tournament_registrations
    (tournament_id, division_id, team_id, registrant_id, status, payment_status, team_answers)
  values
    (p_tournament, p_division, p_team, v_me, v_status, 'unpaid', coalesce(p_answers, '{}'::jsonb))
  returning id into v_reg;

  if v_status = 'waitlisted' then
    update public.tournament_registrations
       set waitlist_position = (
             select count(*) from public.tournament_registrations
              where tournament_id = p_tournament and status = 'waitlisted')
     where id = v_reg;
  end if;

  insert into public.tournament_registration_players
    (registration_id, tournament_id, user_id, is_reserve,
     waiver_accepted_at, waiver_version, rules_accepted_at, rules_version,
     player_answers, confirmed_at)
  values
    (v_reg, p_tournament, v_me, false,
     case when p_accept_waiver then v_now end, case when p_accept_waiver then '1' end,
     case when p_accept_rules  then v_now end, case when p_accept_rules  then '1' end,
     coalesce(p_answers, '{}'::jsonb), v_now);

  return jsonb_build_object('ok', true, 'registration_id', v_reg, 'status', v_status);
end;
$$;


revoke all on function public.tournament_register(uuid, uuid, uuid, jsonb, boolean, boolean, integer) from public, anon;
grant execute on function public.tournament_register(uuid, uuid, uuid, jsonb, boolean, boolean, integer) to authenticated, service_role;

create or replace function public.tournament_register_team(
  p_tournament    uuid,
  p_division      uuid default null,
  p_team          uuid default null,
  p_roster        jsonb default '[]'::jsonb,   -- [{user_id, is_reserve}]
  p_answers       jsonb default '{}'::jsonb,
  p_accept_waiver boolean default false,
  p_accept_rules  boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me      uuid := auth.uid();
  v_out     jsonb;
  v_reg     uuid;
  v_added   int := 0;
  v_ids     uuid[];
  v_raw_n   int;
  v_bad     uuid;
  v_party   int;
begin
  -- 0292 (KFU-012): exact-reject FIRST, then one capacity decision for the party.
  select array_agg(distinct (r ->> 'user_id')::uuid),
         count(*) filter (where (r ->> 'user_id') is not null)
    into v_ids, v_raw_n
    from jsonb_array_elements(coalesce(p_roster, '[]'::jsonb)) r
   where (r ->> 'user_id') is not null;
  v_ids := coalesce(v_ids, '{}');

  if coalesce(array_length(v_ids, 1), 0) <> v_raw_n then
    raise exception 'roster_duplicate' using errcode = 'P0001',
      hint = 'The roster lists the same player more than once.';
  end if;
  if p_team is null and v_raw_n > 0 then
    raise exception 'roster_requires_team' using errcode = 'P0001';
  end if;
  if p_team is not null then
    select u into v_bad from unnest(v_ids) u
     where not exists (select 1 from public.team_members tm
                        where tm.team_id = p_team and tm.user_id = u)
     limit 1;
    if v_bad is not null then
      raise exception 'roster_not_team_member: %', v_bad using errcode = 'P0001',
        hint = 'Every rostered player must already be a member of the entered team.';
    end if;
  end if;

  -- the party = roster plus the captain, counted once
  v_party := (select count(distinct u) from unnest(v_ids || v_me) u);
  -- Delegate every check and the capacity decision to the one command that owns
  -- them (0193 + 0258). Duplicating that logic here is how the UI and the command
  -- drifted apart in KRA-034 — one owner per rule.
  v_out := public.tournament_register(
    p_tournament, p_division, p_team, p_answers, p_accept_waiver, p_accept_rules,
    v_party);

  if coalesce(v_out ->> 'ok', 'false') <> 'true' then
    return v_out;
  end if;
  v_reg := (v_out ->> 'registration_id')::uuid;

  -- Same transaction as the registration. 0292: the captain is EXCLUDED (the
  -- register command already seated them) and the conflict-skip clause is
  -- deliberately gone — validation above made every remaining collision a real
  -- error, and silently filtering rows is how five-sent became three-seated
  -- with ok:true (executed repro 2026-08-18). Wording note: the sentinel scans
  -- this function's body for the skip clause's two keywords, so this comment
  -- must not spell them adjacently.
  insert into public.tournament_registration_players
    (registration_id, tournament_id, user_id, is_reserve)
  select v_reg, p_tournament, (r ->> 'user_id')::uuid,
         coalesce((r ->> 'is_reserve')::boolean, false)
    from jsonb_array_elements(coalesce(p_roster, '[]'::jsonb)) r
   where (r ->> 'user_id') is not null
     and (r ->> 'user_id')::uuid <> v_me;

  get diagnostics v_added = row_count;
  if v_added <> v_party - 1 then
    raise exception 'roster_incomplete: seated % of %', v_added, v_party - 1
      using errcode = 'P0001';
  end if;

  return v_out || jsonb_build_object('roster_added', v_added);
end $$;

revoke all on function public.tournament_register_team(uuid, uuid, uuid, jsonb, jsonb, boolean, boolean)
  from public, anon;
grant execute on function public.tournament_register_team(uuid, uuid, uuid, jsonb, jsonb, boolean, boolean)
  to authenticated, service_role;


-- ── sentinel: the party math and the absence of silent filtering ──────────
create or replace function public.tournament_capacity_intact()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    (select position('for update' in pg_get_functiondef(p.oid)) > 0
        and position('for update' in pg_get_functiondef(p.oid))
            < position('select count(*) into v_taken' in pg_get_functiondef(p.oid))
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'tournament_register' limit 1)
    and (select position('greatest(coalesce(p_party_size' in pg_get_functiondef(p.oid)) > 0
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'tournament_register' limit 1)
    and (select position('on conflict' in pg_get_functiondef(p.oid)) = 0
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'tournament_register_team' limit 1);
$$;

revoke all on function public.tournament_capacity_intact() from public, anon, authenticated;
grant execute on function public.tournament_capacity_intact() to service_role;

select public.journal_migration('0292', '0292_tournament_party_capacity.sql', null,
  'KFU-012: tournament_register admits the whole party under its existing lock (p_party_size, old signature dropped); tournament_register_team validates the roster exactly — duplicates and non-members raise with reasons — passes the party into the one capacity decision, inserts with the captain excluded and no conflict clause, and asserts the seated count. tournament_capacity_intact extended to pin the party math and the absence of silent filtering. All three cited defects were reproduced by execution before this fix.');

commit;
