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
| **Storage (avatars, post media)** | **NOT COVERED — no backup exists** | <!-- claim:storage-backup=none --> Supabase's daily backup is the Postgres database only; Storage objects are not in it. A database restore would leave every `media_path`, `avatar_path` and `proof_path` row pointing at bytes that no longer exist. This is KCDX-053 and it is open. Corrected 2026-08-07 — the previous wording asserted backup coverage for this row, which was false and would have caused someone to skip the very backup that is missing. (Phrased without repeating the old sentence: `tests/doc-claims.test.ts` fails on that exact string, and a correction that quotes the error trips its own guard.) |
| **Secrets** | Vercel environment variables | **Not in any backup.** See §4. |

---

## 2. Targets

These are commitments to hold the drill against, sized for a pre-launch pilot —
not enterprise numbers, and deliberately honest about it.

| Measure | Target | Reasoning |
|---|---|---|
| **RPO** (data we could lose) | **≤ 24 hours — UNVALIDATED** | <!-- claim:drill-run=never --> Daily backups; worst case is a failure just before the next snapshot. **No drill has ever been run**, so this is an inference from the backup schedule, not a measurement. It is also DATABASE-only: Storage has no backup, so the real RPO for objects is unbounded. |
| **RTO** (time to serving again) | **≤ 4 hours — UNVALIDATED** | Restore into a fresh project, repoint env vars, redeploy. Nobody has done this, and the steps below have never been executed end to end. Treat the number as a target to be tested, not a commitment already met (KCDX-053). |
| **RTO for code-only rollback** | **≤ 15 minutes** | Vercel instant rollback to a prior deployment; no data involved. |
| **Degraded-mode target** | **immediate** | Venues fall back to paper (`VENUE-PLAYBOOK.md`, `RUNBOOKS.md`). Open play never depends on Klimr being up. |

**The honest read on RPO:** losing up to a day would mean losing a day of
matches, queue history, posts, and signups. During a pilot that is recoverable —
organizers can re-enter results. After launch it is not acceptable, which is
what makes PITR the first upgrade at scale (§5).

---

## 3. The restore drill — run this, don't assume it

**Run it once now that Pro is active, then again before pilot start, then
quarterly.** Budget about an hour. It touches **no production data**: everything
lands in a throwaway project.

1. **Create a scratch project** in the Supabase dashboard (free tier is fine),
   in the same region. Name it `klimr-restore-drill-<date>`.
2. **Take the most recent production backup** (Supabase → Database → Backups)
   and restore it into the scratch project. Note the **backup's timestamp** —
   the gap between it and "now" is your real observed RPO.
3. **Start a stopwatch when you begin the restore.** Stop it when step 6
   passes. That elapsed time is your real observed RTO; write it in §6.
4. **Verify the schema arrived complete.** In the scratch SQL editor, run
   `supabase/tests/rls_and_invariants_checks.sql`. It ends in a ROLLBACK, so it
   is safe, and it fails loudly if any reachable table lost its RLS.
5. **Spot-check the data** with counts you can sanity-check against production:
   `select count(*) from profiles;`, `select max(created_at) from court_sessions;`,
   `select max(snap_date) from rank_snapshots;`
6. **Prove the app runs against it.** Locally, point `.env.local` at the scratch
   project's URL and keys, `npm run build && npm start`, then: sign in, open a
   queue session, and load a tournament page. If those three work, the restore
   is real.
7. **Delete the scratch project.** Leaving it running costs money and creates a
   second copy of member data — which is a privacy liability, not just an
   expense.

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
2. **An off-Supabase backup copy.** Today every copy lives with one vendor.
   A periodic `pg_dump` to separate storage removes that single point of failure.
3. **Alerting on backup failure.** A backup that silently stopped is the
   classic disaster; today nothing would tell you.
4. **A documented, rehearsed cutover** (DNS + env + redeploy) so RTO stops
   depending on improvisation under pressure.

---

## 6. Drill log

Append one row per drill. Empty is honest — fill the first row when you run it.

| Date | Backup timestamp | Observed RPO | Observed RTO | Schema check | App check | Storage manifest | Notes |
|---|---|---|---|---|---|---|---|
| _(pending — no drill has ever been run)_ | | | | | | | |

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
