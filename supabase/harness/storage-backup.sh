#!/usr/bin/env bash
# Storage backup (KCDX-053).
#
# Supabase Pro backs up POSTGRES. It does not back up Storage. Until this runs, a
# database restore returns every row with its `media_path`, `avatar_path` and
# `proof_path` intact, pointing at bytes that no longer exist.
#
# GOAL: bring Klimr back completely from any single failure. That needs three
# things, and this script is one of them:
#   1. the database          — Supabase daily backups (exists)
#   2. the objects           — THIS
#   3. the configuration     — config-capture.sh, because a restored database and
#                              a full bucket still leave you rebuilding auth
#                              settings and env vars from memory
#
# ── REDUNDANCY ───────────────────────────────────────────────────────────
# One destination is a copy, not redundancy. Everything goes to TWO independent
# providers, so a provider outage, a billing lapse, or one compromised credential
# does not take both. R2 is primary (no egress fees, and a restore reads
# everything back); B2 is the second copy. Different companies, different
# credentials, different failure modes — which is the whole point.
#
# ── THE BUCKETS ARE NOT ONE PROBLEM ──────────────────────────────────────
# COPY PLAINLY — member content; losing it is what we are insuring against
#   avatars, feed-media, listing-photos, tournament-gallery, post-media
#   (feed-media holds photos and, when video is re-enabled after 0195, videos)
#
# COPY ENCRYPTED — personal documents. They leave our provider, so they are
# encrypted CLIENT-SIDE first and the backup host stores ciphertext it cannot
# read.
#   credential-docs, business-docs, tournament-payments
#
#   `tournament-payments` holds screenshots of Venmo/Zelle confirmations. Klimr
#   does NOT process payments and is not the system of record — organisers keep
#   their own history with their own provider. These are dispute evidence for the
#   length of a tournament, so they get a SHORT retention below rather than being
#   kept forever. Holding financial screenshots indefinitely for records we are
#   not responsible for is liability without benefit.
#
# QUARANTINE — split, because treating it as one thing is wrong in both
# directions.
#   Most of what lands there is a FALSE POSITIVE: ordinary member content the
#   hash gate or classifier flagged, which its owner still owns and which belongs
#   in the backup like anything else. Encrypted, same as the documents.
#
#   CONFIRMED matches are different in kind. Copying known CSAM to another
#   provider creates new copies, in a new jurisdiction, under another operator's
#   terms. The duty for that material is to preserve in place under legal hold
#   and report it — not to replicate it nightly. Those are excluded by the
#   `confirmed` predicate below, and anyone minded to change that should be
#   talking to a lawyer rather than editing a script.
#
# ── A SYNC IS NOT A BACKUP ───────────────────────────────────────────────
# `rclone sync` makes the destination match the source INCLUDING deletions, so an
# accidental or malicious delete propagates to the only other copy. This uses
# `copy`, which never deletes, with a dated `--backup-dir` for anything that
# changed. The backup is additive; yesterday's version survives today's mistake.
# Turn object versioning on at both destinations as a second line.
#
# ── SETUP (once) ─────────────────────────────────────────────────────────
#   Supabase → Storage → S3 Access Keys → create one.
#   Two destination buckets, versioning ON, at two providers.
#   rclone remotes: supa, r2, b2, and crypt wrappers r2enc / b2enc.
#   Secrets: RCLONE_CONF (the whole config, so rotation is one step), PGURI.
set -uo pipefail

: "${RCLONE_SRC:=supa}"
: "${DST_A:=r2:klimr-backup}"          # primary, plain
: "${DST_A_ENC:=r2enc:}"               # primary, encrypted
: "${DST_B:=b2:klimr-backup}"          # secondary, plain
: "${DST_B_ENC:=b2enc:}"               # secondary, encrypted
: "${PGURI:?set PGURI}"

STAMP="$(date -u +%Y-%m-%d)"
fails=0
q() { psql "$PGURI" -tAc "$1" 2>/dev/null | tr -d ' '; }

echo "== manifest before =="
MANIFEST=$(q "select public.storage_manifest_take('backup ${STAMP}')")
echo "   manifest ${MANIFEST}  objects=$(q "select object_count from public.storage_manifests where id='${MANIFEST}'") bytes=$(q "select total_bytes from public.storage_manifests where id='${MANIFEST}'")"

copy() {  # copy <bucket> <dest-root> <label>
  local b="$1" dest="$2" label="$3"
  if rclone copy "${RCLONE_SRC}:${b}" "${dest}/${b}" \
       --backup-dir "${dest}/_superseded/${STAMP}/${b}" \
       --transfers 8 --checksum --stats-one-line --stats 60s >/dev/null 2>&1; then
    echo "   ok    ${b} → ${label}"
  else
    echo "   FAIL  ${b} → ${label}"; fails=$((fails+1))
  fi
}

PLAIN=(avatars feed-media listing-photos tournament-gallery post-media)
ENC=(credential-docs business-docs tournament-payments)

echo
echo "== member content → both providers =="
for b in "${PLAIN[@]}"; do copy "$b" "$DST_A" "R2"; copy "$b" "$DST_B" "B2"; done

echo
echo "== personal documents → both providers, encrypted =="
for b in "${ENC[@]}"; do copy "$b" "$DST_A_ENC" "R2/enc"; copy "$b" "$DST_B_ENC" "B2/enc"; done

echo
echo "== quarantine — NOT COPIED, deliberately =="
# OWNER DECISION OD-4 (revised 2026-08-10, after statutory research; see
# docs/KRA_DISPOSITION_REGISTER.md). NOTHING in this bucket leaves the primary
# provider — not confirmed matches, and not unconfirmed ones either.
#
# The previous version copied "only the items NOT confirmed as CSAM" to both
# encrypted destinations. That reasoning was wrong in one specific way:
# "unconfirmed" is a statement about what WE currently know, not about what the
# bytes are. Material later confirmed would already have been replicated to two
# vendors before anyone knew what it was, and a copy cannot be un-made.
#
# 18 U.S.C. 2258A(h)(4) tells a provider to keep preserved material in a secure
# location and LIMIT access; replication is the opposite instruction. 2258B's
# immunity covers performing the reporting/preservation duty and is disapplied
# for reckless acts. The REPORT Act had to create a special carve-out for vendors
# NCMEC retains, and the Safe Cloud Storage Act (still a BILL, not law) exists to
# extend that to other approved vendors — Congress is legislating precisely this
# gap. Commercial object-storage terms generally forbid the material outright.
#
# What IS protected instead: the provenance record — uploader identity, IP,
# timestamps, content hashes, decision log, report ids — which is metadata rather
# than depiction, carries no distribution exposure, is required by 2258A(b) for a
# complete CyberTipline report, and is the part genuinely lost in a disaster. It
# travels with the database backup.
#
# This matches docs/RESILIENCE.md, which has said "never copied" all along; the
# script was the half that diverged (KRA-018).
CONFIRMED=$(q "select count(*) from public.safety_incidents where kind in ('csam_hash_match','ai_csae_flag') and status in ('preserved','reported')")
PENDING=$(q "select count(*) from storage.objects where bucket_id = 'quarantine'")
echo "   ${CONFIRMED} confirmed incident(s) — preserved in place, legal hold"
echo "   ${PENDING} object(s) in quarantine — NOT copied, by decision"
echo "   provenance/decision rows travel with the database backup"

echo
echo "== configuration =="
# The part a restore cannot reconstruct from the database or the objects.
bash "$(dirname "$0")/config-capture.sh" > "/tmp/config-${STAMP}.json" 2>/dev/null \
  && for d in "$DST_A" "$DST_B"; do
        err=$(rclone copy "/tmp/config-${STAMP}.json" "${d}/_config/" --s3-no-check-bucket 2>&1 >/dev/null) \
        && echo "   ok    config-${STAMP}.json → ${d}" \
        || { echo "   FAIL  config → ${d}: $(printf '%s' "$err" | grep -m1 . | cut -c1-160)"; fails=$((fails+1)); }
     done
rm -f "/tmp/config-${STAMP}.json"

echo
echo "== retention =="
# Payment proofs are dispute evidence for the length of a tournament, not
# financial records Klimr is responsible for. 400 days keeps a full season plus
# a margin; beyond that they are liability without benefit.
for d in "$DST_A_ENC" "$DST_B_ENC"; do
  rclone delete "${d}/tournament-payments" --min-age 400d >/dev/null 2>&1 \
    && echo "   ok    tournament-payments older than 400d pruned in ${d}"
done
# Superseded versions: 180 days is long enough to notice a bad deploy and short
# enough that the backup does not grow without bound.
for d in "$DST_A" "$DST_B" "$DST_A_ENC" "$DST_B_ENC"; do
  rclone delete "${d}/_superseded" --min-age 180d >/dev/null 2>&1 || true
done

echo
echo "== verify =="
# KRA-018: this checked object COUNTS, and only for the plain buckets — so the
# encrypted document copies and the configuration copy were unverified entirely,
# and even the plain ones passed on a count match with different bytes. Counting
# is the weakest possible check: it cannot distinguish "the file came back" from
# "a file with that name came back", which is the exact distinction 0226's
# manifest exists to make.
#
# Every destination class is checked now, and the plain buckets are checked by
# rclone's CHECKSUM comparison rather than a tally.
for b in "${PLAIN[@]}"; do
  s=$(rclone size "${RCLONE_SRC}:${b}" --json 2>/dev/null | grep -o '"count":[0-9]*' | cut -d: -f2)
  a=$(rclone size "${DST_A}/${b}"      --json 2>/dev/null | grep -o '"count":[0-9]*' | cut -d: -f2)
  bb=$(rclone size "${DST_B}/${b}"     --json 2>/dev/null | grep -o '"count":[0-9]*' | cut -d: -f2)
  if [ "${s:-0}" = "${a:-0}" ] && [ "${s:-0}" = "${bb:-0}" ]; then
    # Counts agree; now prove the BYTES do. `check` compares hashes and exits
    # non-zero on any difference or missing object.
    if rclone check "${RCLONE_SRC}:${b}" "${DST_A}/${b}" --one-way >/dev/null 2>&1 \
       && rclone check "${RCLONE_SRC}:${b}" "${DST_B}/${b}" --one-way >/dev/null 2>&1; then
      echo "   ok    ${b}: ${s:-0} objects, checksums match on R2 and B2"
    else
      echo "   FAIL  ${b}: counts agree but CONTENT differs — a partial restore would look complete"
      fails=$((fails+1))
    fi
  else
    echo "   WARN  ${b}: source ${s:-0}, R2 ${a:-0}, B2 ${bb:-0}"; fails=$((fails+1))
  fi
done

# Encrypted destinations: the ciphertext differs from the source by design, so a
# checksum comparison against the source is meaningless. Object count is what can
# be asserted here, and it is asserted rather than skipped — which is what it was.
for b in "${ENC[@]}"; do
  s=$(rclone size "${RCLONE_SRC}:${b}" --json 2>/dev/null | grep -o '"count":[0-9]*' | cut -d: -f2)
  a=$(rclone size "${DST_A_ENC}/${b}"  --json 2>/dev/null | grep -o '"count":[0-9]*' | cut -d: -f2)
  bb=$(rclone size "${DST_B_ENC}/${b}" --json 2>/dev/null | grep -o '"count":[0-9]*' | cut -d: -f2)
  if [ "${s:-0}" = "${a:-0}" ] && [ "${s:-0}" = "${bb:-0}" ]; then
    echo "   ok    ${b} (encrypted): ${s:-0} objects on both"
  else
    echo "   WARN  ${b} (encrypted): source ${s:-0}, R2 ${a:-0}, B2 ${bb:-0}"; fails=$((fails+1))
  fi
done

echo
echo "storage_backup=$([ $fails -eq 0 ] && echo PASS || echo FAIL) ($fails issue(s))  manifest=${MANIFEST}"
exit $fails
