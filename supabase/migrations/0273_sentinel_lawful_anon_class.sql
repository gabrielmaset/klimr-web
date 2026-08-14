-- 0273_sentinel_lawful_anon_class.sql — function_acl_intact learns the
-- exception 0268 established, by derivation rather than by name.
--
-- THE COLLISION. 0239's sentinel encoded "anon executes nothing in public",
-- which was correct doctrine for its era. 0268 then proved by executed
-- baseline that logged-out surfaces REQUIRE anon EXECUTE on the functions
-- their RLS policies call — a policy runs with the querying role, and the
-- public tournament pages died without it. From that moment two of our own
-- controls disagreed: policy_fn_grants demands those grants, and
-- function_acl_intact forbids them. Every replay since 0268 has carried
-- klimr_ready=FAIL over exactly two functions (is_tournament_staff,
-- tournament_is_visible), surfaced loudly by CI run 118 — and, recorded
-- here as a process failure: two local replays carried the same red line
-- and the poll's grep filtered it out, so the batches sealed on top of it
-- were reported greener than they were. Polls now read the readiness line
-- and the replay exit code, always.
--
-- THE AMENDMENT. The anon branch gains one derived exemption: anon EXECUTE
-- is lawful if and only if pg_depend shows at least one RLS policy, on a
-- public-schema table where anon holds SELECT, referencing the function.
-- That is the reconciler's own granting condition, read from the same
-- catalog — the sentinel and the reconciler now share one definition of
-- lawful, so they cannot drift apart again. Every other anon-executable
-- function remains a violation, the authenticated branch is untouched, and
-- klimr_ready's check-count floor is unchanged: this amends a check, it
-- does not add one.

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
  'KRA-003, amended by 0273: fails if any public function is executable by anon — UNLESS an RLS '
  'policy on an anon-readable public table references it (the 0268 lawful class, derived from '
  'pg_depend so the sentinel and the reconciler share one definition) — or by authenticated '
  'without an explicit grant. Effective privileges, not ACL text.';

select public.journal_migration('0273', '0273_sentinel_lawful_anon_class.sql', null,
  'function_acl_intact learns the lawful anon class from 0268: anon may execute a function only when a policy on an anon readable public table references it. Derived from the catalog so the reconciler and the sentinel share one definition.');
