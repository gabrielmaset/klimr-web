-- 0251_expiry_clock_and_points_race.sql — the stale sweep measures the right
-- clock, and two concurrent point recomputes stop losing one of their results.
--
-- KRA-032 + KRA-038 (both P1, re-audit 2026-08-10).

-- ═══ KRA-032 — the sweep measured the wrong clock ════════════════════════
-- `end_stale_court_sessions` selects on `created_at`, so a session created a week
-- ago and RESTARTED five minutes ago is older than the twelve-hour cap and gets
-- ended immediately. `restartSession` exists precisely so an organiser can reuse
-- a session, and `court_sessions.activated_at` already records when that happened
-- — the sweep just never looked at it.
--
-- The failure is the bad kind: the session ends mid-play, the audit row says
-- "Expired automatically after 12 hours", and the organiser has no way to tell
-- that the number in that sentence was measured from the wrong event.
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
       -- The clock runs from the LATEST activation, falling back to creation for
       -- a session that has never been restarted. `greatest` with a null-safe
       -- coalesce, because `activated_at` is null on rows created before 0207.
       and greatest(coalesce(activated_at, created_at), created_at)
           < now() - make_interval(hours => p_max_hours)
     order by greatest(coalesce(activated_at, created_at), created_at)
  loop
    -- p_actor is null: the system ended this, and an audit row that names a
    -- person who was not involved is worse than one that names nobody.
    if public.end_court_session(v_id, null, format('Expired automatically after %s hours', p_max_hours)) then
      v_ended := v_ended + 1;
    end if;
  end loop;
  return v_ended;
end;
$$;

revoke all on function public.end_stale_court_sessions(integer) from public, anon, authenticated;
grant execute on function public.end_stale_court_sessions(integer) to service_role;

-- ═══ KRA-038 — a lost update in the points ledger ════════════════════════
-- `recompute_player_points` reads the rolling-best-8 total and then upserts it.
-- Nothing serialises the pair, so two matches finishing for the same player and
-- sport at the same moment both read the pre-existing ledger, both compute a
-- total that omits the other's row, and the second write wins. A player silently
-- loses points, and nothing errors — the upsert succeeds, it just succeeds with a
-- number computed from a stale read.
--
-- The lock is taken on (player, sport) rather than the table: two players'
-- recomputes are genuinely independent and must not queue behind each other.
-- `pg_advisory_xact_lock` releases at commit, so a caller cannot leak it.
create or replace function public.recompute_player_points(
  p_user  uuid,
  p_sport text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff timestamptz := now() - interval '52 weeks';   -- ROLLING_WEEKS
  v_total  integer;
begin
  if p_user is null or p_sport is null then
    return 0;
  end if;

  -- KRA-038: serialise this pair BEFORE the read. Taking it after would leave the
  -- exact window being closed. Same shape as KCDX-027's canonical-pair lock in
  -- `request_connection`, and for the same reason: a row-level lock cannot help
  -- when the contended thing is a computation over rows that are still arriving.
  perform pg_advisory_xact_lock(hashtextextended(p_user::text || ':' || p_sport, 0));

  select coalesce(sum(points), 0) into v_total
    from (
      select points
        from (
          select points, earned_at from public.tournament_points
           where user_id = p_user and sport_key = p_sport and earned_at > v_cutoff
          union all
          select points, earned_at from public.queue_points
           where user_id = p_user and sport_key = p_sport and earned_at > v_cutoff
        ) pool
       order by points desc
       limit 8                                            -- ROLLING_BEST
    ) best;

  perform set_config('klimr.privileged_write', 'on', true);

  insert into public.player_sports (user_id, sport_key, points, updated_at)
  values (p_user, p_sport, v_total, now())
  on conflict (user_id, sport_key)
  do update set points = excluded.points, updated_at = excluded.updated_at;

  return v_total;
end;
$$;

-- ── boundary sentinel ────────────────────────────────────────────────────
create or replace function public.expiry_and_points_intact()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- the sweep consults the activation clock
    (select position('activated_at' in pg_get_functiondef(p.oid)) > 0
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'end_stale_court_sessions' limit 1)
    -- and the recompute is serialised per (player, sport)
    and (select position('pg_advisory_xact_lock' in pg_get_functiondef(p.oid)) > 0
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'recompute_player_points' limit 1)
    -- taken BEFORE the read, or it closes nothing
    and (select position('pg_advisory_xact_lock' in pg_get_functiondef(p.oid))
              < position('select coalesce(sum(points)' in pg_get_functiondef(p.oid))
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'recompute_player_points' limit 1);
$$;

revoke all on function public.expiry_and_points_intact() from public, anon, authenticated;
grant execute on function public.expiry_and_points_intact() to service_role;

create or replace function public.klimr_ready(p_min_checks integer default 31)
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
