-- 0260_queue_start_match_atomic.sql — starting a match is one transaction, and
-- the same two teams cannot be started twice.
--
-- KRA-036 (P1, re-audit 2026-08-10). `applyStartNext` reads the session, checks
-- for a live match, reads the queue, sorts it in JavaScript, inserts the match,
-- and THEN updates the two teams to `playing` in a separate statement whose error
-- is discarded. Two failures follow, both of which leave the court wrong in a way
-- nobody is told about:
--
--  · A LIVE MATCH WITH QUEUED TEAMS. If the update fails — RLS, a dropped
--    connection between two round trips — the match row says `live` and both
--    teams still say `queued`, so they remain candidates for the NEXT start.
--    The same players get pulled into a second match while their first is
--    running, and the queue view shows them in two places.
--
--  · TWO MATCHES ON ONE COURT. The `liveExisting` check and the insert are not
--    serialised. Two operators pressing "start next" at the same moment — a
--    Courtside tablet and the organizer's phone, which is the ordinary setup —
--    both see no live match and both insert.
--
-- The sort moves into SQL with the match: ordering candidates in the application
-- and then writing based on that order is only safe if nothing changes in
-- between, which is exactly the assumption being removed.

create or replace function public.queue_start_next(p_court uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session uuid;
  v_status  text;
  v_paused  boolean;
  v_a       uuid;
  v_b       uuid;
  v_match   uuid;
  v_moved   int;
begin
  select session_id into v_session from public.queue_courts where id = p_court;
  if v_session is null then
    return jsonb_build_object('ok', false, 'error', 'court_not_found');
  end if;

  -- Serialise on the SESSION, not the court: the pause flag and the session
  -- status live there, and two courts of one session starting at once is fine
  -- while two starts on one court is not. Taken before every read below, so the
  -- checks and the write see the same world.
  perform 1 from public.court_sessions where id = v_session for update;

  select status, paused into v_status, v_paused
    from public.court_sessions where id = v_session;

  if v_status = 'ended' then return jsonb_build_object('ok', false, 'error', 'ended'); end if;
  if v_status <> 'live' then return jsonb_build_object('ok', false, 'error', 'not_started'); end if;
  if v_paused then return jsonb_build_object('ok', false, 'error', 'paused'); end if;

  if exists (select 1 from public.queue_matches
              where court_id = p_court and status = 'live') then
    return jsonb_build_object('ok', false, 'error', 'already_live');
  end if;

  -- The same ordering the application used: a team holding court goes first,
  -- then earliest joined. Selected under the lock so the candidates cannot move
  -- between the choice and the write.
  select id into v_a from public.queue_teams
   where court_id = p_court and status = 'queued'
   order by hold_court desc, created_at asc
   limit 1;

  select id into v_b from public.queue_teams
   where court_id = p_court and status = 'queued' and id <> v_a
   order by hold_court desc, created_at asc
   limit 1;

  if v_a is null or v_b is null then
    return jsonb_build_object('ok', false, 'error', 'need_two_teams');
  end if;

  insert into public.queue_matches (session_id, court_id, team_a, team_b, status)
  values (v_session, p_court, v_a, v_b, 'live')
  returning id into v_match;

  -- Same transaction. The predicate is the safety: if either team stopped being
  -- `queued` while we were choosing, fewer than two rows move and the whole
  -- start is rolled back rather than leaving a live match with queued teams.
  update public.queue_teams
     set status = 'playing', hold_court = false
   where id in (v_a, v_b) and status = 'queued';

  get diagnostics v_moved = row_count;
  if v_moved <> 2 then
    raise exception 'queue_start_race' using hint = 'A team left the queue mid-start; retry.';
  end if;

  return jsonb_build_object('ok', true, 'match_id', v_match, 'team_a', v_a, 'team_b', v_b);
end $$;

revoke all on function public.queue_start_next(uuid) from public, anon;
grant execute on function public.queue_start_next(uuid) to authenticated, service_role;

comment on function public.queue_start_next is
  'KRA-036: chooses the next two teams and starts the match in ONE locked transaction. The insert and '
  'the team update used to be separate statements with the second error discarded, which left live '
  'matches whose teams still read `queued` and therefore queued for the next match too.';

-- ── the invariant behind it ──────────────────────────────────────────────
-- One live match per court, enforced where it cannot be raced. The command's
-- check is the good error message; this is the guarantee.
create unique index if not exists queue_matches_one_live_per_court
  on public.queue_matches (court_id)
  where status = 'live';

-- ── boundary sentinel ────────────────────────────────────────────────────
create or replace function public.queue_start_intact()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from pg_indexes
       where schemaname = 'public' and indexname = 'queue_matches_one_live_per_court'
    )
    and (select position('for update' in pg_get_functiondef(p.oid))
              < position('queue_matches' in pg_get_functiondef(p.oid))
            and position('v_moved <> 2' in pg_get_functiondef(p.oid)) > 0
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'queue_start_next' limit 1)
    -- and no court currently has two live matches
    and not exists (
      select 1 from public.queue_matches where status = 'live'
       group by court_id having count(*) > 1
    );
$$;

revoke all on function public.queue_start_intact() from public, anon, authenticated;
grant execute on function public.queue_start_intact() to service_role;

create or replace function public.klimr_ready(p_min_checks integer default 40)
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
