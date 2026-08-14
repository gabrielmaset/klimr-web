#!/usr/bin/env bash
# policy-fn-grants — every function referenced by an RLS policy is executable by
# the roles that evaluate that policy, and no policy references a deny-listed
# raw pair predicate (0237 doctrine). Third sighting of the grant-gap class
# (0265 ranker grant, 0266 table-in-INVOKER, 0268 policy helpers).
#
# The first version of this gate printed PASS against a DEAD database: psql
# failed, the violation list was empty, empty looked like clean. A gate must
# prove it measured something — so it now fails on any psql error AND requires
# the scan to have seen at least one policy-referenced function.
set -u
P="${PSQL:?PSQL not set}"
OUT=$($P -qAt -v ON_ERROR_STOP=1 <<'SQL'
with polfn as (
  select pr.oid, pr.proname,
         bool_or( tn.nspname = 'public'
                  and has_table_privilege('anon', pol.polrelid, 'select') ) as anon_hits
    from pg_depend d
    join pg_policy pol on pol.oid = d.objid and d.classid = 'pg_policy'::regclass
    join pg_class  tc  on tc.oid = pol.polrelid
    join pg_namespace tn on tn.oid = tc.relnamespace
    join pg_proc   pr  on pr.oid = d.refobjid and d.refclassid = 'pg_proc'::regclass
    join pg_namespace n on n.oid = pr.pronamespace and n.nspname = 'public'
   group by pr.oid, pr.proname
)
select 'SCANNED:' || count(*) from polfn;
with polfn as (
  select pr.oid, pr.proname,
         bool_or( tn.nspname = 'public'
                  and has_table_privilege('anon', pol.polrelid, 'select') ) as anon_hits
    from pg_depend d
    join pg_policy pol on pol.oid = d.objid and d.classid = 'pg_policy'::regclass
    join pg_class  tc  on tc.oid = pol.polrelid
    join pg_namespace tn on tn.oid = tc.relnamespace
    join pg_proc   pr  on pr.oid = d.refobjid and d.refclassid = 'pg_proc'::regclass
    join pg_namespace n on n.oid = pr.pronamespace and n.nspname = 'public'
   group by pr.oid, pr.proname
)
select 'VIOLATION:' || proname || case
         when proname in ('may_act_on','may_see_connections','may_see_schedule','is_muted_by','is_restricted_by','comment_visible_to')
           then ' [DENY-LISTED predicate referenced by a policy]'
         when not has_function_privilege('authenticated', oid, 'execute')
           then ' [authenticated lacks EXECUTE]'
         else ' [anon lacks EXECUTE on an anon-readable surface]'
       end
  from polfn
 where proname in ('may_act_on','may_see_connections','may_see_schedule','is_muted_by','is_restricted_by','comment_visible_to')
    or not has_function_privilege('authenticated', oid, 'execute')
    or (anon_hits and not has_function_privilege('anon', oid, 'execute'))
 order by 1;
SQL
)
RC=$?
if [ $RC -ne 0 ]; then echo "policy-fn-grants=FAIL [psql exit $RC — nothing was measured]"; exit 1; fi
SCANNED=$(printf '%s\n' "$OUT" | sed -n 's/^SCANNED://p')
if [ -z "$SCANNED" ] || [ "$SCANNED" -lt 1 ]; then echo "policy-fn-grants=FAIL [scan saw $SCANNED policy functions — fixture is empty]"; exit 1; fi
V=$(printf '%s\n' "$OUT" | grep '^VIOLATION:' || true)
if [ -n "$V" ]; then
  echo "policy-fn-grants VIOLATIONS (scanned $SCANNED):"; printf '%s\n' "$V"; echo "policy-fn-grants=FAIL"; exit 1
fi
echo "policy-fn-grants=PASS (scanned $SCANNED policy-referenced functions)"
