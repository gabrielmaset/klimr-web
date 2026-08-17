-- 0281_aal2_database_boundary.sql — B1 / KFU-003: MFA becomes a database fact.
--
-- FINDING. AAL2 was enforced only while a request passed through Next
-- middleware (lib/supabase/middleware.ts) and the app-side step-up helper. An
-- AAL1 access token can call PostgREST/RPC directly with the public project
-- configuration and never meet either. Middleware is not a trust boundary.
--
-- DESIGN. One predicate, fail-closed, plus enforcement at the destructive
-- boundary that a direct caller could otherwise reach:
--
--   public.caller_aal()   the assurance level of the CURRENT caller, read from
--                         the verified JWT claim. Null/absent/unknown is never
--                         upgraded to satisfied.
--   public.require_aal2() raises 'aal2_required' unless the caller proved AAL2.
--                         Service/definer paths (no JWT subject, or the service
--                         role) pass through — they are authenticated by a
--                         different mechanism and moderation must keep working.
--
-- SCOPE, deliberately narrow. The gate is applied to OWNERSHIP-DESTRUCTIVE team
-- transitions — promoting/demoting an owner and removing an owner row — because
-- those are the D8-sensitive operations reachable by direct DML. It is NOT
-- applied to ordinary membership writes: requiring MFA to seat a member or
-- create a team would be an over-broad denial, and an over-broad gate gets
-- disabled by the next person who trips over it. Additional surfaces are added
-- by naming them, not by widening this trigger.
--
-- P-CLASS NOTE (honest): this proves enforcement given a JWT that carries `aal`.
-- That Supabase's hosted Auth issues the claim as expected must be OBSERVED at
-- staging/production, not inferred from this migration.

create or replace function public.caller_aal()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select nullif(auth.jwt() ->> 'aal', '');
$$;

revoke all on function public.caller_aal() from public, anon;
grant execute on function public.caller_aal() to authenticated, service_role;

comment on function public.caller_aal is
  'KFU-003: the current caller''s authenticator assurance level from the verified JWT. Null when '
  'absent — callers must treat null as NOT satisfied.';

create or replace function public.require_aal2()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- Service and internal paths: no JWT subject, or the service role. These are
  -- authenticated by other means and must keep working against member rows.
  if auth.uid() is null or coalesce(auth.role(), '') = 'service_role' then
    return;
  end if;
  -- Fail closed: null, empty, 'aal1', or anything unrecognised is not AAL2.
  if coalesce(public.caller_aal(), '') <> 'aal2' then
    raise exception 'aal2_required'
      using errcode = 'P0001',
            hint = 'This action requires two-factor authentication. Sign in again with your second factor.';
  end if;
end;
$$;

revoke all on function public.require_aal2() from public, anon;
grant execute on function public.require_aal2() to authenticated, service_role;

comment on function public.require_aal2 is
  'KFU-003: raises aal2_required unless the current caller proved AAL2. Fail-closed on an absent or '
  'unrecognised claim. Service/definer paths pass through.';

-- Enforcement at the ownership-destructive boundary.
create or replace function public.enforce_aal2_owner_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.role = 'owner' then
      perform public.require_aal2();
    end if;
    return old;
  end if;
  -- UPDATE: only a change that moves the owner role in or out of this row.
  if new.role is distinct from old.role
     and (new.role = 'owner' or old.role = 'owner') then
    perform public.require_aal2();
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_aal2_owner_change() from public, anon, authenticated;

drop trigger if exists enforce_aal2_owner_change on public.team_members;
create trigger enforce_aal2_owner_change
  before update or delete on public.team_members
  for each row execute function public.enforce_aal2_owner_change();

select public.journal_migration('0281', '0281_aal2_database_boundary.sql', null,
  'KFU-003: fail-closed caller_aal and require_aal2 predicates plus enforcement on ownership destructive team_members transitions, so an AAL1 token calling PostgREST directly cannot perform a step up gated operation that Next middleware alone used to guard.');
