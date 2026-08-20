-- 0274_team_joinability.sql — a team chooses at creation who may ask to join,
-- and asking becomes a first-class, race-safe request flow. D-40.
--
-- WHAT EXISTS. Invites only: a captain invites accepted friends
-- (team_invites), membership writes are server-side, and there is no path
-- for an outsider to raise a hand. The June rule (friends-only, blanket) is
-- what this migration revises to a PER-TEAM choice, per the owner's
-- explicit decision.
--
-- WHAT THIS ADDS.
--   teams.join_policy   'open' (anyone may ask) | 'friends' (only accepted
--                       friends of the team owner may ask). Existing teams
--                       default to 'friends' — the June posture they were
--                       created under; new teams choose in the wizard.
--   team_join_requests  The raised hands. Requester-owned rows, readable by
--                       the requester and the team's managers, written ONLY
--                       through the command functions below (no client
--                       insert or update policies — deny by default, the
--                       same posture as membership writes).
--   Three commands, all SECURITY DEFINER, all bound to auth.uid():
--     team_ask_to_join(team, note)      idempotent per pending request —
--                                       asking twice returns the same id.
--     team_resolve_join_request(id, ok) approval seats a member under the
--                                       team capacity lock; owner/manager
--                                       only (mirrors the roster rule, which
--                                       is stricter than the challenge rule).
--     team_withdraw_join_request(id)    requester withdraws a pending ask.
--
-- Race-safety: the ask path serializes per (team, requester) and the resolve
-- path serializes per team, both with advisory locks, so double-taps and
-- simultaneous approvals against the last seat cannot overfill a roster —
-- the KRA-037 command shape.

alter table public.teams
  add column if not exists join_policy text not null default 'friends';

do $$ begin
  alter table public.teams
    add constraint teams_join_policy_check
    check (join_policy in ('open','friends'));
exception when duplicate_object then null; end $$;

create table if not exists public.team_join_requests (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references public.teams(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  status       text not null default 'pending'
               check (status in ('pending','approved','declined','withdrawn')),
  note         text check (note is null or length(note) <= 280),
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  uuid references public.profiles(id) on delete set null
);

create unique index if not exists team_join_requests_one_pending_idx
  on public.team_join_requests (team_id, requester_id)
  where status = 'pending';

create index if not exists team_join_requests_team_status_idx
  on public.team_join_requests (team_id, status, created_at);

alter table public.team_join_requests enable row level security;

drop policy if exists "join requests readable by requester" on public.team_join_requests;
create policy "join requests readable by requester" on public.team_join_requests
  for select to authenticated using (requester_id = auth.uid());

drop policy if exists "join requests readable by team managers" on public.team_join_requests;
create policy "join requests readable by team managers" on public.team_join_requests
  for select to authenticated using (public.is_team_manager(team_id, auth.uid()));

create or replace function public.team_ask_to_join(
  p_team uuid,
  p_note text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid;
  v_policy  text;
  v_deleted timestamptz;
  v_owner   uuid;
  v_max     int;
  v_count   int;
  v_prior   uuid;
  v_id      uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'sign_in_required' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('tjr:' || p_team::text || ':' || v_uid::text, 0));

  v_policy := (select t.join_policy from public.teams t where t.id = p_team);
  v_deleted := (select t.deleted_at from public.teams t where t.id = p_team);
  v_owner := (select t.created_by from public.teams t where t.id = p_team);
  v_max := (select t.max_size from public.teams t where t.id = p_team);
  if v_policy is null then
    raise exception 'team_not_found' using errcode = 'P0002';
  end if;
  if v_deleted is not null then
    raise exception 'team_not_found' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.team_members m where m.team_id = p_team and m.user_id = v_uid) then
    raise exception 'already_member' using errcode = 'P0001';
  end if;

  if v_policy = 'friends' and not exists (
    select 1 from public.friendships f
     where f.status = 'accepted'
       and ((f.requester_id = v_uid and f.addressee_id = v_owner)
         or (f.addressee_id = v_uid and f.requester_id = v_owner))
  ) then
    raise exception 'friends_only_team' using errcode = 'P0001';
  end if;

  if v_max is not null then
    v_count := (select count(*) from public.team_members m where m.team_id = p_team);
    if v_count >= v_max then
      raise exception 'team_full' using errcode = 'P0001';
    end if;
  end if;

  v_prior := (select r.id from public.team_join_requests r
               where r.team_id = p_team and r.requester_id = v_uid and r.status = 'pending');
  if v_prior is not null then
    return v_prior;
  end if;

  v_id := gen_random_uuid();
  insert into public.team_join_requests (id, team_id, requester_id, note)
  values (v_id, p_team, v_uid, nullif(btrim(coalesce(p_note, '')), ''));
  return v_id;
end;
$$;

revoke all on function public.team_ask_to_join(uuid, text) from public, anon;
grant execute on function public.team_ask_to_join(uuid, text) to authenticated, service_role;

comment on function public.team_ask_to_join is
  'D-40 command: the CURRENT viewer asks to join a team. Serialized per team and requester, '
  'idempotent per pending ask, honors the per-team join policy (friends means accepted friends '
  'of the team owner), refuses members, deleted teams and full rosters.';

create or replace function public.team_resolve_join_request(
  p_request uuid,
  p_approve boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid;
  v_team   uuid;
  v_req    uuid;
  v_status text;
  v_max    int;
  v_count  int;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'sign_in_required' using errcode = 'P0001';
  end if;

  v_team := (select r.team_id from public.team_join_requests r where r.id = p_request);
  if v_team is null then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;

  -- Approval writes the roster, so it takes the roster rule: owner or
  -- manager, deliberately stricter than the challenge rule (which includes
  -- staff).
  if not exists (
    select 1 from public.team_members m
     where m.team_id = v_team and m.user_id = v_uid and m.role in ('owner','manager')
  ) then
    raise exception 'not_a_manager' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('team:' || v_team::text, 0));

  v_status := (select r.status from public.team_join_requests r where r.id = p_request);
  if v_status <> 'pending' then
    raise exception 'already_resolved' using errcode = 'P0001';
  end if;
  v_req := (select r.requester_id from public.team_join_requests r where r.id = p_request);

  if p_approve then
    if exists (select 1 from public.team_members m where m.team_id = v_team and m.user_id = v_req) then
      update public.team_join_requests
         set status = 'approved', resolved_at = now(), resolved_by = v_uid
       where id = p_request;
      return;
    end if;
    v_max := (select t.max_size from public.teams t where t.id = v_team);
    if v_max is not null then
      v_count := (select count(*) from public.team_members m where m.team_id = v_team);
      if v_count >= v_max then
        raise exception 'team_full' using errcode = 'P0001';
      end if;
    end if;
    insert into public.team_members (team_id, user_id, role)
    values (v_team, v_req, 'member');
    update public.team_join_requests
       set status = 'approved', resolved_at = now(), resolved_by = v_uid
     where id = p_request;
  else
    update public.team_join_requests
       set status = 'declined', resolved_at = now(), resolved_by = v_uid
     where id = p_request;
  end if;
end;
$$;

revoke all on function public.team_resolve_join_request(uuid, boolean) from public, anon;
grant execute on function public.team_resolve_join_request(uuid, boolean) to authenticated, service_role;

comment on function public.team_resolve_join_request is
  'D-40 command: an owner or manager approves or declines a pending ask. Approval seats the '
  'member under the team capacity lock; a vanished seat fails loudly with team_full.';

create or replace function public.team_withdraw_join_request(
  p_request uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_n   int;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'sign_in_required' using errcode = 'P0001';
  end if;
  update public.team_join_requests
     set status = 'withdrawn', resolved_at = now(), resolved_by = v_uid
   where id = p_request and requester_id = v_uid and status = 'pending';
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.team_withdraw_join_request(uuid) from public, anon;
grant execute on function public.team_withdraw_join_request(uuid) to authenticated, service_role;

comment on function public.team_withdraw_join_request is
  'D-40 command: the requester withdraws their own pending ask.';

select public.journal_migration('0274', '0274_team_joinability.sql', null,
  'Per team join policy chosen at creation (open or friends of the owner), plus the ask to join request flow: race safe commands, idempotent pending asks, capacity checked seating, deny by default table writes.');
