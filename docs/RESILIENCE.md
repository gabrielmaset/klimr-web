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
| **Storage (avatars, post media)** | Supabase Storage, covered by the project backup | Media loss is the least damaging category — regenerable by users. |
| **Secrets** | Vercel environment variables | **Not in any backup.** See §4. |

---

## 2. Targets

These are commitments to hold the drill against, sized for a pre-launch pilot —
not enterprise numbers, and deliberately honest about it.

| Measure | Target | Reasoning |
|---|---|---|
| **RPO** (data we could lose) | **≤ 24 hours** | Daily backups. Worst case is a failure just before the next snapshot. |
| **RTO** (time to serving again) | **≤ 4 hours** | Restore into a fresh project, repoint env vars, redeploy. |
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

| Date | Backup timestamp | Observed RPO | Observed RTO | Schema check | App check | Notes |
|---|---|---|---|---|---|---|
| _(pending — first drill due now that Pro is active)_ | | | | | | |
