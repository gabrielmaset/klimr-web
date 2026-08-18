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

# Feed visibility as a real member. Added 2026-08-12 after the ranked feed
# emptied twice (0250 semantics, then 0264's INVOKER read of a member-revoked
# table) — both invisible to suites that ran as postgres.
echo "-- feed visibility --"
if $P -f "$REPO/supabase/tests/feed_visibility_suite.sql" > "$W/feedvis.out" 2>&1; then
  echo "feed_visibility_suite=PASS ($(grep -c 'ok   ' "$W/feedvis.out") checks)"
else
  echo "feed_visibility_suite=FAIL"; grep -E "FEED|COUNTS|STALE|FIXTURE|ERROR" "$W/feedvis.out" | head -4; fails=$((fails+1))
fi

# 0270/0271: the match discovery ladder and the adult gate, as real members.
if $P -f "$REPO/supabase/tests/match_visibility_suite.sql" > "$W/matchvis.out" 2>&1; then
  echo "match_visibility_suite=PASS ($(grep -c 'ok   ' "$W/matchvis.out") checks)"
else
  echo "match_visibility_suite=FAIL"; grep -E "MATCH|ADULT|FIXTURE|ERROR" "$W/matchvis.out" | head -4; fails=$((fails+1))
fi

# 0274/0275: team joinability and the challenge belts, as real members.
if $P -f "$REPO/supabase/tests/teams_suite.sql" > "$W/teams.out" 2>&1; then
  echo "teams_suite=PASS ($(grep -c 'ok   ' "$W/teams.out") checks)"
else
  echo "teams_suite=FAIL"; grep -E "TEAM|BELT|FIXTURE|ERROR" "$W/teams.out" | head -4; fails=$((fails+1))
fi

# KFU-005: invoker-trigger grant matrix (provider application freeze path).
if $P -f "$REPO/supabase/tests/invoker_trigger_grants_suite.sql" > "$W/itg.out" 2>&1; then
  echo "invoker_trigger_grants_suite=PASS ($(grep -c 'ok   ' "$W/itg.out") checks)"
else
  echo "invoker_trigger_grants_suite=FAIL"; grep -E "ITG|ERROR" "$W/itg.out" | head -4; fails=$((fails+1))
fi

# KFU-028: suspended/banned members cannot write through the data plane.
if $P -f "$REPO/supabase/tests/suspension_gate_suite.sql" > "$W/susp.out" 2>&1; then
  echo "suspension_gate_suite=PASS ($(grep -c 'ok   ' "$W/susp.out") checks)"
else
  echo "suspension_gate_suite=FAIL"; grep -E "SUSP|ERROR" "$W/susp.out" | head -4; fails=$((fails+1))
fi

# KFU-001: Courtside enrollment negative matrix (public codes mint nothing).
if $P -f "$REPO/supabase/tests/courtside_enrollment_suite.sql" > "$W/cs.out" 2>&1; then
  echo "courtside_enrollment_suite=PASS ($(grep -c 'ok   ' "$W/cs.out") checks)"
else
  echo "courtside_enrollment_suite=FAIL"; grep -E "CS-FAIL|ERROR" "$W/cs.out" | head -4; fails=$((fails+1))
fi

# KFU-003: AAL2 enforced at the database boundary, not only in middleware.
if $P -f "$REPO/supabase/tests/aal2_boundary_suite.sql" > "$W/aal.out" 2>&1; then
  echo "aal2_boundary_suite=PASS ($(grep -c 'ok   ' "$W/aal.out") checks)"
else
  echo "aal2_boundary_suite=FAIL"; grep -E "AAL-FAIL|ERROR" "$W/aal.out" | head -4; fails=$((fails+1))
fi

# KFU-004: the block holds at the base profiles table, not only in the view.
if $P -f "$REPO/supabase/tests/profile_block_boundary_suite.sql" > "$W/blk.out" 2>&1; then
  echo "profile_block_boundary_suite=PASS ($(grep -c 'ok   ' "$W/blk.out") checks)"
else
  echo "profile_block_boundary_suite=FAIL"; grep -E "BLK-FAIL|ERROR" "$W/blk.out" | head -4; fails=$((fails+1))
fi

# KFU-033: adult admission is a server-set fact, not an absence of evidence.
if $P -f "$REPO/supabase/tests/adult_admission_suite.sql" > "$W/adm.out" 2>&1; then
  echo "adult_admission_suite=PASS ($(grep -c 'ok   ' "$W/adm.out") checks)"
else
  echo "adult_admission_suite=FAIL"; grep -E "ADM-FAIL|ERROR" "$W/adm.out" | head -4; fails=$((fails+1))
fi

# KFU-031: function contracts — oracles closed, controls proven with plants.
if $P -f "$REPO/supabase/tests/function_contracts_suite.sql" > "$W/fc.out" 2>&1; then
  echo "function_contracts_suite=PASS ($(grep -c 'ok   ' "$W/fc.out") checks)"
else
  echo "function_contracts_suite=FAIL"; grep -E "FC-FAIL|ERROR" "$W/fc.out" | head -4; fails=$((fails+1))
fi

# KFU-006/030: erasure + export declarations checked against the catalog.
if $P -f "$REPO/supabase/tests/data_inventory_suite.sql" > "$W/inv.out" 2>&1; then
  echo "data_inventory_suite=PASS ($(grep -c 'ok   ' "$W/inv.out") checks)"
else
  echo "data_inventory_suite=FAIL"; grep -E "INV-FAIL|ERROR" "$W/inv.out" | head -4; fails=$((fails+1))
fi

# KFU-008/009: evidence bound to bytes; the payment verifier is actually called.
if $P -f "$REPO/supabase/tests/evidence_binding_suite.sql" > "$W/evb.out" 2>&1; then
  echo "evidence_binding_suite=PASS ($(grep -c 'ok   ' "$W/evb.out") checks)"
else
  echo "evidence_binding_suite=FAIL"; grep -E "EVB-FAIL|ERROR" "$W/evb.out" | head -4; fails=$((fails+1))
fi

# KFU-013/010: terminal results are final; meetups have a state machine.
if $P -f "$REPO/supabase/tests/terminal_immutability_suite.sql" > "$W/ti.out" 2>&1; then
  echo "terminal_immutability_suite=PASS ($(grep -c 'ok   ' "$W/ti.out") checks)"
else
  echo "terminal_immutability_suite=FAIL"; grep -E "TI-FAIL|ERROR" "$W/ti.out" | head -4; fails=$((fails+1))
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

# rpc-grants: every app-called RPC exists and is executable by authenticated or
# service_role. Added 2026-08-12 after get_ranked_feed(5-arg) shipped with no
# grant at all and rode on platform default privileges the harness did not model.
echo "-- rpc grants --"
if PSQL="$P" REPO="$REPO" bash "$REPO/supabase/harness/rpc-grants.sh" > "$W/rpc.out" 2>&1; then
  echo "$(grep rpc_grants= "$W/rpc.out")"
else
  echo "rpc_grants=FAIL"; grep -E "FAIL " "$W/rpc.out" | head -6; fails=$((fails+1))
fi

# policy-fn-grants: every policy-referenced function is executable by the roles
# that evaluate the policy (0268; third sighting of the grant-gap class).
if PSQL="$P" bash "$REPO/supabase/harness/policy-fn-grants.sh" > "$W/polfn.out" 2>&1; then
  echo "policy_fn_grants=PASS"
else
  echo "policy_fn_grants=FAIL"; grep -E "VIOLATIONS|\[" "$W/polfn.out" | head -6; fails=$((fails+1))
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
