-- 0219_queue_placement_uniqueness.sql — KCDX-040 (P1): queue placement lacks
-- session-wide uniqueness and complete idempotency.
--
-- 0176 got the hard part right. `place_on_team` takes an advisory lock, reads
-- AFTER it, creates or fills a forming team, and logs an idempotency key. Two
-- people tapping Join on the SAME court cannot collide.
--
-- The lock is keyed on the COURT. The rule it needs to enforce is about the
-- SESSION: one team per person per session. Those are different scopes, and the
-- session-level check lived in TypeScript — `validateJoin` reads the member's
-- active teams and pending requests BEFORE calling the RPC.
--
-- So two taps on two different courts of the same session take two different
-- locks, both read a clean session in the application, and both place. The
-- member ends up on two teams at once: in the queue twice, holding two slots,
-- and counted twice when either match is scored. Nothing detects it, because the
-- only unique index is per team, not per session.
--
-- ── LOCK THE PERSON, THEN THE COURT ──────────────────────────────────────
-- Ordering matters. The session+user lock is taken FIRST and always in that
-- order, so two placements for the same person serialize regardless of which
-- courts they name — and because every caller takes the person lock before any
-- court lock, two different people on two courts still cannot deadlock against
-- each other.
--
-- The membership check then moves inside, after the lock, where the answer
-- cannot change before the insert. The TypeScript check stays as a UX guard: it
-- produces a good message without a round trip. It is no longer the boundary.

create or replace function public.place_on_team(
  p_court_id       uuid,
  p_user_id        uuid,
  p_guest_name     text,
  p_idempotency_key text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_size    int;
  v_session uuid;
  v_target  uuid;
  v_count   int;
  v_prior   uuid;
begin
  if p_idempotency_key is not null then
    perform pg_advisory_xact_lock(hashtextextended('qcmd:' || p_idempotency_key, 0));
    select result_team_id into v_prior
      from public.queue_command_log
      where idempotency_key = p_idempotency_key;
    if found then
      return v_prior;
    end if;
  end if;

  select team_size, session_id into v_size, v_session
    from public.queue_courts where id = p_court_id;
  if v_session is null then
    raise exception 'queue_court_not_found' using errcode = 'P0002';
  end if;

  -- KCDX-040: the PERSON lock, before the court lock and always in that order.
  -- One team per person per session is a session-scoped rule, and a court-scoped
  -- lock cannot enforce it: two taps on two courts took two different locks and
  -- both placed. Taking this first also fixes the ordering — every caller
  -- acquires person-then-court, so two people on two courts cannot deadlock.
  if p_user_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('qsess:' || v_session::text || ':' || p_user_id::text, 0));

    -- Checked HERE, after the lock, rather than in the application before the
    -- call. The TypeScript check stays for its error message; this is the rule.
    if exists (
      select 1
        from public.queue_team_members m
        join public.queue_teams t on t.id = m.team_id
       where m.user_id = p_user_id
         and t.session_id = v_session
         and t.status <> 'done'
    ) then
      raise exception 'already_in_session' using errcode = 'P0001';
    end if;
  end if;

  -- Serialize placements on THIS court for the rest of the transaction.
  perform pg_advisory_xact_lock(hashtextextended(p_court_id::text, 0));

  select t.id, (select count(*) from public.queue_team_members m where m.team_id = t.id)
    into v_target, v_count
  from public.queue_teams t
  where t.court_id = p_court_id
    and t.status = 'forming'
    and (select count(*) from public.queue_team_members m where m.team_id = t.id) < v_size
  order by t.created_at
  limit 1;

  if v_target is null then
    insert into public.queue_teams (session_id, court_id, status)
    values (v_session, p_court_id, 'forming')
    returning id into v_target;
    v_count := 0;
  end if;

  insert into public.queue_team_members (team_id, user_id, guest_name, session_id)
  values (v_target, p_user_id, p_guest_name, v_session);

  if v_count + 1 >= v_size then
    update public.queue_teams
      set status = 'queued', queued_at = now(), hold_court = false
      where id = v_target and status = 'forming';
  end if;

  if p_idempotency_key is not null then
    insert into public.queue_command_log
      (idempotency_key, session_id, court_id, command, result_team_id, actor_user_id)
    values (p_idempotency_key, v_session, p_court_id, 'place_on_team', v_target, p_user_id)
    on conflict (idempotency_key) do nothing;
  end if;

  return v_target;
end;
$$;

revoke all on function public.place_on_team(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.place_on_team(uuid, uuid, text, text) to service_role;

comment on function public.place_on_team is
  'KCDX-040: places one person on a forming team. Locks SESSION+USER first, then the court — one team '
  'per person per session is a session-scoped rule that a court-scoped lock cannot enforce. Consistent '
  'lock ordering (person, then court) means concurrent placements cannot deadlock.';

-- ── the invariant, as a check anyone can run ─────────────────────────────
create or replace function public.queue_placement_intact()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
      from public.queue_team_members m
      join public.queue_teams t on t.id = m.team_id
     where m.user_id is not null and t.status <> 'done'
     group by t.session_id, m.user_id
    having count(*) > 1
  );
$$;

revoke all on function public.queue_placement_intact() from public, anon, authenticated;
grant execute on function public.queue_placement_intact() to service_role;
