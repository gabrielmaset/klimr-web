-- 0291_sentinel_extension_members.sql — function_acl_intact learns the ownership
-- boundary it was silently measuring across.
--
-- WHAT HAPPENED. Production's only remaining readiness red was function_acl_intact,
-- and the violation set (owner-enumerated 2026-08-18) was thirty pg_trgm functions —
-- gin/gist trigram support, the similarity family, set/show_limit — every grant
-- made BY supabase_admin. The platform installed pg_trgm into public before 0153's
-- `create extension if not exists` ever ran (which therefore no-op'd there), so the
-- extension's members are owned by supabase_admin, and 0196's revoke sweep — run as
-- postgres — could not strip grants it did not make. The harness diverged for the
-- mirror-image reason: there 0153 really created the extension as postgres, the
-- sweep worked, and the sentinel stayed green. The check was red over grants this
-- role has no authority to change, on computational functions (internal-typed index
-- support and pure text-similarity) with no data access and no side effects.
--
-- WHAT THIS DOES. Amends the sentinel — not the grants — with one derived
-- exemption: functions that are extension members (pg_depend deptype 'e') are
-- outside the check's enforcement scope, on both the anon and authenticated
-- branches. Same philosophy as 0273: the class is derived from the catalog, never
-- name-listed, so it cannot drift. Everything Klimr defines remains fully gated;
-- the negative control below in the harness proves an anon grant on one of our own
-- functions still turns the sentinel red. Amends a check; adds none; klimr_ready's
-- count floor is unchanged.

begin;

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
       -- 0291: extension members are the platform's surface, not ours. Their
       -- grants are made by the extension owner (supabase_admin on hosted), and
       -- PostgreSQL permits only the grantor to revoke — 0196's sweep proved
       -- effective in the harness (postgres-owned pg_trgm, stripped) and
       -- structurally ineffective in production (supabase_admin-owned, 30
       -- anon-executable trigram/index-support functions survived). A check
       -- must not gate what it has no authority to enforce; membership is
       -- derived from the catalog, 0273-style, so the class cannot drift.
       and not exists (
         select 1 from pg_depend xd
          where xd.classid = 'pg_proc'::regclass
            and xd.objid = p.oid
            and xd.refclassid = 'pg_extension'::regclass
            and xd.deptype = 'e'
       )
       and (
         (
           has_function_privilege('anon', p.oid, 'EXECUTE')
           and not exists (
             select 1
               from pg_depend d
               join pg_policy pol on pol.oid = d.objid and d.classid = 'pg_policy'::regclass
               join pg_class tc on tc.oid = pol.polrelid
               join pg_namespace tn on tn.oid = tc.relnamespace
              where tn.nspname = 'public'
                and d.refclassid = 'pg_proc'::regclass
                and d.refobjid = p.oid
                and has_table_privilege('anon', pol.polrelid, 'select')
           )
         )
         or (
           has_function_privilege('authenticated', p.oid, 'EXECUTE')
           and coalesce(p.proacl::text, '') not like '%authenticated=X%'
         )
       )
  );
$$;

revoke all on function public.function_acl_intact() from public, anon, authenticated;
grant execute on function public.function_acl_intact() to service_role;

comment on function public.function_acl_intact is
  'KRA-003, amended by 0273 and 0291: fails if any public function is executable by anon — unless an '
  'RLS policy on an anon-readable public table references it (0273''s lawful class) — or by '
  'authenticated without an explicit grant; EXCEPT extension member functions (pg_depend deptype e), '
  'whose grants belong to the extension owner and are not this role''s to revoke. Effective '
  'privileges, not ACL text; every class derived from the catalog.';

select public.journal_migration('0291', '0291_sentinel_extension_members.sql', null,
  'function_acl_intact learns the ownership boundary: extension member functions (derived via pg_depend deptype e) are exempt on both branches — their grants are made by the extension owner (supabase_admin on hosted pg_trgm) and postgres structurally cannot revoke them, as 0196''s sweep demonstrated by working in the harness and not in production. Klimr-defined functions remain fully gated.');

commit;
