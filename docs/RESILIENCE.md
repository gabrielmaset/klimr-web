# Klimr Resilience — Backups, Restore Drill, RPO/RTO

**Status:** Active · Owner: Gabriel Duran · Updated August 2026 · K2-06 (audit DEP-004 · D6)

What Klimr would actually lose in a disaster, how long recovery would take, and
the drill that proves those numbers instead of assuming them. **A backup you
have never restored is a hypothesis, not a backup** — the drill in section 3 is
the point of this document.

---

## 1. What protects the data today

| Layer | Protection | Notes |
|---|---|---|
| **Database** | Supabase **Pro** daily automated backups | Active since Aug 5, 2026 (decision D6). Pro also stops the project auto-pausing. |
| **Point-in-time recovery** | Not enabled | An add-on above Pro. See §5 — this is the single change that would most improve RPO. |
| **Schema** | Migration files in Git (`supabase/migrations/`) + `MIGRATIONS_LEDGER.md` | The schema is fully reconstructable from the repo, independent of any backup. |
| **Application code** | GitHub + Vercel build history | Redeployable to any prior commit. |
| **Storage (avatars, post media, documents)** | **Nightly additive copy to TWO providers** (R2 + B2, GitHub Actions `storage-backup.yml`) | <!-- claim:storage-backup=nightly-r2-b2 --> Member content copied plainly and checksum-verified one-way every run; personal documents client-side encrypted and `cryptcheck`-verified; quarantine deliberately never copied (OD-4). Deletions NEVER propagate to the backups — destination-only objects are retained history, reported per run. KCDX-053 (no Storage backup) is closed by this workflow; what remains open is the restore DRILL (§3), which has never been run. History: until 2026-08-07 this row claimed project-backup coverage that did not exist; `tests/doc-claims.test.ts` still forbids that sentence and now asserts the workflow, the script, and its one-way verify all exist.
| **Secrets** | Vercel environment variables | **Not in any backup.** See §4. |

---

## 2. Targets

These are commitments to hold the drill against, sized for a pre-launch pilot —
not enterprise numbers, and deliberately honest about it.

| Measure | Target | Reasoning |
|---|---|---|
| **RPO** (data we could lose) | **≤ 24 hours — VALIDATED 2026-08-20** | <!-- claim:drill-run=2026-08-20 --> Daily backups (~12:14 UTC); worst case is a failure just before the next snapshot. The first drill restored the 2026-08-20 12:14:28Z backup at ~15:14Z — an observed gap of ~3 h, with ≤ 24 h the structural ceiling. Storage objects have their own nightly (~10:02 UTC) to R2+B2, so object RPO shares the same ≤ 24 h ceiling. |
| **RTO** (time to serving again) | **≤ 4 hours — database leg MEASURED: 5 m 10 s** | First drill (2026-08-20): click-to-restored-project in 5 m 10 s via Restore-to-new-project (BETA), verdict green (klimr_ready, 43/43) minutes later. The ≤ 4 h target covers the FULL cutover — env repoint + redeploy remain unmeasured; the database leg is no longer the unknown (KCDX-053). |
| **RTO for code-only rollback** | **≤ 15 minutes** | Vercel instant rollback to a prior deployment; no data involved. |
| **Degraded-mode target** | **immediate** | Venues fall back to paper (`VENUE-PLAYBOOK.md`, `RUNBOOKS.md`). Open play never depends on Klimr being up. |

**The honest read on RPO:** losing up to a day would mean losing a day of
matches, queue history, posts, and signups. During a pilot that is recoverable —
organizers can re-enter results. After launch it is not acceptable, which is
what makes PITR the first upgrade at scale (§5).

---

## 3. The restore drill — run this, don't assume it

**Run it once now, then again before pilot start, then quarterly.** Budget
about an hour. Nothing here touches production: every command targets the
scratch project, and the verdict script is read-only even if pasted into the
production editor by mistake.

1. **Use Supabase's native cross-project restore.** Production → Database →
   Backups has three tabs (verified by screenshot, 2026-08-20): *Scheduled
   backups*, *Point in time*, and **Restore to new project (BETA)** — the
   third is the drill's mechanism, and it removes every Terminal step this
   runbook used to need.

   ⚠ **Never click the "Restore" buttons on the *Scheduled backups* list.**
   Those restore IN-PLACE — they overwrite production. The drill uses ONLY
   the *Restore to new project* tab.

2. **On the *Restore to new project* tab**, pick the newest backup and follow
   the flow. If it asks for a project name, use `restore-<today's date>`
   (e.g. `restore-2026-08-20`); if it asks for a region, match production.
   The new project will likely be created inside the production (Pro) org —
   that is fine: a scratch project alive for an hour costs cents, and step 7
   deletes it. **Write down the backup's timestamp** (the nightlies run
   ~12:14 UTC) — the gap between it and "now" is your real observed RPO.
   The backups are PHYSICAL, which is why no Download exists.
   **Confirmed by the flow's own dialog (2026-08-20):** the new project lands
   in the SAME org and region as production at **$0 additional cost** (same
   compute size, 1.5× disk); "all data and indexes" transfer — so auth users,
   the migration journal and the storage-manifest rows all come across — while
   storage objects, auth settings/API keys and extensions need manual
   reconfiguration, which matches §4 line for line.
   **Observed 2026-08-20 (first drill):** "extensions need manual
   reconfiguration" means dashboard settings, NOT schemas — the physical
   restore carried the cron schema and all 12 jobs, **ACTIVE**, including the
   worker heartbeat whose command has production's URL and cron secret baked
   in (0289). A restored project therefore pokes production every minute
   until it is deleted: step 7 is also the off-switch — never leave a
   restored project idling. If the BETA flow errors, stop and report what it
   says.
3. **Start a stopwatch when the import begins.** Stop it when step 4 passes.
   That elapsed time is your observed RTO; both numbers go in §6.
4. **Paste `supabase/ops/drill_check_2026-08.sql`** into the scratch SQL
   editor. One result table, eleven rows. A healthy drill reads: journal head
   `0295`+, `klimr_ready() = true`, `43` sentinels, failing sentinels
   `(none)`, RLS-exposed tables `0`, and a storage manifest row present
   (production has one per nightly). Row 11 (pg_cron) is informational — a
   scratch restore does not run jobs. Record the whole table in §6.
   *Optional deep check:* also paste `supabase/tests/rls_and_invariants_checks.sql`
   and `supabase/tests/social_graph_checks.sql` — their write-containing
   transactions roll back; the trailing grant check is read-only.
5. **Compare the data rows (6–8) against production** by running the same
   verdict paste in the production editor — the counts and the newest-session
   timestamp should line up with the backup's age.
6. **Prove the restore is usable — two tiers.**
   - **Tier A (required, dashboard only):** in the scratch project,
     Authentication → Users shows the owner accounts; Table Editor opens
     `profiles`; and step 4's `klimr_ready()` row is `true`. That is the
     required bar: schema, commands, invariants and data all came back.
   - **Tier B (optional — needs a local Node setup; skip freely and record
     "skipped"):** in the repo folder, create `.env.local` with the scratch
     project's URL and anon key plus the six REQUIRED vars from
     `.env.example`, then `npm install`, `npm run build`, `npm start`, and
     confirm `/` and `/login` render. Full sign-in needs SMTP the scratch
     project doesn't have — rendering is the honest scope of this tier.
7. **Delete the restored project** after recording the results — it costs
   money and is a second copy of member data. (The empty `klimr-drill`
   Free org stays parked for the WP-R staging proofs; the native restore
   flow made it unnecessary for THIS drill.)

**Record the result in §6 every time, including failures.** A drill that only
gets recorded when it succeeds tells you nothing.

---

## 4. What a restore does NOT bring back

Know these before an incident, not during one:

- **Environment variables / secrets.** Not in any database backup. Keep the
  required list (`.env.example`, boot-asserted per K0-03) reproducible. A
  restored database with no `SUPABASE_SERVICE_ROLE_KEY` serves nothing — and
  the boot assertion will tell you exactly which variable is missing.
- **Auth provider configuration** — magic-link settings, TOTP enrollment
  policy, redirect URLs, SMTP. Re-set by hand in the dashboard.
- **pg_cron schedules** (migrations 0172/0173) — verify the waitlist sweep is
  scheduled in the restored project or durable jobs silently stop draining.
- **Cloudflare/DNS and the vision portal Worker** — separate systems entirely.
- **Edge/CDN cache state** — irrelevant, self-heals.

---

## 5. The upgrade path, in priority order

1. **Point-in-time recovery.** Takes RPO from ~24 hours to minutes. This is the
   single highest-value resilience purchase and the right first spend once real
   member data is at stake — i.e., before public launch, not before pilot.
2. **An off-Supabase DATABASE copy.** Storage already lives at two independent
   vendors; the database does not — every Postgres backup is Supabase's own.
   A periodic `pg_dump` shipped to the same R2/B2 pair removes that last
   single point of failure.
3. **Alerting on backup failure.** GitHub Actions emails the owner on a red
   nightly today (proven 2026-08-19 — the notification is how the first
   post-wipe run was caught within hours). The upgrade is aggregation and
   paging, not existence.
4. **A documented, rehearsed cutover** (DNS + env + redeploy) so RTO stops
   depending on improvisation under pressure.

---

## 6. Drill log

Append one row per drill. Empty is honest — fill the first row when you run it.

| Date | Backup timestamp | Observed RPO | Observed RTO | Schema check | App check | Storage manifest | Notes |
|---|---|---|---|---|---|---|---|
| 2026-08-20 | 2026-08-20 12:14:28Z | ~3 h observed (≤ 24 h ceiling) | 5 m 10 s to restored project; verdict green minutes after | klimr_ready TRUE, 43/43 sentinels, journal head 0295 (35 rows) | Tier A pass (auth users 2 = profiles 2; Table Editor OK) | id=4d887544… objects=4 taken 10:04Z | Restore-to-new-project (BETA), $0. FINDING: pg_cron restored LIVE — 12 jobs incl. the outbound heartbeat with production URL+secret baked in; project deleted promptly. Storage untested by design (separate R2/B2 system). |

### Storage backup

Supabase Pro backs up Postgres. It does not back up Storage, so until this runs,
a database restore returns every row with its `media_path`, `avatar_path` and
`proof_path` intact and pointing at bytes that no longer exist.

`supabase/harness/storage-backup.sh`, scheduled nightly by
`.github/workflows/storage-backup.yml`.

**The buckets are three different problems, not one.**

| Bucket | Treatment | Why |
|---|---|---|
| `avatars`, `listing-photos`, `tournament-gallery`, `feed-media`, `post-media` | copied plainly | member content; losing it is what we are insuring against |
| `credential-docs`, `business-docs`, `tournament-payments` | copied **client-side encrypted** | identity and financial documents. They leave our provider, so the backup host stores ciphertext it cannot read |
| `quarantine` | **never copied** | holds material the CSAM gate and classifier flagged. Copying suspected CSAM to another provider creates new copies in a new jurisdiction under another operator's terms. The duty for this material is to preserve in place and report — not to replicate it nightly to a bucket nobody is thinking about. Anyone minded to change this should speak to a lawyer, not edit a script. |

**The verify runs one-way, and that direction is the design.** Every run
asserts that EVERY source object exists at both destinations with matching
bytes (plaintext checksums for the plain buckets, `rclone cryptcheck` for the
encrypted ones). Objects that exist only at the destinations are deletions the
backup is retaining — reported as a note, never an error. Learned 2026-08-19:
the first mass deletion (the production seed wipe) turned the nightly red
because the old verify demanded source == destination, an invariant that
contradicted the additive design one paragraph down — and skipped the checksum
comparison exactly when counts diverged.

**A sync is not a backup.** `rclone sync` makes the destination match the source
including deletions, so an accidental or malicious delete propagates to the only
other copy. This uses `copy`, which never deletes, plus a dated `--backup-dir`
for anything that changed — the backup is additive and yesterday's version
survives today's mistake. The destination bucket should also have object
versioning on, as a second line.

**Why GitHub Actions and not a Vercel cron.** KCDX-039 found both Vercel cron
routes had been silently redirected to a login page for their entire lives while
the scheduler reported healthy runs. A GitHub workflow either succeeds or turns
red, and red is visible.

**What still has to be done by hand, once:** create the Supabase S3 access key,
create the destination bucket with versioning, fill `supabase/harness/rclone.conf.template`
(five remotes: supa, r2, b2, r2enc, b2enc), and set `RCLONE_CONF` and `SUPABASE_DB_URI` as repository secrets. The
whole rclone config is one secret on purpose — splitting the Supabase keys, the
R2 keys and the crypt password across four makes rotation a four-step job people
do partially.

### How to make the drill produce evidence

A drill that ends in "it seemed to work" is not evidence, and a Storage restore
is the specific case where that is hard to notice: a partial restore looks exactly
like a complete one until somebody opens a profile and finds a broken image.

`storage_manifest_take()` (0226) records every object with its content
fingerprint. The sequence that produces a defensible row above is:

1. `select public.storage_manifest_take('pre-drill');` — note the returned id.
2. Copy the objects out (this is the part with no automation yet — see §5).
3. Restore database **and** objects into the throwaway project.
4. `select * from public.storage_manifest_summary('<id>');` — `verified = true`
   means every object came back with matching content. `storage_manifest_verify()`
   names the ones that did not.
5. `select * from public.klimr_readiness();` — every boundary check on the
   restored database.
6. Smoke: sign in, open a Queue, open a tournament, load a signed object URL.

Steps 1, 4 and 5 are the ones that turn an impression into an artifact.
