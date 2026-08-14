#!/usr/bin/env bash
# Concurrency suite (KCDX-051).
#
# Every locked command built during the remediation was proven against a real
# race — two genuinely concurrent transactions, not two sequential calls — and
# every one of those proofs lived in a shell session and evaporated when it
# closed. A race that was fixed and never re-tested is a race waiting to come
# back, because the next author to "simplify" a lock has nothing telling them
# what it was for.
#
# These are those proofs, committed. Each one takes two psql sessions, has both
# sleep to the same instant, fires them together, and asserts the outcome.
# Sequential calls would pass against the ORIGINAL buggy code; only real
# concurrency distinguishes a lock from a comment about a lock.
#
# Usage: PSQL="psql -h ... -U ..." bash supabase/harness/concurrency.sh
set -uo pipefail
P="${PSQL:?set PSQL to a psql invocation}"
fails=0

q()  { $P -qtAc "$1" 2>&1 | tail -1; }
run2() { # run2 <sql-a> <sql-b> — fire both at the same instant
  local a b
  a=$(mktemp); b=$(mktemp)
  printf 'begin;\nselect pg_sleep(0.4);\n%s\ncommit;\n' "$1" > "$a"
  printf 'begin;\nselect pg_sleep(0.4);\n%s\ncommit;\n' "$2" > "$b"
  ( $P -qtA -v ON_ERROR_STOP=0 -f "$a" 2>&1 | grep -vE '^(BEGIN|COMMIT|$)' | tail -1 ) &
  ( $P -qtA -v ON_ERROR_STOP=0 -f "$b" 2>&1 | grep -vE '^(BEGIN|COMMIT|$)' | tail -1 ) &
  wait
  rm -f "$a" "$b"
}
check() { # check <label> <actual> <expected>
  if [ "$2" = "$3" ]; then echo "  ok   $1"; else echo "  FAIL $1 — got '$2', want '$3'"; fails=$((fails+1)); fi
}

echo "-- concurrency suite --"
$P -qc "begin; " >/dev/null 2>&1

# ── fixture ───────────────────────────────────────────────────────────────
q "insert into auth.users (id,email) values
   ('11110000-0000-0000-0000-000000000001','cc1@t.test'),
   ('11110000-0000-0000-0000-000000000002','cc2@t.test'),
   ('11110000-0000-0000-0000-000000000003','cc3@t.test')
   on conflict do nothing" >/dev/null
q "insert into public.profiles (id,display_name) values
   ('11110000-0000-0000-0000-000000000001','CA'),
   ('11110000-0000-0000-0000-000000000002','CB'),
   ('11110000-0000-0000-0000-000000000003','CC')
   on conflict (id) do nothing" >/dev/null
q "insert into public.sports (key,name,skill_system) values ('tennis','Tennis','ntrp') on conflict do nothing" >/dev/null

A=11110000-0000-0000-0000-000000000001
B=11110000-0000-0000-0000-000000000002
C=11110000-0000-0000-0000-000000000003
AS_A="set local role authenticated; set local \"request.jwt.claim.sub\"='$A'; set local \"request.jwt.claim.role\"='authenticated';"
AS_B="set local role authenticated; set local \"request.jwt.claim.sub\"='$B'; set local \"request.jwt.claim.role\"='authenticated';"

# ── KCDX-027: opposite-direction connection requests ─────────────────────
q "delete from public.friendships" >/dev/null
run2 "$AS_A select public.request_connection('$B');" "$AS_B select public.request_connection('$A');" >/dev/null
check "KCDX-027 mutual requests settle as one accepted connection" \
  "$(q "select coalesce(status,'none')||'/'||count(*) from public.friendships group by status")" "accepted/1"

# ── KCDX-040: one person, two courts, one session ────────────────────────
q "delete from public.queue_team_members; delete from public.queue_teams; delete from public.queue_courts; delete from public.court_sessions" >/dev/null
q "insert into public.court_sessions (id,organizer_id,title,sport_key,code,display_code,status)
   values ('22220000-0000-0000-0000-000000000001','$C','Race Q','tennis','RQ0001','DRQ001','live')" >/dev/null
q "insert into public.queue_courts (id,session_id,label,team_size) values
   ('33330000-0000-0000-0000-000000000001','22220000-0000-0000-0000-000000000001','C1',2),
   ('33330000-0000-0000-0000-000000000002','22220000-0000-0000-0000-000000000001','C2',2)" >/dev/null
run2 "select public.place_on_team('33330000-0000-0000-0000-000000000001','$A',null,null);" \
     "select public.place_on_team('33330000-0000-0000-0000-000000000002','$A',null,null);" >/dev/null
check "KCDX-040 one placement per person per session" \
  "$(q "select count(*) from public.queue_team_members m join public.queue_teams t on t.id=m.team_id where m.user_id='$A' and t.status<>'done'")" "1"

# ── KRA-037: a key stops binding when its placement is over ──────────────
q "delete from public.queue_command_log; delete from public.queue_team_members; delete from public.queue_teams" >/dev/null
# Full-team cases get their OWN court: on the shared court a placement-command
# team can fill and turn 'queued', which made the first version of the
# queues-once check count the wrong command's team. And the session must allow
# full teams, or the command under test correctly refuses before doing anything.
q "update public.court_sessions set allow_full_teams=true where id='22220000-0000-0000-0000-000000000001'" >/dev/null
q "insert into public.queue_courts (id,session_id,label,team_size) values
   ('33330000-0000-0000-0000-000000000003','22220000-0000-0000-0000-000000000001','C3',2)
   on conflict (id) do nothing" >/dev/null
T1=$(q "select public.place_on_team('33330000-0000-0000-0000-000000000001','$B',null,'k37-epoch')")
q "update public.queue_teams set status='done' where id='$T1'" >/dev/null
T2=$(q "select public.place_on_team('33330000-0000-0000-0000-000000000001','$B',null,'k37-epoch')")
check "KRA-037 dead placement starts a new epoch" \
  "$(q "select count(*) from public.queue_team_members m join public.queue_teams t on t.id=m.team_id where m.user_id='$B' and t.status<>'done'")" "1"
check "KRA-037 replay after death is a NEW placement" \
  "$(q "select ('$T1' <> '$T2')::text")" "true"
check "KRA-037 refreshed key points at the live team" \
  "$(q "select coalesce((result_team_id = '$T2')::text,'null') from public.queue_command_log where idempotency_key='k37-epoch'")" "true"

G1=$(q "select public.place_on_team('33330000-0000-0000-0000-000000000002',null,'Alex','k37-guest')")
q "update public.queue_teams set status='done' where id='$G1'" >/dev/null
q "select public.place_on_team('33330000-0000-0000-0000-000000000002',null,'Alex','k37-guest')" >/dev/null
check "KRA-037 a second Alex is not the first Alex's ghost" \
  "$(q "select count(*) from public.queue_team_members m join public.queue_teams t on t.id=m.team_id where m.guest_name='Alex' and t.status<>'done'")" "1"

run2 "select public.place_on_team('33330000-0000-0000-0000-000000000001','$C',null,'k37-race');" \
     "select public.place_on_team('33330000-0000-0000-0000-000000000001','$C',null,'k37-race');" >/dev/null
check "KRA-037 same key raced twice places once" \
  "$(q "select count(*) from public.queue_team_members m join public.queue_teams t on t.id=m.team_id where m.user_id='$C' and t.status<>'done'")" "1"

run2 "select public.queue_join_full_team('33330000-0000-0000-0000-000000000003', array['FT One','FT Two'], 'k37-team');" \
     "select public.queue_join_full_team('33330000-0000-0000-0000-000000000003', array['FT One','FT Two'], 'k37-team');" >/dev/null
check "KRA-037 full team raced on one key queues once" \
  "$(q "select count(*) from public.queue_teams t where t.status='queued' and t.court_id='33330000-0000-0000-0000-000000000003'")" "1"
check "KRA-037 full team members land atomically" \
  "$(q "select count(*) from public.queue_team_members m where m.team_id = (select result_team_id from public.queue_command_log where idempotency_key='k37-team')")" "2"
# Not through q(): its tail -1 keeps only the CONTEXT line of a two-line
# Postgres error, so the grep never saw the ERROR line that names the refusal.
check "KRA-037 wrong-size team refused in the command" \
  "$($P -qtAc "select public.queue_join_full_team('33330000-0000-0000-0000-000000000003', array['Solo'], null)" 2>&1 | grep -c bad_team_names)" "1"

# ── KCDX-043: two people, one remaining seat ─────────────────────────────
q "delete from public.event_rsvps; delete from public.events where title='Race Event'" >/dev/null
q "insert into public.events (id,title,sport_key,starts_at,status,capacity,join_policy)
   values ('44440000-0000-0000-0000-000000000001','Race Event','tennis',now()+interval '2 days','active',1,'open')" >/dev/null
run2 "select public.event_admit('44440000-0000-0000-0000-000000000001','$A',null);" \
     "select public.event_admit('44440000-0000-0000-0000-000000000001','$B',null);" >/dev/null
check "KCDX-043 one seat admits exactly one" \
  "$(q "select count(*) from public.event_rsvps where event_id='44440000-0000-0000-0000-000000000001' and status='going'")" "1"

# ── KCDX-044: two offers, one open slot ──────────────────────────────────
q "delete from public.match_participants; delete from public.join_requests; delete from public.matches" >/dev/null
q "insert into public.matches (id,sport_key,format,organizer_id,total_slots,status)
   values ('55550000-0000-0000-0000-000000000001','tennis','singles','$C',2,'open')" >/dev/null
q "insert into public.match_participants (match_id,user_id) values ('55550000-0000-0000-0000-000000000001','$C')" >/dev/null
q "insert into public.join_requests (match_id,requester_id,status,offer_expires_at) values
   ('55550000-0000-0000-0000-000000000001','$A','offered',now()+interval '30 min'),
   ('55550000-0000-0000-0000-000000000001','$B','offered',now()+interval '30 min')" >/dev/null
run2 "select public.match_confirm_offer('55550000-0000-0000-0000-000000000001','$A');" \
     "select public.match_confirm_offer('55550000-0000-0000-0000-000000000001','$B');" >/dev/null
check "KCDX-044 one open slot claims exactly one offer" \
  "$(q "select count(*) from public.match_participants where match_id='55550000-0000-0000-0000-000000000001'")" "2"

# ── KCDX-003: tournament capacity under a race ───────────────────────────
q "delete from public.tournament_registrations; delete from public.tournaments where code='RC0001'" >/dev/null
q "insert into public.tournaments (id,owner_id,code,title,sport_key,status,entry_type,capacity,registration_deadline)
   values ('66660000-0000-0000-0000-000000000001','$C','RC0001','Race Cup','tennis','published','individual',1, now()+interval '7 days')" >/dev/null
run2 "$AS_A select public.tournament_register('66660000-0000-0000-0000-000000000001');" \
     "$AS_B select public.tournament_register('66660000-0000-0000-0000-000000000001');" >/dev/null
check "KCDX-003 capacity 1 admits one and waitlists the other" \
  "$(q "select string_agg(status,',' order by status) from public.tournament_registrations")" "pending,waitlisted"

echo "concurrency_suite=$([ $fails -eq 0 ] && echo PASS || echo FAIL) ($fails failing)"
exit $fails
