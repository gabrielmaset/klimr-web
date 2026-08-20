-- 0193_tournament_commands.sql — KCDX-003 (P0): tournament RLS permits direct
-- hosting, payment confirmation, roster injection and cross-binding.
--
-- WHAT IS ACTUALLY WRONG. Most tournament tables are gated by
-- `is_tournament_staff()` and are fine. The exposure is the three self-service
-- tables — registrations, roster players, payments — whose policies bind only
-- `registrant_id = auth.uid()`. That answers "is this row yours?" and nothing
-- else. It does not ask whether the tournament is open, whether there is room,
-- whether the division belongs to that tournament, or whether YOU are allowed to
-- decide that your own entry is paid. So a member with an ordinary JWT can
-- INSERT a registration with `status: 'confirmed'` and `payment_status:
-- 'confirmed'`, past the deadline, over capacity, into someone else's division.
--
-- The application already checks all of that — in TypeScript, before the write.
-- That is a UX guard, not a boundary: PostgREST does not run it. And the
-- capacity check in particular is a read followed by an unrelated insert, so
-- even through the app two people racing for the last slot both see room
-- (KCDX-045).
--
-- WHY COMMANDS RATHER THAN BETTER POLICIES. A policy is a predicate over one
-- row. "There is room" is a predicate over a set, and it has to hold from the
-- moment it is checked to the moment the row lands — which means a lock, which
-- means a transaction, which means a function. The same is true of "the division
-- belongs to this tournament" and "you are not already registered". Each command
-- below does its checks and its writes inside one transaction, under a lock on
-- the tournament row, so the answer cannot change underneath it.
--
-- Immutability falls out of the design: `status` and `payment_status` are never
-- parameters. The registrant cannot express them, so they cannot forge them.
--
-- NOT IN THIS BATCH, recorded rather than implied: bracket and result
-- transactions (KCDX-046), tournament JSON lost-update (KCDX-047) and the wider
-- concurrency suite belong to batch E. Roster editing beyond the registrant's
-- own entry still runs through staff-gated paths and `accept_substitution`.

-- ── 1. the boundary: no direct writes to the self-service tables ───────────
-- SELECT stays: the existing read policies already scope rows to participants
-- and staff, and reading your own entry is not the problem.
revoke insert, update, delete on public.tournament_registrations        from anon, authenticated;
revoke insert, update, delete on public.tournament_registration_players from anon, authenticated;
revoke insert, update, delete on public.tournament_payments             from anon, authenticated;

-- ── 2. register ───────────────────────────────────────────────────────────
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
       where team_id = p_team and user_id = v_me and role in ('captain','manager','owner')
    ) then
      return jsonb_build_object('ok', false, 'error', 'not_team_manager');
    end if;
  elsif v_t.entry_type <> 'individual' then
    return jsonb_build_object('ok', false, 'error', 'team_event');
  end if;

  -- One live entry per registrant (or per team) per tournament.
  if exists (
    select 1 from public.tournament_registrations
     where tournament_id = p_tournament
       and status not in ('withdrawn','declined','cancelled','disqualified')
       and ((p_team is null and registrant_id = v_me and team_id is null)
         or (p_team is not null and team_id = p_team))
  ) then
    return jsonb_build_object('ok', false, 'error', 'already_registered');
  end if;

  -- Capacity, counted under the lock. Division capacity wins where it is set.
  -- an unassigned RECORD cannot be read at all in plpgsql, so division capacity
  -- is carried in a plain variable rather than reached for through v_div
  v_cap := coalesce(v_div_cap, v_t.capacity);
  if v_cap is not null then
    select count(*) into v_taken
      from public.tournament_registrations
     where tournament_id = p_tournament
       and (p_division is null or division_id = p_division)
       and status not in ('withdrawn','declined','cancelled','disqualified','waitlisted');
    v_status := case when v_taken >= v_cap then 'waitlisted' else 'pending' end;
  else
    v_status := 'pending';
  end if;

  -- `status` and `payment_status` are decided here and are not parameters.
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

-- ── 3. withdraw ───────────────────────────────────────────────────────────
create or replace function public.tournament_withdraw(p_registration uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_me uuid := auth.uid(); v_r record;
begin
  if v_me is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  select * into v_r from public.tournament_registrations where id = p_registration for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_r.registrant_id <> v_me and not public.is_tournament_staff(v_r.tournament_id) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if v_r.status in ('withdrawn','cancelled','disqualified') then
    return jsonb_build_object('ok', true, 'status', v_r.status);   -- idempotent
  end if;
  update public.tournament_registrations
     set status = 'withdrawn', updated_at = now()
   where id = p_registration;
  return jsonb_build_object('ok', true, 'status', 'withdrawn');
end;
$$;

-- ── 4. submit payment proof ───────────────────────────────────────────────
-- The registrant supplies evidence. They do not supply a verdict: `status` is
-- 'submitted', always, and the amount is computed from the division fee rather
-- than accepted from the caller.
create or replace function public.tournament_submit_payment_proof(
  p_registration uuid,
  p_proof_path text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_me uuid := auth.uid(); v_r record; v_div record; v_amount int; v_players int;
begin
  if v_me is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if coalesce(p_proof_path,'') = '' then return jsonb_build_object('ok', false, 'error', 'no_proof'); end if;

  select * into v_r from public.tournament_registrations where id = p_registration for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_r.registrant_id <> v_me then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  if v_r.payment_status = 'confirmed' then
    return jsonb_build_object('ok', false, 'error', 'already_confirmed');
  end if;

  if v_r.division_id is not null then
    select * into v_div from public.tournament_divisions where id = v_r.division_id;
    if found then
      if v_div.fee_basis = 'per_team' then
        v_amount := coalesce(v_div.fee_cents, 0);
      else
        select count(*) into v_players from public.tournament_registration_players
         where registration_id = v_r.id and is_reserve = false;
        v_amount := coalesce(v_div.fee_cents, 0) * greatest(coalesce(v_players, 1), 1);
      end if;
    end if;
  end if;

  insert into public.tournament_payments
    (registration_id, tournament_id, submitted_by, proof_path, amount_cents, status)
  values
    (v_r.id, v_r.tournament_id, v_me, p_proof_path, v_amount, 'submitted');

  update public.tournament_registrations
     set payment_status = 'proof_submitted', updated_at = now()
   where id = v_r.id;

  return jsonb_build_object('ok', true);
end;
$$;

-- ── 5. review payment (staff only) ────────────────────────────────────────
create or replace function public.tournament_review_payment(
  p_registration uuid,
  p_decision text,               -- 'confirmed' | 'denied' | 'refunded'
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_me uuid := auth.uid(); v_r record; v_pay uuid;
begin
  if v_me is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_decision not in ('confirmed','denied','refunded') then
    return jsonb_build_object('ok', false, 'error', 'bad_decision');
  end if;

  select * into v_r from public.tournament_registrations where id = p_registration for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

  -- The decision is staff-owned. This is the check the old policy never made.
  if not public.is_tournament_staff(v_r.tournament_id) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;

  select id into v_pay from public.tournament_payments
   where registration_id = p_registration order by created_at desc limit 1;

  if v_pay is not null then
    update public.tournament_payments
       set status = case when p_decision = 'refunded' then 'refunded' else p_decision end,
           deny_reason = case when p_decision = 'denied' then nullif(btrim(coalesce(p_reason,'')), '') end,
           reviewed_by = v_me,
           reviewed_at = now()
     where id = v_pay;
  end if;

  update public.tournament_registrations
     set payment_status = p_decision, updated_at = now()
   where id = p_registration;

  return jsonb_build_object('ok', true, 'decision', p_decision);
end;
$$;

-- ── 6. grants ─────────────────────────────────────────────────────────────
revoke all on function public.tournament_register(uuid, uuid, uuid, jsonb, boolean, boolean) from public, anon;
revoke all on function public.tournament_withdraw(uuid) from public, anon;
revoke all on function public.tournament_submit_payment_proof(uuid, text) from public, anon;
revoke all on function public.tournament_review_payment(uuid, text, text) from public, anon;

grant execute on function public.tournament_register(uuid, uuid, uuid, jsonb, boolean, boolean) to authenticated, service_role;
grant execute on function public.tournament_withdraw(uuid) to authenticated, service_role;
grant execute on function public.tournament_submit_payment_proof(uuid, text) to authenticated, service_role;
grant execute on function public.tournament_review_payment(uuid, text, text) to authenticated, service_role;

-- ── 7. keep it closed ─────────────────────────────────────────────────────
create or replace function public.tournament_boundary_intact()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from information_schema.table_privileges
     where table_schema = 'public'
       and table_name in ('tournament_registrations','tournament_registration_players','tournament_payments')
       and grantee in ('anon','authenticated')
       and privilege_type in ('INSERT','UPDATE','DELETE')
  );
$$;

revoke all on function public.tournament_boundary_intact() from public, anon, authenticated;
grant execute on function public.tournament_boundary_intact() to service_role;
