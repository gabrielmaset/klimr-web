-- 0207_expire_stale_sessions.sql — court sessions never end by themselves.
--
-- FOUND IN PRODUCTION, not by the audit. The admin Live Fleet reported 4 live
-- queues when one venue was actually playing; the other three had been opened on
-- 3 August and never closed. `fleet_metrics()` counts `court_sessions where
-- status <> 'ended'`, which is exactly what its label claims. The counter was
-- right. Nothing had ended them, because **nothing ever does**: there is no
-- expiry in the schema, and a session stays live until a human presses Force end.
--
-- Every stale session keeps its display code valid, holds a row in the fleet
-- view, and inflates the one number that page exists to report — so the venue
-- that IS running gets buried in the ones that finished last week.
--
-- ── THE RULE (owner decision, Aug 2026) ──────────────────────────────────
-- Twelve hours is a HARD CAP, not an idle timeout. A session that reaches it
-- ends, even if teams are still queued. A pickup queue is a session at a venue
-- on a day; one that has been open half a day is finished whether or not someone
-- left names in the list, and a queue that outlives the play it was created for
-- is worse than an empty one — it shows walk-ups a list they can join for a game
-- nobody is running.
--
-- An earlier draft of this file made a waiting team protect the session. That was
-- my inference, not the requirement, and it is wrong for exactly the reason
-- above: the stale sessions most likely to linger are the ones somebody queued
-- into and walked away from.
--
-- ── ENDING MEANS THE SAME THING EVERYWHERE ───────────────────────────────
-- Setting `status = 'ended'` is not ending a session. `admin_force_end_session`
-- also clears the teams, finalizes live matches, expires pending join requests
-- and revokes the display tokens — without which a "closed" session leaves
-- kiosks still reporting presence and matches stuck at `live` forever.
--
-- So the cleanup is extracted into `end_court_session()`, and BOTH the fleet
-- console and this hourly job call it. One definition of ended; a future change
-- to what that means happens in one place instead of drifting between two.

-- ── 1. the one implementation of "end a session" ──────────────────────────
create or replace function public.end_court_session(
  p_session_id uuid,
  p_actor      uuid,
  p_reason     text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.court_sessions
     set status = 'ended', ended_at = now()
   where id = p_session_id and status <> 'ended';
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

  -- Stop attached displays from reporting presence for a session that is over,
  -- and invalidate their tokens: after 0192 a token is the authority to record a
  -- result, so it must not outlive the session it was minted for.
  update public.courtside_devices
     set revoked_at = now(), token_hash = null
   where session_id = p_session_id and revoked_at is null;

  insert into public.admin_actions (actor_id, action, target_ref, detail, outcome)
  values (p_actor, 'session:ended', p_session_id::text, p_reason, 'ok');
  return true;
end;
$$;

revoke all on function public.end_court_session(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.end_court_session(uuid, uuid, text) to service_role;

-- The fleet console keeps its own entry point and its own audit wording, and
-- delegates the actual work.
create or replace function public.admin_force_end_session(p_session_id uuid, p_actor uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.end_court_session(p_session_id, p_actor, 'Forced from the fleet console');
$$;

revoke all on function public.admin_force_end_session(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_force_end_session(uuid, uuid) to service_role;

-- ── 2. the hourly sweep ───────────────────────────────────────────────────
create or replace function public.end_stale_court_sessions(p_max_hours integer default 12)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_ended integer := 0;
begin
  for v_id in
    select id from public.court_sessions
     where status <> 'ended'
       and created_at < now() - make_interval(hours => p_max_hours)
     order by created_at
  loop
    -- p_actor is null: the system ended this, and an audit row that names a
    -- person who was not involved is worse than one that names nobody.
    if public.end_court_session(v_id, null, format('Expired automatically after %s hours', p_max_hours)) then
      v_ended := v_ended + 1;
    end if;
  end loop;

  if v_ended > 0 then
    raise notice 'end_stale_court_sessions: ended % expired session(s)', v_ended;
  end if;
  return v_ended;
end;
$$;

revoke all on function public.end_stale_court_sessions(integer) from public, anon, authenticated;
grant execute on function public.end_stale_court_sessions(integer) to service_role;

comment on function public.end_stale_court_sessions is
  'Ends every court session older than p_max_hours (default 12). A HARD CAP: waiting teams, live '
  'matches and connected displays do not extend it. Scheduled hourly; safe to run by hand.';

-- ── 3. hourly, in-database ────────────────────────────────────────────────
-- pg_cron rather than an HTTP route: KCDX-039 showed both existing cron routes
-- had been silently redirected to a login page for their entire lives while
-- Vercel reported healthy runs. Pure SQL needs no route, no secret and no
-- middleware classification, and cannot be redirected.
do $$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is not null then
    begin
      perform cron.unschedule('klimr-end-stale-sessions');
    exception when others then null;
    end;
    perform cron.schedule('klimr-end-stale-sessions', '7 * * * *', 'select public.end_stale_court_sessions()');
  end if;
end $$;

-- Close the existing backlog. Safe to re-run: sessions already ended are skipped.
select public.end_stale_court_sessions();
