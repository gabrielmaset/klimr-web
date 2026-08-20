-- 0217_queue_read_safety.sql — KCDX-042 (P1): queue reads can destructively wipe
-- state while polling hides and amplifies failures.
--
-- ── A READ THAT DELETES ──────────────────────────────────────────────────
-- `loadSessionState` is the read behind the queue snapshot endpoint and the
-- server-rendered queue pages. Every call ran `retireSessionIfStale`, which
-- issues three extra queries and — past a 12-hour idle threshold — calls
-- `wipeSession`: a full destructive delete of play state, courts and tuned
-- settings, followed by flipping the parent event or tournament's
-- `queue_enabled` to false.
--
-- The browser polls that endpoint every three seconds, per viewer. So on a busy
-- court with eight people watching the queue, eight independent clients were
-- each capable of triggering an unsynchronised destructive wipe, concurrently,
-- with no lock between them — and the same code ran again on every server
-- render. Nothing about it was idempotent by design; it was idempotent by luck,
-- because the second wipe finds nothing left to delete.
--
-- 0207 already does this properly: an hourly pg_cron job, one transaction per
-- session, `end_court_session` as the single definition of ending, and history
-- preserved (matches are finalized rather than deleted). That makes the
-- read-path version not merely risky but redundant.
--
-- So the read becomes side-effect-free, and this migration gives the scheduled
-- job the one behaviour it was missing.
--
-- ── THE ONE-SWITCH RULE ──────────────────────────────────────────────────
-- The read-path retirement also flipped the parent event's or tournament's
-- `queue_enabled` off, so "the queue day ended" reads as OFF on the event page.
-- That is real product behaviour and it should survive; it just should not live
-- inside a SELECT. `end_court_session` now does it, which means it applies to
-- the fleet console's Force end as well — where it was previously missing, so
-- an admin ending a session left the event still claiming its queue was on.
--
-- WHAT IS DELIBERATELY NOT CARRIED OVER: the wipe of courts and tuned settings.
-- Automatic expiry should not destroy an organiser's configuration. The explicit
-- organiser action still calls `wipeSession` and still means "clear it all".

create or replace function public.end_court_session(
  p_session_id uuid,
  p_actor      uuid,
  p_reason     text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_event uuid; v_tournament uuid;
begin
  update public.court_sessions
     set status = 'ended', ended_at = now()
   where id = p_session_id and status <> 'ended'
  returning event_id, tournament_id into v_event, v_tournament;
  if not found then
    return false;
  end if;

  delete from public.queue_team_members
    where team_id in (select id from public.queue_teams where session_id = p_session_id);
  delete from public.queue_teams where session_id = p_session_id;

  update public.queue_matches set status = 'final', ended_at = now()
    where session_id = p_session_id and status = 'live';

  update public.queue_join_requests set status = 'expired'
    where session_id = p_session_id and status = 'pending';

  update public.courtside_devices
     set revoked_at = now(), token_hash = null
   where session_id = p_session_id and revoked_at is null;

  -- One-switch rule: the queue day ending reads as OFF wherever the toggle is
  -- shown. Previously only the read-path retirement did this, so an admin Force
  -- end left the event page still claiming the queue was on.
  if v_event is not null then
    update public.events set queue_enabled = false where id = v_event;
  elsif v_tournament is not null then
    update public.tournaments set queue_enabled = false where id = v_tournament;
  end if;

  insert into public.admin_actions (actor_id, action, target_ref, detail, outcome)
  values (p_actor, 'session:ended', p_session_id::text, p_reason, 'ok');
  return true;
end;
$$;

revoke all on function public.end_court_session(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.end_court_session(uuid, uuid, text) to service_role;
