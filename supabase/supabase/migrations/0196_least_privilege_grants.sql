-- 0196_least_privilege_grants.sql — KCDX-016 (P1): blanket grants and implicit
-- PUBLIC EXECUTE amplify every policy and function mistake.
--
-- WHERE THIS STANDS TODAY. `anon` holds SELECT on roughly 110 tables, including
-- `invite_codes`, `investor_codes`, `gate_access_codes`, `conversation_keys`,
-- `error_logs`, `admin_users` and `safety_incidents`. Nothing leaks: each of
-- those either has no policy at all (RLS default-deny) or binds `auth.uid()`,
-- which is null for `anon`. That was worth confirming and it is worth saying
-- plainly — this is not an open door. It is a door with no lock, held shut by a
-- second door, and the entire finding is that one mistake in the second door is
-- then a breach rather than a bug.
--
-- ONE PRIVILEGE HERE IS NOT MERELY THEORETICAL. `authenticated` holds TRUNCATE
-- on ~100 tables, inherited from the platform default privileges rather than
-- from anything a migration asked for. **RLS does not apply to TRUNCATE.**
-- Policies govern SELECT, INSERT, UPDATE and DELETE; TRUNCATE is a table-level
-- operation gated only by the privilege. PostgREST does not expose TRUNCATE
-- today, and `authenticated` has no CREATE on the schema, so there is no path to
-- it right now — but "no path today" is a statement about the current surface,
-- not about the grant. A privilege that RLS cannot constrain should not be held
-- by a role every member gets.
--
-- REFERENCES and TRIGGER are inert for the same reason (no CREATE on schema),
-- and go for the same reason.
--
-- WHAT THIS DELIBERATELY DOES NOT CHANGE. Every table `anon` can actually read
-- today, it still reads. The list below is derived from the live policy set, not
-- from a guess about what the product needs, so this migration is a reduction in
-- privilege with no reduction in function. Narrowing what is *intentionally*
-- public is a product decision and belongs in its own change.

-- ── 1. privileges RLS cannot constrain ────────────────────────────────────
-- Views count. `pg_tables` excludes them, and the two views added by 0191
-- arrived from the platform defaults holding the full set — which is exactly the
-- "every new relation starts wide" problem this migration is about.
do $$
declare t record;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r','p','v','m')
  loop
    execute format('revoke truncate, references, trigger on public.%I from anon, authenticated', t.relname);
  end loop;
end $$;

-- ── 2. anon reads only what anon actually reads ───────────────────────────
-- Derived from the policies that genuinely admit `anon`: either the role list
-- names it, or the policy is granted to `public` with a `true` qualifier.
--   sports, zip_regions              — reference data, explicitly `TO anon`
--   tournaments, tournament_divisions,
--   tournament_draws                 — the public tournament microsite
--   health_article_reads, provider_reviews,
--   sport_formats                    — policies granted to `public` USING (true)
do $$
declare
  keep constant text[] := array[
    'sports','zip_regions','tournaments','tournament_divisions','tournament_draws',
    'health_article_reads','provider_reviews','sport_formats'
  ];
  t record;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r','p','v','m')
       and not (c.relname = any (keep))
  loop
    execute format('revoke select on public.%I from anon', t.relname);
  end loop;
end $$;

-- ── 3. future tables inherit the narrower set ─────────────────────────────
-- The platform's own default privileges grant everything to all three roles, so
-- a table created by a later migration would arrive with TRUNCATE for members
-- and SELECT for anon all over again. Narrow the defaults so the next migration
-- author does not have to remember this file exists.
alter default privileges in schema public
  revoke truncate, references, trigger on tables from anon, authenticated;
alter default privileges in schema public
  revoke select on tables from anon;

-- ── 4. implicit PUBLIC EXECUTE ────────────────────────────────────────────
-- A function granted to PUBLIC is callable by `anon`. Several mutating ones were
-- — `end_sponsorship`, `respond_sponsorship`, `shift_tournament_plan`, the
-- `liveness_*` organizer commands. They check `auth.uid()` internally and so
-- refuse an anonymous caller, but that is the second door again.
--
-- Each function that currently holds PUBLIC EXECUTE keeps working for members:
-- PUBLIC is revoked and `authenticated` is granted explicitly, so effective
-- access for a signed-in user is identical. `anon` keeps only what it holds by
-- an explicit grant — which today is `tournament_is_visible`, the predicate the
-- anonymous tournament-microsite policies call.
do $$
declare f record;
begin
  for f in
    select p.oid,
           format('public.%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid)) as sig,
           p.proacl
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
       and p.proacl::text like '%=X/%'                     -- has an ACL at all
       and array_to_string(p.proacl, ',') like '=X/%'      -- ...beginning with the PUBLIC entry
  loop
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
    execute format('revoke execute on function %s from public', f.sig);
  end loop;
end $$;

alter default privileges in schema public revoke execute on functions from public;

-- ── 5. keep it closed ─────────────────────────────────────────────────────
create or replace function public.grant_hygiene_intact()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- no member role holds a privilege RLS cannot constrain
    not exists (
      select 1 from information_schema.table_privileges
       where table_schema = 'public'
         and grantee in ('anon','authenticated')
         and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER')
    )
    -- anon reads only the deliberately public surface
    and not exists (
      select 1 from information_schema.table_privileges
       where table_schema = 'public'
         and grantee = 'anon'
         and privilege_type = 'SELECT'
         and table_name not in (
           'sports','zip_regions','tournaments','tournament_divisions','tournament_draws',
           'health_article_reads','provider_reviews','sport_formats'
         )
    );
$$;

revoke all on function public.grant_hygiene_intact() from public, anon, authenticated;
grant execute on function public.grant_hygiene_intact() to service_role;
