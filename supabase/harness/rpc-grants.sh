#!/bin/bash
# rpc-grants probe. Every RPC name the application calls must (a) exist in the
# replayed schema and (b) be executable by `authenticated` or `service_role` on
# at least one overload. Catches two real defect classes:
#   - 0250: a member RPC recreated with no grant, executable by nobody (found
#     2026-08-12 — get_ranked_feed was the only app-called function that neither
#     role could execute, because it rode on platform default privileges).
#   - a callsite naming a function the schema no longer defines (the dropped
#     single-argument feed_type_counts class, 0214/0243/0264).
# Usage: PSQL="psql …" REPO=/path bash rpc-grants.sh
set -u
: "${PSQL:?set PSQL}"; : "${REPO:?set REPO}"
names=$(grep -rhoE '\.rpc\(\s*"[a-z_0-9]+"' "$REPO/app" "$REPO/lib" "$REPO/components" \
          --include=*.ts --include=*.tsx 2>/dev/null | grep -oE '"[a-z_0-9]+"' | tr -d '"' | sort -u)
[ -n "$names" ] || { echo "rpc_grants=FAIL (no rpc callsites found — extraction broken)"; exit 1; }
fails=0; n=0
for f in $names; do
  n=$((n+1))
  # Emit explicit tokens: || casts booleans to 'true'/'false' (not psql's t/f
  # display), and the first version of this probe compared against 't' — every
  # name "failed" on its first run. Tokens make the contract display-independent.
  row=$($PSQL -tAc "select coalesce(count(*),0)||'|'||case when coalesce(bool_or(
          has_function_privilege('authenticated', p.oid, 'EXECUTE')
          or has_function_privilege('service_role', p.oid, 'EXECUTE')), false)
          then 'callable' else 'blocked' end
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='$f'")
  forms=${row%%|*}; callable=${row##*|}
  if [ "$forms" = "0" ]; then echo "  FAIL $f — no such function in schema"; fails=$((fails+1));
  elif [ "$callable" != "callable" ]; then echo "  FAIL $f — executable by neither authenticated nor service_role"; fails=$((fails+1)); fi
done
echo "rpc_grants=$([ $fails -eq 0 ] && echo PASS || echo FAIL) ($n names, $fails failing)"
exit $fails
