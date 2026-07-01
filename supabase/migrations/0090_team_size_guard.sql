-- 0090_team_size_guard.sql — make the team roster cap a hard database invariant.
--
-- The app already checks squad size on invite + accept, but seed/demo rows and any
-- future direct inserts can still push a roster past its cap (this is why some
-- teams currently show more members than their sport allows). This trigger makes
-- the cap impossible to exceed from ANY path — app, raw SQL, or seed script.
--
-- Effective cap for a team = its own teams.max_size, falling back to the per-sport
-- ceiling when max_size is null. New in-app teams are already clamped to the sport
-- ceiling on creation, so this only ever tightens things for direct inserts.

-- Per-sport ceilings — mirror of lib/sports.ts SPORT_TEAM_SIZE.max.
create or replace function public.team_sport_cap(p_sport text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_sport
    when 'beach_volleyball' then 6
    when 'tennis'          then 4
    when 'pickleball'      then 4
    when 'padel'           then 4
    when 'racquetball'     then 4
    else 4
  end;
$$;

-- BEFORE INSERT guard on team_members. A per-team advisory lock serialises
-- concurrent joins to the same team so the count-then-insert is race-safe; the
-- count deliberately EXCLUDES new.user_id so an idempotent re-accept (upsert of an
-- existing member) is never falsely blocked.
create or replace function public.enforce_team_size()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cap   integer;
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('team_members:' || new.team_id::text));

  select coalesce(t.max_size, public.team_sport_cap(t.sport_key))
    into v_cap
  from public.teams t
  where t.id = new.team_id;

  -- Unknown team (shouldn't happen) → let the FK handle it.
  if v_cap is null then
    return new;
  end if;

  select count(*)
    into v_count
  from public.team_members
  where team_id = new.team_id
    and user_id <> new.user_id;

  if v_count >= v_cap then
    raise exception 'Team % is full (cap %).', new.team_id, v_cap
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_team_size on public.team_members;
create trigger trg_enforce_team_size
  before insert on public.team_members
  for each row execute function public.enforce_team_size();

-- ---------------------------------------------------------------------------
-- Reconcile EXISTING over-cap rosters so current data satisfies the invariant
-- WITHOUT removing anyone: where a team already holds more members than its cap,
-- raise that team's own max_size up to its current roster size. Nothing is
-- deleted. (New in-app teams are still clamped to the sport ceiling on creation.)
--
-- If you would rather TRIM those demo teams back down to the sport caps instead
-- of widening them, say so and I'll hand you that (destructive) SQL separately.
-- ---------------------------------------------------------------------------
with roster as (
  select team_id, count(*)::int as n
  from public.team_members
  group by team_id
)
update public.teams t
set max_size = r.n
from roster r
where t.id = r.team_id
  and r.n > coalesce(t.max_size, public.team_sport_cap(t.sport_key));

-- Diagnostic — run on its own to see which teams were over cap before the fix:
--   select t.id, t.name, t.sport_key, t.max_size,
--          (select count(*) from public.team_members m where m.team_id = t.id) as members
--   from public.teams t
--   order by members desc;
