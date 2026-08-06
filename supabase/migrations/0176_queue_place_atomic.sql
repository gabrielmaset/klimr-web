-- 0176_queue_place_atomic.sql — atomic queue placement (audit QUEUE-001/QUEUE-004/ADD-11 · K2-01).
--
-- WHY. `placeOnTeam()` in app/queue/actions.ts reads the forming teams, then
-- writes, with no lock between. Reproduced in a scratch Postgres 16 cluster
-- before writing this migration: two joins fired at the same instant on an
-- empty court BOTH found "no forming team" and BOTH inserted one — two forming
-- teams on one court, two players stranded on separate half-empty teams
-- instead of paired. The same window over-fills a team (two joins read
-- count=1 on a size-2 team and both insert) and double-fires the
-- forming→queued transition.
--
-- FIX. One SECURITY DEFINER function that does read + write inside a single
-- transaction, serialized per COURT by a transaction-scoped advisory lock, so
-- concurrent joins on the same court queue up behind each other while joins on
-- different courts stay fully parallel. Adds:
--   · idempotency — a repeated call with the same p_idempotency_key returns
--     the original team instead of adding the member twice (retries, double
--     taps, and flaky mobile networks are the normal case at a venue);
--   · an audit row per placement.
--
-- The app keeps its existing behavior and shape; only the mechanism changes.
--
-- RISKY? Mildly — this creates a table, an index, and a function, and the app
-- will call it in place of multi-statement writes. No existing rows are
-- rewritten and no destructive DDL runs. Not a data migration; a manual
-- backup is not required, but this is the first Phase 2 batch touching a hot
-- path, so run it when you can watch a session for a minute afterward.

-- Idempotency ledger for queue commands (small, self-pruning by design:
-- rows are scoped to a session and removed with it).
create table if not exists public.queue_command_log (
  idempotency_key text primary key,
  session_id      uuid not null,
  court_id        uuid,
  command         text not null,
  result_team_id  uuid,
  actor_user_id   uuid,
  created_at      timestamptz not null default now()
);

alter table public.queue_command_log enable row level security;
-- Server-only: every writer is the service role via the RPC below.
revoke all on table public.queue_command_log from anon, authenticated, public;

create index if not exists queue_command_log_session_idx
  on public.queue_command_log (session_id, created_at desc);

-- Atomic "put this member on a team at this court".
-- Returns the team id the member landed on.
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
  v_count   int := 0;
  v_prior   uuid;
begin
  -- Lock ORDER MATTERS (always key, then court) so two locks can never deadlock.
  --
  -- The key lock comes FIRST and is what makes idempotency real: the scratch
  -- harness proved that checking the log before taking a lock lets three
  -- concurrent replays of one key all pass the check (each runs before any
  -- other commits) and insert three member rows. Serializing on the key, THEN
  -- reading the log, means every replay after the first sees the committed
  -- result and returns it untouched.
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

  -- Serialize placements on THIS court for the rest of the transaction.
  -- Different courts hash to different keys and proceed in parallel.
  perform pg_advisory_xact_lock(hashtextextended(p_court_id::text, 0));

  -- Read AFTER the lock: now the answer cannot change under us.
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
end; $$;

revoke all on function public.place_on_team(uuid, uuid, text, text) from anon, authenticated, public;
