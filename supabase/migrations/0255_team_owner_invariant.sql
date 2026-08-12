-- 0255_team_owner_invariant.sql — a team always has an owner, enforced where it
-- cannot be raced.
--
-- KRA-039 (P1, re-audit 2026-08-10). `removeMember` reads the target's role,
-- checks it is not 'owner', and then issues a SERVICE-ROLE delete keyed only on
-- (team_id, user_id) — no lock, and no `role <> 'owner'` predicate on the delete
-- itself. Between the read and the write the target can be promoted, or two
-- managers can act at once, and the sole owner is stripped. The team is then
-- ownerless: nobody can transfer ownership, change settings, or delete it, and
-- there is no path back through the product.
--
-- ── WHY THIS IS A TRIGGER AND NOT A BETTER READ ──────────────────────────
-- Adding a predicate to that one delete would fix that one caller. The invariant
-- is "a team has at least one owner", and it must hold for every path — the
-- admin console, a future bulk tool, a support script, a migration. This
-- remediation has now found five inline copies of the block rule that drifted
-- apart because each surface re-implemented it; a rule enforced at the table is
-- the version that cannot drift.
--
-- The trigger is the invariant. The command below is the ergonomics.

create or replace function public.guard_last_team_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_team uuid; v_owners int;
begin
  v_team := coalesce(old.team_id, new.team_id);

  -- Only deletions and demotions can remove an owner.
  if tg_op = 'UPDATE' and not (old.role = 'owner' and new.role <> 'owner') then
    return new;
  end if;
  if tg_op = 'DELETE' and old.role <> 'owner' then
    return old;
  end if;

  -- Serialise on the team so two concurrent removals cannot each observe the
  -- other's owner still present. Row-level locking the team is the natural
  -- boundary: ownership is a property of the team, not of either membership row.
  perform 1 from public.teams where id = v_team for update;

  select count(*) into v_owners
    from public.team_members
   where team_id = v_team and role = 'owner'
     and not (user_id = coalesce(old.user_id, new.user_id));

  if v_owners = 0 then
    raise exception 'team_must_have_an_owner'
      using hint = 'Transfer ownership before removing or demoting the last owner.';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists team_members_guard_last_owner on public.team_members;
create trigger team_members_guard_last_owner
  before update or delete on public.team_members
  for each row execute function public.guard_last_team_owner();

-- ── the command ──────────────────────────────────────────────────────────
-- Authorization re-derived from the locked rows under the CALLER's identity, and
-- the delete carries its own `role <> 'owner'` predicate so a stale read cannot
-- widen it. Both halves matter: the predicate makes the wrong outcome
-- unrepresentable, the trigger makes it unrepresentable everywhere else too.
create or replace function public.team_remove_member(p_team uuid, p_target uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_actor uuid := auth.uid(); v_actor_role text; v_target_role text;
begin
  if v_actor is null or p_team is null or p_target is null then return 'invalid'; end if;
  if v_actor = p_target then return 'use_leave'; end if;

  perform 1 from public.teams where id = p_team for update;

  select role into v_actor_role  from public.team_members where team_id = p_team and user_id = v_actor;
  select role into v_target_role from public.team_members where team_id = p_team and user_id = p_target;

  if v_target_role is null then return 'not_a_member'; end if;
  if v_actor_role not in ('owner', 'manager') then return 'forbidden'; end if;
  -- A manager may not remove a peer manager, and nobody removes an owner here.
  if v_target_role = 'owner' then return 'transfer_first'; end if;
  if v_actor_role = 'manager' and v_target_role = 'manager' then return 'forbidden'; end if;

  delete from public.team_members
   where team_id = p_team and user_id = p_target
     -- Belt: even if the read above were stale, this cannot remove an owner.
     and role <> 'owner';

  if not found then return 'not_removed'; end if;

  delete from public.team_invites where team_id = p_team and invited_user_id = p_target;
  return 'removed';
end $$;

revoke all on function public.team_remove_member(uuid, uuid) from public, anon;
grant execute on function public.team_remove_member(uuid, uuid) to authenticated, service_role;

comment on function public.team_remove_member is
  'KRA-039: removes a team member as ONE locked command. The read-then-service-role-delete it '
  'replaces could strip the sole owner if the target was promoted in between, leaving a team nobody '
  'could administer and no product path back.';

-- ── boundary sentinel ────────────────────────────────────────────────────
create or replace function public.team_owner_invariant_intact()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (select 1 from pg_trigger where tgname = 'team_members_guard_last_owner')
    -- the command's delete carries its own predicate, not just the read
    and (select position('role <> ''owner''' in pg_get_functiondef(p.oid)) > 0
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'team_remove_member' limit 1)
    -- and no team is currently ownerless
    and not exists (
      select 1 from public.teams t
       where not exists (
         select 1 from public.team_members m where m.team_id = t.id and m.role = 'owner'
       )
    );
$$;

revoke all on function public.team_owner_invariant_intact() from public, anon, authenticated;
grant execute on function public.team_owner_invariant_intact() to service_role;

create or replace function public.klimr_ready(p_min_checks integer default 35)
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
