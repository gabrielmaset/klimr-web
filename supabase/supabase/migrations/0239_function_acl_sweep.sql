-- 0239_function_acl_sweep.sql — removes implicit PUBLIC EXECUTE from every
-- function in `public`, preserving every DELIBERATE grant exactly.
--
-- KRA-003 (P1, re-audit 2026-08-10). 0196 set out to remove PUBLIC EXECUTE and
-- only processed `pg_proc` rows whose `proacl` TEXT already contained a PUBLIC
-- entry. A function that has never been granted anything has `proacl IS NULL`,
-- which means "owner rights plus the default, and the default for a function is
-- EXECUTE to PUBLIC". Those rows matched none of 0196's predicates and kept the
-- privilege. `grant_hygiene_intact()` then checked RELATION privileges only, so
-- the readiness gate could not see the gap either.
--
-- Confirmed live TWICE during this batch, independently of the audit:
--   · 0237 revoked six pair predicates from `authenticated` and
--     `has_function_privilege('authenticated', …)` was still true, because the
--     role kept EXECUTE through PUBLIC. The new sentinel caught it in one replay.
--   · The audit's own example: `public.feed_emit` (0115) is SECURITY DEFINER with
--     caller-chosen kind, actor, ZIP, object ids, audience and sport, and inserts
--     Feed rows. No migration ever granted or revoked it, so it sat on the default
--     — reachable by any PostgREST caller, who could forge an actor.
--
-- APPROACH — preserve intent, remove accident.
-- A blanket revoke would break every function members legitimately call. So the
-- sweep distinguishes an EXPLICIT grant from a PUBLIC-derived one by reading the
-- ACL rather than guessing: `authenticated=X/owner` is a decision somebody made;
-- a bare `=X/owner` entry is the default nobody chose. Explicit grants are
-- re-applied verbatim; the default is removed. A function that was only ever
-- reachable by accident stops being reachable, and nothing that was deliberately
-- granted changes.

do $$
declare
  r          record;
  v_sig      text;
  v_revoked  int := 0;
  v_kept     int := 0;
begin
  for r in
    select p.oid,
           p.proname,
           pg_get_function_identity_arguments(p.oid) as args,
           coalesce(p.proacl::text, '') as acl
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind in ('f', 'p')   -- functions and procedures; aggregates have no EXECUTE story here
  loop
    v_sig := format('public.%I(%s)', r.proname, r.args);

    -- Always remove the two that must never hold EXECUTE by default.
    execute format('revoke execute on function %s from public, anon', v_sig);
    v_revoked := v_revoked + 1;

    -- Re-apply only what was EXPLICITLY granted. An empty ACL means the function
    -- had no explicit grants at all, so there is nothing to restore and it
    -- becomes owner/definer-only — which is what it always should have been.
    if r.acl like '%authenticated=X%' then
      execute format('grant execute on function %s to authenticated', v_sig);
      v_kept := v_kept + 1;
    end if;
    -- service_role ALWAYS keeps EXECUTE, whether or not the old ACL said so.
    --
    -- The narrower version of this line (re-grant only where the ACL already
    -- named service_role) caused a real regression, caught by the 0245 acceptance
    -- test: `provider_application_hash` had never been granted to anything, so it
    -- lived on the PUBLIC default — and 0203's freeze trigger runs with INVOKER
    -- rights and calls it. Revoking PUBLIC therefore broke every write to
    -- `provider_applications` with `permission denied for function`.
    --
    -- That is the general shape, not a one-off: any invoker-rights trigger body
    -- calling a helper that was only ever reachable through PUBLIC breaks the same
    -- way, and a replay that applies migrations will not notice because no trigger
    -- fires. service_role is the server's own identity and already bypasses RLS
    -- entirely, so withholding EXECUTE from it buys no safety and costs exactly
    -- this. anon and authenticated stay revoked unless explicitly granted, which
    -- is where the finding's risk actually lives.
    execute format('grant execute on function %s to service_role', v_sig);
  end loop;

  raise notice 'KRA-003 function ACL sweep: % functions processed, % explicit authenticated grants preserved',
    v_revoked, v_kept;
end $$;

-- ── the two the audit named, asserted by name ────────────────────────────
-- `feed_emit` writes Feed rows with a caller-supplied actor; `prune_feed_items`
-- is maintenance. Neither is a member operation. The sweep above already covers
-- them, but naming them here means a future migration that re-grants either one
-- has to argue with a line of SQL rather than slip past a loop.
-- Looked up BY NAME rather than by a typed signature. My first draft wrote the
-- argument list out by hand and got `p_object_kind` wrong (text, not uuid), so
-- the migration failed on apply. Retyping a signature is the same error class as
-- retyping a migration body, which this project already has a rule about — so the
-- names are resolved from the catalog and cannot drift.
do $$
declare r record;
begin
  for r in
    select format('public.%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid)) as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('feed_emit', 'prune_feed_items')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;

-- ── FUTURE functions: an event trigger, because default privileges do not work here ──
-- My first draft used:
--     alter default privileges in schema public revoke execute on functions from public;
-- and asserted in a test that the line was present. MEASURED on the replay cluster:
-- that statement records NOTHING — `pg_default_acl` stays empty and a function
-- created immediately afterwards still has `proacl IS NULL`, i.e. PUBLIC EXECUTE.
-- The built-in default for a function is applied when proacl is NULL and is not
-- removable by revoking it from the default-privilege set.
--
-- So the line was decorative, and the test asserting it was a test asserting a
-- claim rather than a behaviour — the exact failure this audit is full of. It is
-- replaced by a mechanism that was watched working: an event trigger that revokes
-- the default the moment a function is created.
--
-- Guarded: if the platform refuses event triggers the migration still applies, and
-- `function_acl_intact()` remains the backstop — it caught this class of defect on
-- its first replay, which is why the sweep is not the only control.
do $$
begin
  create or replace function public.revoke_public_execute_on_new_functions()
  returns event_trigger language plpgsql as $fn$
  declare r record;
  begin
    for r in select * from pg_event_trigger_ddl_commands()
              where command_tag in ('CREATE FUNCTION', 'CREATE PROCEDURE')
    loop
      if r.schema_name = 'public' then
        execute format('revoke execute on function %s from public, anon', r.object_identity);
      end if;
    end loop;
  end $fn$;

  -- The bootstrap case: this function is created BEFORE the trigger that would
  -- have revoked its default, so it is born with PUBLIC EXECUTE like everything
  -- else. Caught by function_acl_intact() on the first replay, which is the
  -- sentinel doing exactly what it exists for.
  revoke execute on function public.revoke_public_execute_on_new_functions() from public, anon, authenticated;

  drop event trigger if exists klimr_revoke_public_execute;
  create event trigger klimr_revoke_public_execute
    on ddl_command_end
    when tag in ('CREATE FUNCTION', 'CREATE PROCEDURE')
    execute function public.revoke_public_execute_on_new_functions();
exception when insufficient_privilege or feature_not_supported then
  raise notice 'event trigger not permitted here; function_acl_intact() remains the control';
end $$;

-- ── boundary sentinel: EFFECTIVE acls, not ACL text ─────────────────────
-- 0196's check read relation privileges and could not see this class of defect
-- at all. `has_function_privilege` answers the question that actually matters —
-- "can this role execute it" — including privilege inherited through PUBLIC.
create or replace function public.function_acl_intact()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind in ('f', 'p')
       and (
         has_function_privilege('anon', p.oid, 'EXECUTE')
         -- `authenticated` may execute only where an EXPLICIT grant says so.
         or (
           has_function_privilege('authenticated', p.oid, 'EXECUTE')
           and coalesce(p.proacl::text, '') not like '%authenticated=X%'
         )
       )
  );
$$;

revoke all on function public.function_acl_intact() from anon, authenticated, public;
grant execute on function public.function_acl_intact() to service_role;

comment on function public.function_acl_intact is
  'KRA-003: fails if any public function is executable by anon, or by authenticated without an '
  'explicit grant. Asks has_function_privilege (the EFFECTIVE answer) rather than reading ACL text, '
  'because the defect being caught is a privilege that ACL text does not mention.';

-- ── readiness floor moves with the new sentinel ─────────────────────────
create or replace function public.klimr_ready(p_min_checks integer default 21)
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
