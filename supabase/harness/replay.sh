#!/bin/bash
# KCDX-004 replay gate. Usage: replay.sh [empty|upgrade]
#   empty   — full 0001→0188 + 0189 from an empty cluster (clean-rebuild proof)
#   upgrade — replay to 0187, simulate 0188's rollback, then apply 0189
#             (proof that 0189 repairs the actual production baseline)
set -u
MODE="${1:-empty}"
PGBIN=${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}
CI_MODE=${CI_MODE:-0}   # 1 = use an already-running server (GitHub Actions service container)
REPO=${REPO:-$(cd "$(dirname "$0")/../.." && pwd)}
HERE="$(cd "$(dirname "$0")" && pwd)"
D=${PGDATA_DIR:-$HOME/pgreplay}; PORT=${PORT:-5546}; SOCK=${SOCK:-$HOME/pgsock}
W=$HOME/replaywork; rm -rf "$W" "$D"; mkdir -p "$W/mig" "$SOCK"
if [ "$CI_MODE" = "1" ]; then
  # A service container is already running; use a throwaway database per gate.
  DB="replay_${MODE}_$$"
  psql -d postgres -v ON_ERROR_STOP=1 -qc "drop database if exists $DB" 
  psql -d postgres -v ON_ERROR_STOP=1 -qc "create database $DB"
  P="psql -d $DB -v ON_ERROR_STOP=1 -q"
else
  rm -f "$SOCK"/.s.PGSQL.$PORT*   # clear any stale socket/lock from an interrupted run
  $PGBIN/initdb -D "$D" -U postgres --auth=trust -E UTF8 >"$W/initdb.log" 2>&1 || { tail -3 "$W/initdb.log"; exit 1; }
  $PGBIN/pg_ctl -D "$D" -o "-k $SOCK -p $PORT -c listen_addresses=''" -l "$W/pg.log" start >/dev/null 2>&1; sleep 8
  P="$PGBIN/psql -h $SOCK -p $PORT -U postgres -d postgres -v ON_ERROR_STOP=1 -q"
fi
run(){ $P -f "$1" >"$W/last.out" 2>&1 || { echo "### FAIL $(basename "$1")"; grep -m2 ERROR "$W/last.out"; return 1; }; }
# Supabase-managed extensions do not exist off-platform; neutralize in COPIES only.
cp "$REPO"/supabase/migrations/*.sql "$W/mig/"
sed -i -E 's/^[[:space:]]*create extension[[:space:]]+(if not exists[[:space:]]+)?"?(pg_cron|pg_net)"?.*$/-- [harness] neutralized: &/I' "$W/mig"/*.sql
[ "$MODE" = upgrade ] && rm -f "$W/mig/0188_search_metrics.sql"   # model 0188 aborting: 0189 must reconstruct it
fails=0; ok=0
run "$HERE/shim.sql" || exit 1
run "$W/mig/0001_init.sql" || exit 1; ok=$((ok+1))
run "$HERE/baseline_repair.sql" || exit 1          # out-of-band prod objects (F1)
run "$REPO/supabase/seed.sql"   || exit 1          # reference data BEFORE 0016/0017/0018 (F3)
for f in $(ls "$W"/mig/*.sql | sort | grep -v 0001_init); do run "$f" && ok=$((ok+1)) || fails=$((fails+1)); done
# 0189/0190 are part of the ordered history; the loop above already applied them
# in the empty gate. In upgrade mode 0188 is removed to model its abort, so the
# loop still reaches them. Nothing extra to run here.
echo "MODE=$MODE APPLIED_OK=$ok FAILED=$fails"
$P -c "select
 (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname='public') tables,
 (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname='public' and c.relrowsecurity) rls,
 (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public') funcs,
 (select count(*) from pg_policies where schemaname='public') policies,
 (select count(*) from storage.buckets) buckets"
# KCDX-018: negative authorization, as the roles that matter. A replay that
# builds the right schema but hands members the wrong privileges is not a pass.
echo "-- negative authorization suite --"
if $P -f "$REPO/supabase/tests/rls_negative_suite.sql" > "$W/neg.out" 2>&1; then
  echo "rls_negative_suite=PASS ($(grep -c 'ok  ' "$W/neg.out") checks)"
else
  echo "rls_negative_suite=FAIL"; grep -E "FAIL|ERROR" "$W/neg.out" | head -5; fails=$((fails+1))
fi

# KCDX-051: the concurrency proofs. Every locked command in this remediation was
# verified against a real race, and every one of those proofs lived in a shell
# session that closed. A race that was fixed and never re-tested is a race
# waiting to come back, because the next author to simplify a lock has nothing
# telling them what it was for.
echo "-- concurrency --"
if PSQL="$P" bash "$REPO/supabase/harness/concurrency.sh" > "$W/conc.out" 2>&1; then
  echo "$(grep concurrency_suite= "$W/conc.out")"
else
  echo "concurrency_suite=FAIL"; grep -E "FAIL " "$W/conc.out" | head -6; fails=$((fails+1))
fi

# KCDX-052: the readiness gate, after the replay. A migration that opens a
# boundary now fails CI rather than being discovered at boot in production.
echo "-- readiness --"
ready=$($P -tAc "select public.klimr_ready()" 2>/dev/null | tr -d ' ')
if [ "$ready" = "t" ]; then
  echo "klimr_ready=PASS ($($P -tAc 'select count(*) from public.klimr_readiness()' | tr -d ' ') checks)"
else
  echo "klimr_ready=FAIL"
  $P -tAc "select '   ' || check_name || coalesce(' — '||detail,'') from public.klimr_readiness() where not passed" 2>/dev/null
  fails=$((fails+1))
fi

echo "-- acceptance probes --"
$P -tAc "select 'manifest_missing='||coalesce(array_to_string(public.schema_manifest_missing(), ', '), '')" 
$P -tAc "select 'avatar_path='||count(*) from information_schema.columns where table_name='profiles' and column_name='avatar_path'"
$P -tAc "select 'search_zero_rate='||count(*) from pg_proc where proname='search_zero_rate'"
$P -tAc "select * from public.search_zero_rate(168)" >/dev/null 2>&1 && echo "search_zero_rate_callable=yes" || echo "search_zero_rate_callable=NO"
$P -c "insert into public.perf_samples(metric, value_ms, route) values ('search_zero', 12, '/search')" >/dev/null 2>&1 && echo "search_metric_accepted=yes" || echo "search_metric_accepted=NO"
if [ "$CI_MODE" = "1" ]; then
  psql -d postgres -qc "drop database if exists $DB" >/dev/null 2>&1
else
  $PGBIN/pg_ctl -D "$D" stop -m fast >/dev/null 2>&1
fi
# REMOVED 2026-08-10: this used to read
#
#     # The empty gate is EXPECTED to fail on 0188 ...
#     [ "$MODE" = empty ] && [ "$fails" -le 1 ] && exit 0
#
# An earlier session found that 0188 could not create `search_zero_rate` from
# zero, reasoned that 0189 repairs it, and wrote that conclusion into the gate as
# a standing allowance. The reasoning was even correct — nothing downstream was
# broken.
#
# But the allowance did not say "0188 may fail". It said "ONE migration may fail",
# forever, in the mode that proves the schema can be rebuilt. Any future
# from-zero breakage would have been absorbed silently, and this session came
# close to proving it: the FAILED=1 sat in my own output for a week and I filtered
# it out as expected noise, because it had been declared expected.
#
# 0188 is repaired. A migration that fails now fails the gate. If a from-zero
# failure is ever genuinely acceptable, that belongs in the migration as a guard
# with a reason — not in the scoreboard as a tolerance.
exit $fails
