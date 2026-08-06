-- 0177_queue_state_version.sql — cheap-unchanged queue polls (audit QUEUE-003/PERF-002 · K2-02).
--
-- WHY. Every queue client polls /api/queue/[id] every 3 s (plus realtime
-- pings). At pilot×10 — 10 venues × (1 courtside display + ~20 phones) — that
-- is ~210 pollers, ~70 req/s, and each request runs five DB round trips to
-- rebuild a snapshot that is USUALLY IDENTICAL to the one before it. The
-- session only actually changes when someone joins, a game ends, or a court is
-- edited: a handful of times a minute.
--
-- FIX. A single monotonic version per session, bumped by triggers on every
-- table that feeds the snapshot. The route reads the version first (one
-- primary-key lookup), turns it into an ETag, and answers an unchanged poll
-- with 304 and no body — one cheap query instead of five, and no JSON built.
-- Changed polls behave exactly as before.
--
-- The counter lives in its OWN narrow table rather than a column on
-- court_sessions: that row is read constantly, and bumping a column on it for
-- every queue write would churn row versions on a hot read path.
--
-- NOT RISKY: additive table + triggers; no existing row is rewritten and no
-- behavior changes if the app never calls it (the version simply counts up).
-- Backup not required.

create table if not exists public.queue_session_version (
  session_id uuid primary key,
  version    bigint not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.queue_session_version enable row level security;
-- Server-only: the version is read through the SECURITY DEFINER RPC below.
revoke all on table public.queue_session_version from anon, authenticated, public;

-- Generic bump. TG_ARGV[0] = column on the row holding the session id.
-- TG_ARGV[1] (optional) = column holding a team id, used as a fallback when
-- the session id is nullable on that table (queue_team_members).
create or replace function public.bump_queue_version() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r         record;
  v_session uuid;
  v_team    uuid;
begin
  if TG_OP = 'DELETE' then r := OLD; else r := NEW; end if;

  execute format('select ($1).%I', TG_ARGV[0]) into v_session using r;

  if v_session is null and TG_ARGV[1] is not null then
    execute format('select ($1).%I', TG_ARGV[1]) into v_team using r;
    select t.session_id into v_session from public.queue_teams t where t.id = v_team;
  end if;

  if v_session is null then
    return null; -- nothing to attribute the change to; never block the write
  end if;

  insert into public.queue_session_version (session_id, version)
  values (v_session, 1)
  on conflict (session_id) do update
    set version = public.queue_session_version.version + 1,
        updated_at = now();

  return null; -- AFTER trigger: return value is ignored
end; $$;

-- Every table the snapshot reads.
drop trigger if exists trg_bump_qv_sessions on public.court_sessions;
create trigger trg_bump_qv_sessions
  after insert or update or delete on public.court_sessions
  for each row execute function public.bump_queue_version('id');

drop trigger if exists trg_bump_qv_courts on public.queue_courts;
create trigger trg_bump_qv_courts
  after insert or update or delete on public.queue_courts
  for each row execute function public.bump_queue_version('session_id');

drop trigger if exists trg_bump_qv_teams on public.queue_teams;
create trigger trg_bump_qv_teams
  after insert or update or delete on public.queue_teams
  for each row execute function public.bump_queue_version('session_id');

drop trigger if exists trg_bump_qv_matches on public.queue_matches;
create trigger trg_bump_qv_matches
  after insert or update or delete on public.queue_matches
  for each row execute function public.bump_queue_version('session_id');

drop trigger if exists trg_bump_qv_requests on public.queue_join_requests;
create trigger trg_bump_qv_requests
  after insert or update or delete on public.queue_join_requests
  for each row execute function public.bump_queue_version('session_id');

-- session_id is nullable here, so fall back to the team's session.
drop trigger if exists trg_bump_qv_members on public.queue_team_members;
create trigger trg_bump_qv_members
  after insert or update or delete on public.queue_team_members
  for each row execute function public.bump_queue_version('session_id', 'team_id');

-- Cheap read for the poll path. Returns 0 for a session that has never
-- changed, so a missing row is indistinguishable from "nothing has happened".
create or replace function public.queue_version(p_session_id uuid) returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select version from public.queue_session_version where session_id = p_session_id), 0);
$$;

revoke all on function public.queue_version(uuid) from anon, authenticated, public;
