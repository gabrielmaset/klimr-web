# KLIMR — RESPONSE TO FOLLOW-UP AUDIT 2026-08-17 (KFU-001…035) AND REMEDIATION PLAN
**Prepared:** 2026-08-17 · **Responds to:** `KLIMR_FOLLOW_UP_AUDIT_2026-08-17.md` + `CLAUDE_REMEDIATION_BRIEF.md` · **Supersedes** `AUDIT_STATUS_FOR_EXTERNAL_REVIEW.md` for this cycle.

## 0. Posture

We accept the NO-GO. This audit is high quality: it independently reproduced our green gates, honored every owner decision in the prior baseline (none of the fifteen recorded positions was re-litigated), correctly credited 21 remediations from source, and then found real defects — including **four rows our own register overstated** and **two likely-live production breakages**. We verified its load-bearing claims in source before writing this response; where it is right we say so without qualification. Contested items below are few, narrow, and come with commitments attached.

Register integrity: the KRA register has been amended this date to reopen/downgrade KRA-011, KRA-034, KRA-035, KRA-037 (partial) and KRA-040, citing this audit. Our recorded process failure is also named: **replay-level proof is structurally blind to deployed-scheduler, bundle-composition, and browser classes** — the exact P-class this audit's evidence model formalizes. We are adopting that class into our own gates (see WP-G).

## 1. Immediate concessions — likely live in production today

| ID | What we verified | Consequence |
|---|---|---|
| **KFU-002** | `vercel.json` schedules only tournament finalization; 0232 re-used the single `waitlist-sweep` pg_cron name for the SQL sweep, leaving `/api/cron/waitlist-sweep` — sole orchestrator of storage-deletion draining, health-watch, venue jobs, perf pruning, and waitlist emails — with **no driver**. The health watcher that would alert on this was on the same dead route. | Deletion outbox undrained, canaries dark, promoted members unnotified, since 0232's paste. **Hotfix 0276** (restore a second, separately-named heartbeat schedule) is first in queue, plus a new source-shape guardrail: every cron route must have a declared driver, asserted in vitest. |
| **KFU-005** | 0245's `freeze_submitted_application` trigger calls `provider_application_hash` during member writes; 0239's sweep left that helper without an authenticated grant. Inner calls under an INVOKER trigger check the caller's privileges — the same rule this codebase already proved once. | Provider applications likely fail for members in production. **Hotfix 0277** after an executed-local reproduction (insert as `authenticated` on head), then the audit's suggested catalog-driven invoker-trigger test under every real role. |

## 2. Concessions — real defects, ours to fix (with source confirmation where checked)

**KFU-007 / KFU-029 (safety, P1).** Confirmed pattern: `safety-escalation.ts` and `media-safety.ts` ignore resolved Supabase error objects (the exact "supabase-js does not throw" footgun our own rules name), and `containsCSAE` is defined but **uncalled** — an AI-classified CSAE verdict deletes without preservation or escalation. Both violate the design intent of our own D-36/D-37 record. Fix in WP-S: typed preservation results checked at every step, delete-only-after-durable, CSAE verdicts routed through the existing quarantine/incident seam, fault-injection proofs.

**KFU-013 (P1).** Confirmed in our own code and our own migration comment: 0275 freezes *status transitions* but explicitly permits non-status edits, and `recordResult` accepts `status === "completed"` and rewrites score/winner. Fix in WP-I: completed/declined/cancelled rows become fully immutable at the trigger; corrections move to an explicit authorized command with append-only before/after evidence.

**KFU-028 (P1).** Confirmed: `accountActive()` returns *active* on a missing row or swallowed error, member-write policies validate ownership not status, and suspension does not revoke sessions. Fix in WP-B: fail-closed guard immediately (hotfix-adjacent), a canonical active-status invariant at the database write boundary, and `auth.admin.signOut` in the moderation flow.

**KFU-011 / KFU-012 (P1).** KFU-011 confirmed by our own register ("approval/placement split writes" predates 0267, which fixed placement idempotency only). KFU-012's specific claims (v_taken+1 reservation before roster insert; ON CONFLICT DO NOTHING filtering; stale precheck driving notifications) match the cited lines and will be executed-verified first in WP-I, then closed as one locked command with exact-reject semantics per the brief's rule 7.

**KFU-014 (P1 privacy).** Confirmed: `toFixed(5)` coordinates into a GET URL. Fix in WP-U: precise fix stays ephemeral (memory/sessionStorage), URL carries at most a coarse token; HAR/history proof in the closure packet.

**KFU-015 (P1 perf, independently reproduced by the auditor).** Confirmed import chain: client-imported `lib/marketplace.ts` → `lib/us-places.ts` → the full `zipcodes` dataset (~4.65 MB chunk). Fix in WP-U: split client-safe constants, `import "server-only"` on the ZIP module, and replace the inert CI bundle scraper with `route-bundle-stats.json` parsing plus enforced budgets. This alone should return four routes from ~5.57 MB to baseline.

**KFU-003 / KFU-004 / KFU-006 / KFU-030 (P1).** Accepted as scoped: AAL2 enforced at the sensitive-command boundary (inventory first — the audit is right that middleware is not the trusted boundary); the base-profile block gap closed at the table boundary with a caller-bound predicate (perf measured before/after); erasure semantics defined per FK and object class with a seeded whole-footprint fixture; DSAR coverage generated from a versioned inventory with `query_integrity` split from `coverage_status`. All WP-B.

**KFU-009 / KFU-010** were already OPEN in our register (the audit and our record agree); they move from "tracked" to scheduled: WP-I.

**KFU-016 / KFU-017(part) / KFU-018 / KFU-021 / KFU-022 / KFU-023 / KFU-024 / KFU-026 / KFU-032 / KFU-034 / KFU-035.** Accepted. Notables we verified: `callExternal` indeed treats resolved 429/5xx as success; the maps overall AbortController signal is indeed never passed to hops; `.env.example`/SECURITY.md/RESILIENCE.md contain the stale sentences cited; journal checksums are null for 0262–0275 — going forward every delivered paste carries a computed SHA-256 into `journal_migration`, and a per-release manifest binds file digests to the artifact (WP-R).

## 3. Contested or contextualized — for the revised audit's consideration

These are the only items where we ask the auditor to revise treatment, and each comes with a commitment, not just a disagreement.

**KFU-031 (policy-derived grants).** *Partial contest.* The derivation itself is not a weakness to remove: the executed baseline in our register shows anon-readable public pages **die** without EXECUTE on their policy-referenced functions, and the reconciler/sentinel now share one catalog definition precisely so they cannot drift. What we accept from this finding: (a) policy necessity does not make a helper safe as a *direct* RPC with arbitrary arguments — we will sweep every policy-referenced function that takes identity parameters and add in-body caller binding (the `is_blocked_pair` pattern already in this codebase), with a planted-oracle negative control; (b) the rpc-grants probe will validate **exact signature + role + intended audience**, not name-level callability. Commitment lands in WP-B. We ask the finding be re-scored against that design rather than as "derive grants differently."

**KFU-033 (adult gate accepts null DOB).** *Framing contest, substance accepted.* 0271 was documented from birth as the reject-known-minor **belt**, third layer behind a client check and a server action that requires a birth date — it was never claimed as the admission gate, and the register says so. The audit's substantive point stands for direct data-plane clients, and we fold it into KFU-028's machinery: the canonical active-member invariant will require a present, adult birth date (server-set attested state), closing the null path at the same boundary. We ask this be tracked as a scoped extension of KFU-028 rather than a mischaracterized control.

**KFU-017, text-field portion.** *Narrow contest.* The `outline: none` on text inputs is deliberate and documented in the stylesheet: fields carry a border/background focus treatment plus a focus-within ring on the wrapper; the doubled outline overflowed styled containers. What the audit correctly caught is that **radios, checkboxes, and ranges** fall under the same selector with no equivalent replacement — that is a real gap and we will scope the suppression to text-like inputs only. The dialog rollout, marker semantics, and lint-ratchet items are accepted as written.

**KFU-019 (AdSense).** *Context.* The script loads only when `NEXT_PUBLIC_ADSENSE_CLIENT` is set; it is not set, the enforced CSP blocks the host, and no launch plan includes ads. We accept the audit's own conditional scoring (disabled ⇒ P2), will keep the flag unset, and will adopt the consent/scoping/CSP redesign as a precondition in the register before it is ever enabled.

**Evidence-class items (KFU-020 and every P-marked closure).** *Not a contest — a proposal.* The audit correctly refuses to upgrade our recorded replay results. Two mechanisms make them independently executable next cycle: (1) **CI as third-party execution** — the `schema-replay` job runs the full 275-migration, real-role, all-suite harness on GitHub-hosted runners on every push; run logs are inspectable evidence the auditor did not author and we cannot edit. (2) The repository ships the complete harness (`supabase/harness/replay.sh` + shim + suites) runnable against any disposable PostgreSQL 16; we will add a one-command containerized runner so the next audit can execute Gate B item 1 itself. Restore drill (KFU-020) is accepted as a hard go-live gate and is scheduled below with a throwaway-project procedure.

## 4. Remediation plan

Sequenced per the brief's rules (one P0/P1 package at a time, no feature work mixed in, closure packets in the brief's format, statuses only with suffixes). "Session" = one focused engineering session with full gates.

| Pkg | Contents (KFU) | Depends | Est. | Evidence class produced |
|---|---|---|---|---|
| **WP-H Hotfixes** | 002 heartbeat restoration + driver guardrail; 005 hash-ACL repair (executed repro first); 028 fail-closed guard (app layer); 013 completed-row freeze; 014 coords out of URLs; 015 server-only ZIP split + real bundle CI; 021 response classification; 026 doc corrections | — | 2 | Executed-local + S; deployed-schedule proof after next deploy |
| **WP-1 Courtside** | 001 (organizer-issued one-time enrollment challenge, hash-stored, scoped, replay-proof) | **OD-1 owner decision** on the organizer enrollment UX | 1–2 | Executed-local full negative matrix; browser/API proof at staging |
| **WP-B Boundaries** | 003 AAL2-at-command inventory+enforcement; 004 base-profile block predicate; 028 DB invariant + session revocation + adult-attested state (033); 006 erasure semantics; 030 DSAR inventory; 031 caller-binding sweep + exact-signature probe | WP-H | 3–4 | Executed-local real-role matrix incl. AAL1/AAL2/suspended |
| **WP-S Safety** | 007 typed preservation; 029 CSAE escalation wiring; 008 attestation binding + remaining surfaces + video gate; 009 payment-proof digest in-command | WP-H | 2–3 | Fault-injection suite; adapter-live proof at staging |
| **WP-I Integrity** | 010 meetup state machine; 011 atomic approval; 012 exact-reject roster+capacity; 013 correction command; KCDX-046 locked reconfiguration | WP-H | 2–3 | Concurrency barriers + direct-PostgREST negatives |
| **WP-U UX/Perf** | 016 croppers; 017 radios/markers/dialog rollout + lint ratchets; 018 CSS-first rails; 022 intent-lazy maps + derivatives; 023 loading/tables/live-errors subset | WP-H | 2–3 | S + owner-run device checklist (script provided); browser matrix at staging |
| **WP-R Release eng** | 025 CSP enforce + dev-dep highs + lint align + Actions digest-pin + SBOM/provenance; 034 checksum manifest + journaled digests; 035 awaited audit fallback; 020 restore drill; 024 RUM p75/CLS units | WP-H | 2–3 + owner ~1h | Restore log + manifest reconciliation; pipeline artifacts |
| **WP-T Tail** | 027 register items with owners/dates (already tracked); 032 unified deadline | — | 1 | S/Executed-local |
| **WP-G Gates upgrade** | Adopt the P-class permanently: scheduler-inventory guardrail, route-bundle budget, invoker-trigger role matrix, planted-oracle control, per-release SHA-256 manifest of the zip so audits examine an immutable artifact | WP-H | folded | — |

**Owner inputs required:** OD-1 (Courtside enrollment UX) before WP-1; a throwaway Supabase project (free tier) for the restore drill and staging-class proofs; ~1 hour on the device checklist for WP-U evidence; keep `NEXT_PUBLIC_ADSENSE_CLIENT` unset.

**Estimated to Gate A:** WP-H + WP-1 + WP-B + WP-S + WP-I + the launch-journey slice of WP-U ≈ **10–13 sessions**. Gate B adds WP-R and the staging/browser evidence passes. Each package ends with the brief's eleven-section closure report and its evidence-suffixed statuses; nothing is called fixed bare.

**Re-audit protocol we request:** audit the next tagged artifact only (zip + SHA-256 manifest we will publish per release), receive this document with it, and — if feasible — execute the shipped harness or inspect the CI run for Gate B item 1 rather than holding it at R.

*Register cross-reference: KRA amendments of this date; DESIGN_DECISIONS 2026-08-17 (b). Prepared by Klimr engineering at the owner's direction; independent non-author review of P0/P1 packages to be arranged by the owner per the brief's rule 19.*

---

## v1.1 addendum (2026-08-17, post-reconciliation)

The auditor's reconciliation is adopted in full: all four contests granted as revised; all eight plan corrections accepted (two corrected our own errors — the double-sweep H1 sketch and the signOut API). The corrected package order (WP-0 → C0 → H1 → H2 → H3 → P0 → …) and the 16–24 / 19–30 session planning ranges supersede Section 4's table. Authoritative running record: KRA register entry 2026-08-17 (b).
