-- 0202_team_invariants.sql — KCDX-010 and KCDX-048 (P1).
--
-- ── KCDX-010: an invite you can point somewhere else ─────────────────────
-- `invites respond` is `for update using (invited_user_id = auth.uid()) with
-- check (invited_user_id = auth.uid())`. Both halves pin one column. Everything
-- else on the row — including `team_id` — is the invitee's to rewrite.
--
-- So: receive any invite from anyone, PATCH its `team_id` to a team you were
-- never invited to, then accept. `respondTeamInvite` re-reads the invite, sees
-- your own user id and a pending status, and performs a **service-role** upsert
-- into `team_members` using the `team_id` you just supplied. The privileged write
-- is doing exactly what it was asked; the row it trusted was attacker-shaped.
--
-- A policy cannot fix this, because the problem is not "whose row is it" — the
-- row really is theirs. It is that identity fields on an invite are not data. So
-- the invitee's UPDATE goes away and accepting becomes one locked command that
-- reads the invite itself, under a lock, and never takes a team id from a caller.
--
-- ── KCDX-048: ownership stored in two places, written in three statements ─
-- `transferOwnership` issues three separate updates: promote the target, demote
-- the caller, then move `teams.created_by`. Nothing checks affected rows and
-- nothing is transactional, so an interruption between any two leaves a team
-- with two owners, none, or a `created_by` that disagrees with the roster —
-- and `leaveTeam` has the same shape when an owner leaves.
--
-- Both become single locked transactions with exact affected-row checks. The
-- invariant they maintain is stated once, in `team_ownership_intact()`, so it can
-- be asserted rather than assumed.

-- ── 1. identity fields on an invite are not data ──────────────────────────
drop policy if exists "invites respond" on public.team_invites;

create or replace function public.team_invite_respond(
  p_invite uuid,
  p_accept boolean
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me    uuid := auth.uid();
  v_inv   record;
  v_team  record;
  v_count int;
  v_cap   int;
begin
  if v_me is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;

  -- The invite is read HERE, under a lock, from its id. No caller supplies a
  -- team id at any point in this function, which is the entire fix.
  select * into v_inv from public.team_invites where id = p_invite for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_inv.invited_user_id <> v_me then return jsonb_build_object('ok', false, 'error', 'not_yours'); end if;
  if v_inv.status <> 'pending' then return jsonb_build_object('ok', false, 'error', 'already_answered'); end if;

  if not p_accept then
    update public.team_invites set status = 'declined' where id = p_invite;
    return jsonb_build_object('ok', true, 'status', 'declined');
  end if;

  -- Lock the team so the capacity count cannot change between reading it and
  -- inserting the member. The old code counted with one statement and upserted
  -- with another.
  select * into v_team from public.teams where id = v_inv.team_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'team_gone'); end if;

  if exists (select 1 from public.team_members where team_id = v_inv.team_id and user_id = v_me) then
    update public.team_invites set status = 'accepted' where id = p_invite;
    return jsonb_build_object('ok', true, 'status', 'accepted', 'team_id', v_inv.team_id);
  end if;

  select count(*) into v_count from public.team_members where team_id = v_inv.team_id;
  v_cap := coalesce(v_team.max_size, 12);
  if v_count >= v_cap then
    return jsonb_build_object('ok', false, 'error', 'team_full');
  end if;

  insert into public.team_members (team_id, user_id, role)
  values (v_inv.team_id, v_me, 'member')
  on conflict (team_id, user_id) do nothing;

  update public.team_invites set status = 'accepted' where id = p_invite;
  return jsonb_build_object('ok', true, 'status', 'accepted', 'team_id', v_inv.team_id);
end;
$$;

-- Belt and braces: even the service role should not be able to move an invite
-- between teams by accident, and a future policy that re-opens UPDATE would
-- otherwise re-open the whole finding.
create or replace function public.freeze_invite_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.team_id          := old.team_id;
  new.invited_user_id  := old.invited_user_id;
  new.invited_by       := old.invited_by;
  return new;
end;
$$;

drop trigger if exists team_invites_freeze_identity on public.team_invites;
create trigger team_invites_freeze_identity
  before update on public.team_invites
  for each row execute function public.freeze_invite_identity();

-- ── 2. one owner, moved in one transaction ────────────────────────────────
create or replace function public.team_transfer_ownership(
  p_team uuid,
  p_to   uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me     uuid := auth.uid();
  v_team   record;
  v_rows   int;
  v_demote text;
begin
  if v_me is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_to = v_me then return jsonb_build_object('ok', false, 'error', 'same_person'); end if;

  select * into v_team from public.teams where id = p_team for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

  if not exists (
    select 1 from public.team_members
     where team_id = p_team and user_id = v_me and role = 'owner'
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_owner');
  end if;

  if not exists (select 1 from public.team_members where team_id = p_team and user_id = p_to) then
    return jsonb_build_object('ok', false, 'error', 'not_a_member');
  end if;

  -- Manager is a Pro-only role; on recreational teams the outgoing owner rejoins
  -- as an ordinary member.
  v_demote := case when v_team.category = 'pro' then 'manager' else 'member' end;

  update public.team_members set role = 'owner' where team_id = p_team and user_id = p_to;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'transfer: promoting % affected % rows', p_to, v_rows; end if;

  update public.team_members set role = v_demote where team_id = p_team and user_id = v_me;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'transfer: demoting % affected % rows', v_me, v_rows; end if;

  update public.teams set created_by = p_to where id = p_team;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'transfer: teams update affected % rows', v_rows; end if;

  return jsonb_build_object('ok', true, 'owner', p_to, 'former_owner_role', v_demote);
end;
$$;

/** Leaving, including the case that used to split ownership: the owner leaves and
 *  the longest-standing remaining member is promoted. Same transaction, same lock. */
create or replace function public.team_leave(p_team uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me   uuid := auth.uid();
  v_team record;
  v_next uuid;
  v_was_owner boolean;
begin
  if v_me is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;

  select * into v_team from public.teams where id = p_team for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

  select role = 'owner' into v_was_owner from public.team_members
   where team_id = p_team and user_id = v_me;
  if v_was_owner is null then return jsonb_build_object('ok', false, 'error', 'not_a_member'); end if;

  delete from public.team_members where team_id = p_team and user_id = v_me;

  if v_was_owner then
    select user_id into v_next from public.team_members
     where team_id = p_team order by joined_at asc limit 1;
    if v_next is null then
      -- Last member out. The team keeps `created_by` as a historical fact; there
      -- is no roster left to own it, and deleting the team is a separate decision.
      return jsonb_build_object('ok', true, 'left', true, 'team_empty', true);
    end if;
    update public.team_members set role = 'owner' where team_id = p_team and user_id = v_next;
    update public.teams set created_by = v_next where id = p_team;
    return jsonb_build_object('ok', true, 'left', true, 'new_owner', v_next);
  end if;

  return jsonb_build_object('ok', true, 'left', true);
end;
$$;

revoke all on function public.team_invite_respond(uuid, boolean) from public, anon;
revoke all on function public.team_transfer_ownership(uuid, uuid) from public, anon;
revoke all on function public.team_leave(uuid) from public, anon;
grant execute on function public.team_invite_respond(uuid, boolean)   to authenticated, service_role;
grant execute on function public.team_transfer_ownership(uuid, uuid)  to authenticated, service_role;
grant execute on function public.team_leave(uuid)                     to authenticated, service_role;

-- ── 3. state the invariant so it can be asserted ──────────────────────────
create or replace function public.team_ownership_intact()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- no team with a roster has zero or several owners
    not exists (
      select 1 from public.team_members
       group by team_id
      having count(*) filter (where role = 'owner') <> 1
    )
    -- and `teams.created_by` agrees with that owner
    and not exists (
      select 1
        from public.teams t
        join public.team_members m on m.team_id = t.id and m.role = 'owner'
       where t.created_by <> m.user_id
    )
    -- and the invitee cannot rewrite an invite
    and not exists (
      select 1 from pg_policies
       where schemaname = 'public' and tablename = 'team_invites' and cmd = 'UPDATE'
    );
$$;

revoke all on function public.team_ownership_intact() from public, anon, authenticated;
grant execute on function public.team_ownership_intact() to service_role;
