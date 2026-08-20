-- 0258_tournament_capacity_semantics.sql — the authoritative command counts
-- capacity the way the tournament is actually configured.
--
-- KRA-034 (P1, re-audit 2026-08-10).
--
-- ── A DISPUTE I ALMOST FILED, AND WHY IT WOULD HAVE BEEN WRONG ───────────
-- The finding says `tournament_register` ignores `capacity_mode` and
-- `capacity_unit`. No such COLUMNS exist on `tournaments` — verified against the
-- live schema, which has only `capacity` and `entry_type` — and I was one step
-- from recording this as a phantom finding.
--
-- They are keys inside the `format_config` JSONB, read by
-- `app/tournaments/actions.ts:963` and four other surfaces. The audit's citation
-- named the UI model, and the UI model is right. Worth recording because
-- "the column does not exist" felt like proof and was not: it only proved I had
-- looked in one place.
--
-- ── THE DRIFT ───────────────────────────────────────────────────────────
-- `capacityBlock()` in the UI implements four combinations:
--
--   pooled + team    → count REGISTRATIONS across the tournament
--   pooled + person  → count non-reserve PLAYERS across the tournament
--   per_division + team    → count registrations WITHIN the division
--   per_division + person  → count non-reserve players within the division
--
-- The command (0193) implements exactly one of them: it counts registrations,
-- and scopes to the division only when a division id happens to be supplied —
-- `coalesce(v_div_cap, v_t.capacity)`, which is a fallback rather than a mode.
--
-- So a `person`-unit tournament counted teams, and a `pooled` tournament with
-- divisions counted per-division whenever the registrant picked one. The UI
-- refused correctly and the command — the authoritative path, the one a direct
-- RPC call reaches — admitted the registration. That is the worse half: the
-- check that can be bypassed was right, and the check that cannot be bypassed
-- was wrong.
--
-- The excluded-status sets also disagreed: the command excluded `waitlisted`
-- from the count, the UI did not. Aligned on the command's version, which is
-- correct — a waitlisted entry does not occupy a seat, that is what waitlisted
-- means.

create or replace function public.tournament_register(
  p_tournament uuid,
  p_division   uuid default null,
  p_team       uuid default null,
  p_answers    jsonb default '{}'::jsonb,
  p_accept_waiver boolean default false,
  p_accept_rules  boolean default false
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
    v_status := case when v_taken + 1 > v_cap then 'waitlisted' else 'pending' end;
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

comment on function public.tournament_register is
  'KCDX-045 + KRA-034: registration under one lock, honouring capacity_mode (pooled | per_division) '
  'and capacity_unit (team | person) from format_config — the same configuration the UI reads. The '
  'command is the authoritative path; a direct RPC call must not admit what the UI would refuse.';

-- ── boundary sentinel ────────────────────────────────────────────────────
create or replace function public.tournament_capacity_intact()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    (select position('capacity_unit' in pg_get_functiondef(p.oid)) > 0
        and position('capacity_mode' in pg_get_functiondef(p.oid)) > 0
        -- person mode must count PLAYERS, not registrations
        and position('tournament_registration_players rp' in pg_get_functiondef(p.oid)) > 0
        -- and the lock still precedes the count
        and position('for update' in pg_get_functiondef(p.oid))
            < position('select count(*) into v_taken' in pg_get_functiondef(p.oid))
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'tournament_register' limit 1);
$$;

revoke all on function public.tournament_capacity_intact() from public, anon, authenticated;
grant execute on function public.tournament_capacity_intact() to service_role;

create or replace function public.klimr_ready(p_min_checks integer default 38)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (select count(*) from public.klimr_readiness()) >= p_min_checks
     and not exists (select 1 from public.klimr_readiness() where not passed);
$$;

revoke all on function public.klimr_ready(integer) from public, anon, authenticated;
grant execute on function public.klimr_ready(integer) to service_role;
