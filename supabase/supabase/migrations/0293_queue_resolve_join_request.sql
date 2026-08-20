-- 0293_queue_resolve_join_request.sql — approval becomes one transaction.
--
-- KFU-011, reproduced by execution on 2026-08-18 against the unfixed head:
-- approveRequest prechecked `pending` on an unlocked read, placed via
-- place_on_team, then wrote `approved` as a SEPARATE statement with the result
-- discarded. Constructed states, each observed:
--   * placed-but-pending (the crash-between state);
--   * denied-while-seated (denyRequest's plain update against that state);
--   * TWO placements from ONE request — 0267's epoch frees the idempotency key
--     once the placed team finishes, so the stale pending request re-approves
--     into a fresh placement.
--
-- WHAT THIS DOES. queue_resolve_join_request(p_request, p_approve): the request
-- row is locked, the pending check is a compare-and-swap under that lock, the
-- placement runs inside the same transaction, and the status write is asserted.
-- place_on_team RAISES on every failure (court closed, session ended, full), so
-- a failed approval aborts whole — the request stays pending and the organizer
-- sees the reason. Terminal statuses are terminal: a second approve, a deny
-- after approve, or an epoch-replay all return already_handled and place
-- nothing. Authorization lives inside the command: session organizer, or a
-- privileged writer (the app's service-role path).
-- queue_approval_intact() pins the command's existence, its lock, its CAS, and
-- its audience.

begin;

create or replace function public.queue_resolve_join_request(
  p_request uuid,
  p_approve boolean
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_req   record;
  v_sess  record;
  v_court record;
  v_team  uuid;
  v_n     int;
begin
  select id, session_id, court_id, user_id, guest_name, status
    into v_req
    from public.queue_join_requests
   where id = p_request
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'request_not_found');
  end if;

  select id, organizer_id into v_sess
    from public.court_sessions where id = v_req.session_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'session_not_found');
  end if;
  if not public.is_privileged_writer() then
    if v_uid is null then
      raise exception 'sign_in_required' using errcode = 'P0001';
    end if;
    if v_sess.organizer_id <> v_uid then
      raise exception 'not_organizer' using errcode = 'P0001';
    end if;
  end if;

  -- compare-and-swap: only a pending request can be resolved, and only under
  -- the lock taken above. Everything else is terminal.
  if v_req.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'already_handled',
                              'status', v_req.status);
  end if;

  if not p_approve then
    update public.queue_join_requests
       set status = 'denied', decided_at = now()
     where id = p_request;
    return jsonb_build_object('ok', true, 'status', 'denied');
  end if;

  select id, session_id, team_size into v_court
    from public.queue_courts where id = v_req.court_id;
  if not found then
    update public.queue_join_requests
       set status = 'denied', decided_at = now()
     where id = p_request;
    return jsonb_build_object('ok', false, 'error', 'court_removed',
                              'status', 'denied');
  end if;

  -- the account already landed on an active team meanwhile: close the request
  -- without a second seat.
  if v_req.user_id is not null and exists (
    select 1
      from public.queue_team_members m
      join public.queue_teams t on t.id = m.team_id
     where m.user_id = v_req.user_id
       and t.session_id = v_req.session_id
       and t.status <> 'done'
  ) then
    update public.queue_join_requests
       set status = 'approved', decided_at = now()
     where id = p_request;
    return jsonb_build_object('ok', true, 'status', 'approved', 'placed', false);
  end if;

  -- placement inside the SAME transaction. A raise here (court_closed,
  -- session_ended, full_teams_disabled, already_in_session, ...) aborts the
  -- whole command: nothing placed, status still pending, reason surfaced.
  v_team := public.place_on_team(
    v_court.id, v_req.user_id, v_req.guest_name, 'approve:' || p_request::text);

  update public.queue_join_requests
     set status = 'approved', decided_at = now()
   where id = p_request;
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'approval_write_lost' using errcode = 'P0001';
  end if;

  return jsonb_build_object('ok', true, 'status', 'approved',
                            'placed', true, 'team_id', v_team);
end $$;

revoke all on function public.queue_resolve_join_request(uuid, boolean) from public, anon;
grant execute on function public.queue_resolve_join_request(uuid, boolean) to authenticated, service_role;

comment on function public.queue_resolve_join_request is
  'KFU-011: the queue join-request approval as ONE locked transaction — CAS on pending under FOR '
  'UPDATE, organizer or privileged-writer authorization inside, placement and status write together. '
  'A placement failure aborts whole (request stays pending, reason raised); terminal statuses return '
  'already_handled and never place.';

-- ── sentinel ───────────────────────────────────────────────────────────────
create or replace function public.queue_approval_intact()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- the command exists with the exact signature
    to_regprocedure('public.queue_resolve_join_request(uuid, boolean)') is not null
    -- it locks before it decides, and the decision is a compare-and-swap
    and (select position('for update' in pg_get_functiondef(p.oid)) > 0
            and position('for update' in pg_get_functiondef(p.oid))
                < position('<> ''pending''' in pg_get_functiondef(p.oid))
           from pg_proc p
          where p.oid = to_regprocedure('public.queue_resolve_join_request(uuid, boolean)'))
    -- audience: members yes, anon no
    and has_function_privilege('authenticated',
          to_regprocedure('public.queue_resolve_join_request(uuid, boolean)'), 'execute')
    and not has_function_privilege('anon',
          to_regprocedure('public.queue_resolve_join_request(uuid, boolean)'), 'execute');
$$;

revoke all on function public.queue_approval_intact() from public, anon, authenticated;
grant execute on function public.queue_approval_intact() to service_role;

-- queue_approval_intact is the 43rd sentinel: the readiness floor tracks the
-- exact count (the count-floor doctrine — a dropped check must not pass silently).
create or replace function public.klimr_ready(p_min_checks integer default 43)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (select count(*) from public.klimr_readiness()) >= p_min_checks
     and not exists (select 1 from public.klimr_readiness() where not passed);
$$;

select public.journal_migration('0293', '0293_queue_resolve_join_request.sql', null,
  'KFU-011: queue_resolve_join_request(request, approve) — one locked transaction replacing the app''s split approve/deny writes: CAS on pending under FOR UPDATE, in-command authorization, placement and status write together, exact-reject on placement failure, terminal statuses terminal (the 0267 epoch can no longer re-place a stale pending request because pending cannot survive an approval). queue_approval_intact pins the command, its lock-before-CAS ordering, and its audience. All three failure states were constructed by execution before this fix.');

commit;
