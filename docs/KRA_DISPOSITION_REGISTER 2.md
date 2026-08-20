# Klimr — Codex Re-Audit Disposition Register (KRA)

**Audit:** `Klimr_Codex_Post_Remediation_Audit_Package_2026-08-10`
**Source zip the auditor examined:** SHA-256 `7E9974858131C0D44CA58AB38221BC17B483B1C0D49B0EBBC29F91CB2767D3EF`
**Auditor decision:** NO-GO · **42 unique findings** (2 P0 · 33 P1 · 7 P2) reconciled against the 68 original KCDX.
**Auditor's own caveat (verbatim):** *"Static proof is not production proof. No production systems were contacted."*

---

## What this document is

This is the **authoritative running record of every decision** taken on the 42 findings of the
2026-08-10 re-audit. It exists so that:

1. Work is tracked to completion with real evidence, not marked done from a green build.
2. Anything we **decide not to fix**, or **disagree with**, is recorded here **with proof**, so a
   future ChatGPT audit that re-flags it can be answered from this file instead of re-litigated.
3. The distinction between *fixed*, *fixed-and-verified*, *deferred-with-reason*, and *disputed* is
   never lost between sessions.

**A disposition is only "owner-accepted" when Gabriel states it.** Claude proposes; the owner
decides. Every DISPUTED or DEFER row below is a *proposal to the owner* until he signs it, at which
point the row is stamped with the date and his confirmation.

### Disposition vocabulary

| Disposition | Meaning |
|---|---|
| `OPEN` | Confirmed real, not yet started. |
| `IN PROGRESS` | Being worked this session/batch. |
| `FIXED — STATIC` | Code written, `tsc`/`lint`/`vitest` green locally. **Not** proven at the DB/production boundary. |
| `FIXED — VERIFIED` | Acceptance test passes at the required evidence level (real Postgres roles / staging / production). |
| `DEFER — OWNER` | Owner has accepted deferring to a named milestone (e.g. post-launch), reason recorded. |
| `DISPUTED` | We believe the finding is wrong, stale, or N/A for Klimr. Proof recorded; awaiting owner sign-off. |
| `OWNER-ACCEPTED RISK` | Owner has read the residual risk and accepted it as-is. Reason + date recorded. |

### Evidence labels (per CLAUDE.md)

`Static` (source inspected) · `Executed-local` · `Recorded` (someone else's evidence) · `Staging` ·
`Production`. This register never launders a Static claim into a Production one.

---

## Provenance check (done first, 2026-08-10)

The auditor examined zip `7E99…`. The `klimr-web.zip` in this session hashes differently (three
owner-confirmed doc edits were made earlier today). **Therefore every finding was re-checked against
the actual current repository before being accepted here.** 14 findings were spot-checked in code
during intake; all 14 were confirmed present in the current tree (see per-row "Verified in current
code" notes). The audit is treated as **substantively credible**: its static traces are accurate.
Its *deployment-state* claims (chiefly KRA-012) are partly resolved by the owner's 2026-08-10
confirmation that all migrations through 0234 are applied and the matching code batch is live.

---

## Cross-cutting owner decisions needed

Several findings turn on a **product/policy decision only the owner can make**. These are collected
here so they can be answered once and applied across every dependent finding:

- **OD-1 (Courtside enrollment) — KRA-001:** Should adding a Courtside display require an
  organizer-provisioned one-time secret (never present in player/public state), instead of the
  public join code? Recommended: **yes** — the join code is printed on the display and shared with
  players, so it can never be an operator-enrollment credential.
- **OD-2 (Availability privacy) — KRA-020:** Is "find players free at a specific day/time" a
  **public discovery feature** (documented and accepted), or **private data** that must be reduced to
  a coarse opt-in category? Recommended: **coarse opt-in** — exact weekly grid matching over a named
  person is a schedule-reconstruction oracle.
- **OD-3 (Feed deep-link non-enumeration) — KRA-026:** For a post a viewer may not see, should the
  system reveal *why* (missing vs pending vs rejected vs private), or collapse all denials into one
  indistinguishable "unavailable"? Recommended: **collapse** — any distinguishable answer leaks
  existence, author, and moderation state.
- **OD-4 (Quarantine backup policy) — KRA-018:** Are quarantined (suspected-CSAM) bytes copied to the
  encrypted backup destinations, or never copied? The doc says never; the script copies them. Legal
  review required. This is D-22 territory ("a conversation with a lawyer, not a script edit").
- **OD-5 (Legal-name / gender visibility) — KRA-010:** Confirm `first_name`, `last_name`, `gender`
  are owner-only + verification/admin, never member-to-member. D-16 already says legal name is never
  public; this extends it to the base-table grant and to `gender`.

---

## The 42 findings

Severity, effort, KCDX lineage, and one-line disposition. Full evidence and the fix plan are in the
companion roadmap section below. `GB` = auditor marked it a go-blocker.

| KRA | Sev | Eff | KCDX | GB | Subsystem | Disposition | One-line |
|---|---|---|---|---|---|---|---|
| KRA-001 | P0 | S | 007 | ● | Queue/Courtside authz | **REOPENED 2026-08-11 — reverted after a production incident** | 0235: enrollment consumes a one-time organizer-issued secret; join and display codes register nothing. Acceptance 11/11 on a full 235-migration replay (both exploits, replay, expiry, revocation-sticks, member-read-denied). Guardrail + negative control. **Production-unverified.** |
| KRA-002 | P0 | S | 008 | ● | Queue SSR privacy | **FIXED — Executed-local** | `lib/queue-audience.ts` loads+projects in one operation; all 5 call sites converted (4 were leaking). Guardrail forbids any other importer of `loadSessionState`; negative control observed failing. **Browser/RSC-payload proof owed (B-03).** |
| KRA-003 | P1 | S | 016 | ● | DB privileges | **FIXED — Executed-local** | 0239 sweeps every public function: revokes PUBLIC/anon, re-applies only EXPLICIT grants read from the catalog, and sets default privileges so future functions inherit the rule. `feed_emit`/`prune_feed_items` denied to members. Acceptance: anon executable = 0, implicit-authenticated = 0, **168 explicit grants preserved** (no over-revoke). Confirmed live twice independently during this batch. |
| KRA-004 | P1 | M | 011,015 | ● | Professional review | **FIXED — Executed-local** | 0245 REPLACES `provider_application_hash` in place (not a parallel function) to cover `document_path`, `phone`, `attestations`, and widens the freeze to the same set. Pending rows rebound. Acceptance: swapping the document moves the hash; the applicant cannot swap while pending; stored hash never disagrees with contents. |
| KRA-005 | P1 | M | 006,014,015,034 | ● | Media safety | **PARTIAL — Feed path fixed, Executed-local** | `lib/media-safety.ts` is the seam: download, size bound, magic-sniff, SHA-256, `scanForKnownCSAM`, escalate-on-match via the existing `escalateCSAE`. Wired into the Feed photo path BEFORE the classifier. Match → preserved + escalated + never publishes; unavailable scan → `pending` (held, not destroyed, not published). **Still owed: avatars, listings, credential/business/payment evidence paths.** |
| KRA-006 | P1 | M | 003,015 | ● | Tournament payments | **PARTIAL — object bound, digest owed** | 0245 adds `verify_payment_proof_object()`: the object must exist in `tournament-payments`, sit under the registration-id prefix, and be owned by the uploader. Acceptance proves allow + three denials (foreign owner, nonexistent, wrong prefix). **Still owed: wiring it into `tournament_submit_payment_proof` and a byte digest to bind post-submit replacement.** |
| KRA-007 | P1 | M | 012 | ● | Marketplace meetups | OPEN | `listing_meetups` still has member DML with no WITH CHECK freezing listing/offer/buyer/transitions. 0204 fixed offers only. **Verified** (0101 policies intact). |
| KRA-008 | P1 | M | 028,032 | ● | Privacy enforcement | **FIXED — Executed-local** | 0238 wires the ladder into DM insert, tagging, commenting (RLS via `can_i_act_on`), and invites + connection requests (definer via `may_act_on`); comment reads apply mute/restrict via `can_i_see_comment`. Two inline `blocks` copies deleted. Acceptance proves BOTH deny and allow. **Found a live bug:** DMs were unrepresentable since 0110 — fixed. |
| KRA-009 | P1 | M | 028,032 | ● | Privacy oracles | **FIXED — Executed-local** | 0237 revokes the six raw pair predicates from PUBLIC/anon/authenticated and adds `can_i_*` wrappers that bind the actor to `auth.uid()`. `is_blocked_pair` keeps its grant (measured: revoking it breaks the posts policy) and gains an in-body caller guard. Acceptance: all six closed to a stranger, own-pair and service paths intact, ladder defaults verified. |
| KRA-010 | P1 | S | 001,026,028 | ● | Legal names / blocking | **FIXED — Executed-local** | 0236 revokes `first_name`/`last_name` from the member column grant; **`gender` kept public per OD-5** and added to `profiles_public` so the two surfaces agree. Projection is now block-aware both directions. Acceptance 11/11 with a non-zero baseline (A saw B before the block, 0 after). |
| KRA-011 | P1 | S | 035 | ● | Storage deletion | **FIXED — Executed-local** | 0243 outbox + 0244 claim/mark commands + `lib/storage-deletions.ts` draining on the existing every-minute tick (no new schedule to be silently broken). Completion written ONLY after the Storage API confirms. Two canaries: `_stuck()` (waiting) and `_abandoned()` (gave up) kept separate so neither hides in the other. |
| KRA-012 | P1 | M | 004,052,058 | ● | Deploy/readiness proof | **ADDRESSED — static gates + control; SQL replay NOT run** | 0262 adds `migration_journal`: every migration from 0262 records itself, `journal_drift()` reports BOTH directions (a file never applied, and a migration applied that no file explains), and a build-failing test catches any new migration that forgets to journal. **The pre-journal history (0001–0261) is recorded as an explicit owner-confirmation baseline marked ASSERTED, not observed** — a journal cannot retroactively prove what happened before it existed, and pretending otherwise would be the exact failure this finding names. Migration not replayed. |
| KRA-013 | P1 | M | 044 | ● | Waitlist sweep | OPEN | `sweep_waitlists()` hard-codes 30-min offers (app uses 20/60/240), and promotes with **no notification/outbox** in-transaction; the email route is now unscheduled. **Verified** (0232:73, no outbox). |
| KRA-014 | P1 | S | 056 | ● | External I/O deadlines | **FIXED — Executed-local** | All three wrapped in `callExternal` with per-site budgets (Anthropic 20s/1, Places 6s/1, NCMEC 10s/**0** — a duplicated legal report is its own problem). The tripwire's two false-negative mechanisms fixed; **it immediately found a fourth undefended fetch** the old one could not see. |
| KRA-015 | P1 | S | 017 | ● | MFA/CAPTCHA fail-open | **FIXED — Executed-local** | Three states, indeterminate never allows. CAPTCHA denies on missing secret and on vendor error, with an explicit non-production `CAPTCHA_DEV_BYPASS`. AAL: unsatisfied and indeterminate take the same branch (/mfa, not 403 for navigations) — fail-closed without a lockout. **Deployment note below.** |
| KRA-016 | P1 | M | 057 | ● | Account export | **FIXED — Executed-local** | `format_version: 3`. Every one of 21 datasets is individually named and error-checked; the archive carries `status` + `incomplete_datasets` instead of silently returning an empty category. `reports_i_filed` now reads `post_reports`/`reports` by `reporter_id`; the incidents it used to mislabel move to `incidents_about_my_uploads`. DATA-GOVERNANCE and its bound doc-claim moved to v3 in the same change. |
| KRA-017 | P1 | M | 054 | ● | Privileged audit | **PARTIAL — false success removed, breadth owed** | 0246 adds an `issued` outcome; the client handout no longer writes `ok` before the operation runs. `privileged_started_unfinished()` counts only `started`, so the incident signal is not buried by routine handouts (proven: 50 issued rows do not move it). **Still owed: narrowing the 88 raw callers to transactionally-audited domain commands** — per-domain work, 0193 is the pattern. |
| KRA-018 | P1 | M | 053 | ● | Storage backup DR | **PARTIAL — contradictions closed, drill owed** | Quarantine copying removed (D-22 as amended) so script and docs agree. Verification extended to **every** destination class and to `rclone check` checksums for the plain buckets — counting cannot tell "the file came back" from "a file with that name came back". **Still owed and unchanged: no run history, no alerting, and NO RESTORE DRILL — blockers B-01/B-02 stand.** |
| KRA-019 | P1 | M | 034 | ● | Feed report exfiltration | **FIXED — Executed-local** | 0242 gates on `post_visible` under the real caller, before the rate limit and before the snapshot, returning the same `not_found` as a missing post (OD-3). Acceptance proves both: a public post IS captured (canary present), a friends-only post is not (canary absent from every report row). |
| KRA-020 | P1 | M | 023 | ● | AI availability oracle | **FIXED (per OD-2) — Executed-local** | `players_open_to_requests()` applies the ladder as the caller, replacing the `open_to_invites` filter; and a name filter combined with a time grid is refused (the name is dropped when a window is given), because the COMBINATION is the extraction primitive. Residual recorded below. |
| KRA-021 | P1 | M | 031 | ● | Notification exactly-once | **FIXED — Executed-local** | Three inline `createNotification` calls removed from `app/network/actions.ts`. 0212's trigger already enqueues `connection_requested`/`connection_accepted` and `deliver_social_outbox()` writes the identical row — same kind, title, body and link. The outbox is the durable path (in-transaction, retried), so the inline call is the one that goes. Guardrail + negative control. |
| KRA-022 | P1 | S | 020 | ● | Business search | **FIXED — Executed-local** | `business` added to the href map (`/business/[id]`, a route that already existed), to `SearchResultType`, and to every exhaustive icon/label Record — the compiler named all four surfaces. NOT folded into `class`: the classes page does not accept a business id. |
| KRA-023 | P1 | M | 020,022,023 | ● | Browse/temporal search | **FIXED — Executed-local** | `browse_kind()` (0249) covers event, tournament, court, team, listing and business, and event browse now consults `event_occurrences` so a recurring series is ordered by its NEXT instance. SECURITY INVOKER — it chooses the kind, RLS still chooses the rows. Acceptance proves courts and teams return rows under a real authenticated caller. |
| KRA-024 | P1 | S | 021 | ● | AI result routing | **FIXED — Executed-local** | Both card kinds now link `/profile/<userId>`. `/play/[id]` is the match page and queries `matches.id`, so every AI person result had been a dead destination. |
| KRA-025 | P2 | S | 038 | | Feed deep link render | **FIXED — Executed-local** | A resolvable post is prepended to the ranked id set, so it is fetched through the SAME caller-RLS read as everything else and deduped if also ranked. 0228 resolved the link and then never showed it, leaving the original failure (an allowed post outside the top-60 window) untouched. |
| KRA-026 | P2 | S | 038 | | Deep-link enumeration | **FIXED (per OD-3) — Executed-local** | 0247: absent, private, pending, rejected and blocked all return `unavailable` with **no author id**. Author-first, so a member always reaches their own post (incl. `pending_review`). Acceptance proves all four refusals indistinguishable plus the allow path. |
| KRA-027 | P1 | M | 026,029 | ● | PYMK privacy/fail-open | **FIXED — static gates + controls; SQL replay NOT run** | 0261 removes `neighborhood` from the return type (not merely from the card) and adds the OD-2 ladder check so a Connect button is never offered to someone who would refuse it. Both fail-open cache paths closed: an unavailable validator now recomputes, and an RPC failure returns an EMPTY rail rather than a stale unvalidated payload. **The migration has not been replayed** — harness unavailable. |
| KRA-028 | P2 | S | 036 | | Feed aggregate contract | **FIXED — Executed-local** | 0248: `eng_comments` filters `moderation_status = 'approved'`, matching what the Feed displays. Ranking had been rewarding moderation traffic — a post attracting forty removed comments outranked one attracting five real ones. Both aggregates asserted INVOKER by sentinel. |
| KRA-029 | P2 | S | 033,063 | | Feed Nearby/counts | **FIXED — Executed-local** | Counts from `feed_type_counts()` over the pre-cap candidate set. Nearby is real: OD-7 resolved — a post's origin is the AUTHOR'S ZIP centroid, stamped at write time into the server-only `post_origins`, reached by the INVOKER ranker through `posts_within()` which returns ids and never a coordinate. Radius clamped to [25, 250] miles. |
| KRA-030 | P2 | S | 035 | | Shared media path | **FIXED — Executed-local** | `delete_post_media` enqueues only when no other post references the path, and never for preserved safety evidence. Acceptance proves both: sharing → 0 enqueued, last reference → 1 enqueued. |
| KRA-031 | P1 | M | 064 | ● | RUM abuse | **FIXED — Executed-local** | Fail-closed per-IP limit in the route + `rum_ingest()` daily row budget in the database, which **counts** its drops. Raw privileged insert removed. Acceptance: 3 accepted at cap 3, 4th `over_budget`, dropped counter incremented, members denied. |
| KRA-032 | P1 | S | 042 | ● | Queue expiry clock | **FIXED — Executed-local** | 0251 sweeps on `greatest(activated_at, created_at)`. Acceptance proves both directions on the SAME session: activated 5 min ago survives; the same row re-activated 20 h ago is swept. |
| KRA-033 | P1 | M | 013 | ● | Class enrollment | **FIXED — Executed-local, race reproduced and closed** | 0256 + 0257: `class_enroll()` counts seats under a lock on the session and never recomputes a recorded payment. **Root cause was a collision:** 0201's anti-tampering trigger pinned `enrolled/not_required` for any non-provider caller, silently discarding the command's waitlist verdict. Resolved with a transaction-local flag, NOT a blanket definer bypass. Verified: capacity 1 → **SEATS=1 WAITLIST=1**; paid class → `pending`; a learner inserting `attended/paid` directly is **still pinned**. |
| KRA-034 | P1 | M | 045 | ● | Tournament capacity | **FIXED — Executed-local** | 0258: the command now reads `capacity_mode` and `capacity_unit` from `format_config` — the same configuration `capacityBlock()` reads — and counts non-reserve PLAYERS in person mode, registrations in team mode, scoped per-division only when the mode says so. Acceptance verifies both modes in both directions. |
| KRA-035 | P1 | M | 045 | ● | Team tourney roster | **FIXED — Executed-local** | 0259: `tournament_register_team()` takes the roster as an argument and writes it in the SAME transaction, delegating every check to `tournament_register`. Adds the missing `UNIQUE(registration_id, user_id)` (with de-dup first) and re-checks each listed player is really a member of the entered team. Acceptance: captain appears **once**, a stranger is **rejected**, reserve flag preserved, duplicate insert refused by the index. |
| KRA-036 | P1 | M | 041 | ● | Queue match start | **FIXED — Executed-local, race run** | 0260 `queue_start_next()` locks the session, orders candidates in SQL, and writes the match with both team updates in ONE transaction. Two concurrent operators, precondition printed `queued=4 live=0` → **LIVE=1, PLAYING=2, STILL_QUEUED=2, CONSISTENT=yes**. Negative control simulating the old split-write shape gives `CONSISTENT=NO`, so the assertion detects the real defect. |
| KRA-037 | P1 | M | 040 | ● | Queue placement idem. | OPEN | Idempotency key is display-name derived (no lifecycle epoch); full-team join and approval/placement split writes. **Verified** (queue/actions.ts:348-421,883-921). |
| KRA-038 | P1 | S | 050 | ● | Ranking race | **FIXED — Executed-local, race reproduced** | 0251 takes `pg_advisory_xact_lock` on (player, sport) BEFORE the read. **Negative control reproduced the bug**: without the lock, two concurrent finishers leave 2 ledger rows and a stored total of **50 instead of 100** — points lost silently, no error. With it, 100. |
| KRA-039 | P1 | S | 048 | ● | Team ownership race | **FIXED — Executed-local** | 0255 adds a TRIGGER invariant (a team can never lose its last owner, by any path) plus `team_remove_member()` — one locked command, authorization re-derived under the caller, and a `role <> 'owner'` predicate on the delete itself so a stale read cannot widen it. Acceptance verifies delete/demote refused, a second owner makes both legal, peer-manager forbidden, owner `transfer_first`, member removed. |
| KRA-040 | P2 | M | 064 | | Health canary export | **FIXED — Executed-local** | Worse than reported: `klimr_health()` named two tables that DO NOT EXIST and threw on every call since 0227 — the canaries had never run, not merely gone unwatched. 0253 repaired it; 0254 + `lib/health-watch.ts` record state on the existing every-minute tick and alert on TRANSITIONS only. Acceptance proves fire-once, age-preservation, recovery announcement, and member denial. |
| KRA-041 | P2 | S | 052,056 | | Readiness deadline | **FIXED — Executed-local** | Both boot probes race an 8s deadline. A blackholed endpoint accepts the connection and never answers — no error to catch, no timeout to hit — so the instance never finished booting and never said why. Timer cleared in `finally`, or the pending timer holds the event loop open and delays the startup being protected. |
| KRA-042 | P1 | S | 051 | ● | Dependency advisories | **FIXED — Executed-local** | next 16.2.7 → **16.2.12** (exact pin); overrides postcss ^8.5.26, sharp ^0.35.3, nanoid ^3.3.18. **`npm audit --omit=dev`: 4 high → 0 vulnerabilities.** Full production build clean: compiled 92s, 88/88 static pages, 164 routes, 0 type/compile errors. Release gate added with negative control. |

---

## Decisions log (append-only)

Every entry: date · finding(s) · decision · who · proof. Newest at the bottom.

### 2026-08-10 — Intake, provenance, and status reconciliation
- Verified the audit package against its manifest hashes (all 12 artifacts match; only the manifest
  file itself isn't self-referential). `Executed-local`.
- Established the source-zip mismatch and re-checked 14 findings against the current tree; all 14
  confirmed present. Audit accepted as substantively credible. `Static`, `Executed-local`.
- **KRA-012 partial pre-resolution.** Two of its sub-claims were already false in the current tree
  because of edits made earlier today: the migrations ledger now runs through 0234 (not 0230), and
  `AUDIT_REMEDIATION_STATUS.md` no longer says KCDX-032 "awaits 0233/0234 paste" — that row was
  corrected in this same session to reflect the owner's deployment confirmation and the newly-found
  enforcement gap. The deeper KRA-012 point (no machine-generated proof of the exact applied
  head + checksums) remains OPEN. `Executed-local`.
- Recorded the five cross-cutting owner decisions (OD-1…OD-5) that gate KRA-001, 010, 018, 020, 026.

### 2026-08-10 — Owner decisions OD-1…OD-5 (Gabriel, this session)

| OD | Decision (owner's words, condensed) | Applies to |
|---|---|---|
| **OD-1** | **Yes** — Courtside display enrollment requires an organizer-provisioned one-time secret. The public join code must never mint an operator capability. | KRA-001 |
| **OD-2** | **Availability discovery follows each member's own privacy settings.** If a member accepts public requests, or creates a public match meeting those requirements, they appear in availability search. Not a blanket privileged read, and not a blanket suppression — the ladder decides. | KRA-020 (and binds it to KRA-008) |
| **OD-3** | **Collapse** all "why is this unavailable" answers into one. And where the post is hidden because of a **block or restriction, it must not appear at all** — no card, no note, no explanation. | KRA-026, KRA-025 |
| **OD-4** | Quarantined content **is** copied, **clearly marked and separated for review**. Origin must be **completely traceable to the posting member** — IP address, dates, and any other identifying information obtainable. | KRA-018 (+ new provenance capture work) |
| **OD-5** | Legal name (`first_name`/`last_name`) owner-only — **confirmed**. **`gender` stays public** and remains in the member-readable column grant. | KRA-010 |

**OD-4 carries an open conflict with recorded decision D-22 — flagged to the owner, not encoded.**
D-22 states: *"Confirmed CSAM is never copied off-provider. False positives and pending reviews are
backed up encrypted. Confirmed matches are preserved in place under legal hold."* OD-4 as written is
consistent with D-22 for the **pending/unconfirmed quarantine** class (which D-22 already backs up
encrypted). It would **contradict** D-22 if applied to **confirmed** matches, and copying confirmed
CSAM off-provider is a legal exposure in its own right, not merely a policy preference. Claude has
therefore implemented nothing here and asks the owner to confirm the split:
- pending/unconfirmed quarantine → copied, marked, separated, fully traceable (OD-4 as stated);
- confirmed matches → remain preserved in place under legal hold, never copied (D-22 unchanged).

The provenance half of OD-4 (IP, timestamps, uploader identity) is standard and required for
CyberTipline reporting, and is **not** in conflict with anything. It does require capturing uploader
IP at upload time, which Klimr does not currently do — recorded as new work under KRA-018.



### 2026-08-10 — OD-4 legal research (statutory, not legal advice)

Researched because OD-4 (copy quarantine to backup) collides with D-22 (never copy confirmed
CSAM off-provider). **Claude is not a lawyer. This is a reading of the statute and must be
confirmed by counsel before it is built.** Sources are federal statute text and law-firm summaries;
no production system was contacted and no privileged advice was obtained.

**What the law requires (18 U.S.C. § 2258A(h), as amended by the REPORT Act, Pub. L. 118–59, 2024):**

- A completed CyberTipline submission is treated as a **preservation request**. Contents — plus
  "commingled" material that gives context — must be preserved for **1 year** (raised from 90 days
  by the REPORT Act). A provider **may** voluntarily preserve longer to reduce proliferation.
- **§ 2258A(h)(4) "Protection of preserved materials":** the provider must keep the material in a
  **secure location** and **limit access by its own agents and employees** to what is necessary to
  comply. The statutory instruction is to *narrow* exposure, not to replicate it.
- **§ 2258A(h)(6) "Method of preservation":** storage must be consistent with the current **NIST
  Cybersecurity Framework**.
- **§ 2258A(b)** requires the report itself to carry identifying and technical data about the
  involved individual — IP address, timestamps, and similar. So OD-4's provenance requirement is not
  merely permitted; it is what makes a report complete.
- **§ 2258B** gives providers limited civil/criminal immunity for **reporting, storage and handling**
  performed under these duties — but it is expressly **disapplied for intentional misconduct and for
  reckless or grossly negligent acts**.

**Why "copy it to R2 and B2" is the risky half.** The § 2258B shield attaches to *performing the
preservation duty*. Routine disaster-recovery replication to two commercial storage vendors that are
neither NCMEC-designated nor contractually on notice is not obviously that, and it cuts against
(h)(4)'s instruction to limit access. Two independent signals that this is unsettled rather than
merely cautious:

1. The REPORT Act had to create a **specific liability carve-out for vendors NCMEC retains** to
   store/transfer this material — which would be unnecessary if ordinary third-party storage were
   already safe.
2. The **Safe Cloud Storage Act** (S. — introduced Oct 2025; House companion Mar 2026) exists to
   extend those protections to *other* law-enforcement-approved vendors, and requires NIST
   compliance plus DOJ notification within 30 days of contracting. **It is a pending bill, not law.**
   Congress is legislating precisely the gap Klimr would be stepping into.

Commercial object-storage acceptable-use terms also generally prohibit storing this material, so a
copy could breach the vendor contract independently of the statute.

**Recommendation to the owner — a correction to BOTH OD-4 and D-22:**

| Class | Recommended handling | Why |
|---|---|---|
| **Confirmed** match | Preserved **in place** on the primary provider, ≥1 year, legal hold, segregated bucket, access limited to named individuals, NIST-CSF aligned. **Never copied off-provider.** | D-22 as written. Matches (h)(4) and stays inside the § 2258B shield. |
| **Pending / unconfirmed** quarantine | **Also not copied off-provider.** Segregate and encrypt in place instead. | This is the correction. D-22 currently says pending reviews are backed up encrypted — but material that is *later confirmed* was replicated to two vendors before anyone knew what it was. "Unconfirmed" is a statement about our knowledge, not about the bytes. |
| **Provenance record** (uploader id, IP, timestamps, content hashes, decision log, report ids) | **Fully backed up, replicated, marked and separated for review — exactly as OD-4 asks.** | It is metadata, not depiction. It carries no § 2252A exposure, and § 2258A(b) needs it for a complete report. It is also the part that is genuinely lost in a disaster. |

This preserves everything OD-4 was actually reaching for — traceability, separation, reviewability —
while keeping the depictions themselves inside one custodian. The engineering consequence is that
KRA-018's Storage-backup work must **exclude** the quarantine buckets from replication and instead
prove in-place durability plus a restore path, and `storage-backup.sh` (which today copies
unconfirmed quarantine objects to both encrypted destinations) must stop doing so.

**Owner decision required.** Nothing has been implemented. Options: (a) adopt the table above,
(b) keep OD-4 as originally stated, or (c) take it to counsel first — recommended regardless, since
Klimr is pre-launch and can be built correctly the first time.

### 2026-08-10 — Batch 1, pass B (part 1): KRA-010 legal names and block-aware profiles

0191 wrote in its own header that legal names were being left readable "deliberately". 0233 then
documented them as private and dropped them from `profiles_public` — but never revoked the base-table
column grant 0191 had issued. Documentation said one thing, `grant select (… first_name, last_name …)`
said another, and PostgREST answered to the grant. That is the same failure as KRA-008: a policy
written down in one place and enforced in none.

0236 revokes the two columns from `authenticated` and `anon`. **`gender` is kept, per owner decision
OD-5**, and added to `profiles_public` — because a column granted on the base table but missing from
the projection is exactly the drift that produced this finding, and the sentinel now asserts gender
IS still readable so a future tidy-up cannot silently reverse an owner decision.

The projection also became caller-aware. `profiles_public` is `security_invoker = false` (0206
established why: it publishes a derived `age` computed from columns the reader cannot see), so RLS
never constrained it and it returned every row to every caller — including members who had blocked
the caller, which RELATIONSHIP-PRIVACY-POLICY.md says are unavailable. The block test is now in the
view body, symmetric, with a reverse composite index added so the per-row EXISTS stays index-only in
both directions inside a view that directory pages scan.

**Evidence (Executed-local).** Replay 236 applied / 0 failed; RLS negative 26/26; concurrency pass;
`klimr_ready` 18/18. KRA-010 acceptance 11/11 including `select *`, own-row still working through
`profile_private`, service-role unaffected, and a **non-zero baseline** — A could see B before the
block and could not after, so the zeros are measurements rather than emptiness.
One app read moved: `app/e/[code]/signup/page.tsx` was reading its own legal name off `profiles` and
now reads `profile_private`. `app/verify/continue/page.tsx` uses the admin client and is unaffected.
**Not production-verified.**

### 2026-08-10 — Batch 1, pass B (part 2): KRA-009 relationship oracles

0233/0234 granted EXECUTE to `authenticated` on six predicates that accept ANY two member UUIDs, so
a member could iterate pairs over PostgREST and read back two strangers' relationship state. Worst
for mute and restrict: owner decision **D-13** says all three lists are silent and "the other person
is never told" — an RPC answering `is_muted_by(x, y)` for arbitrary x and y contradicts a recorded
product decision, not merely a security preference.

**The design turned on a measurement, not an assumption.** The audit suggests revoking member
EXECUTE. That is safe for the six new predicates — they have **zero call sites**, which is the
companion finding KRA-008 — so revoking changes no behaviour at all today. It is NOT safe for
`is_blocked_pair`, which is called from 27 places including live RLS policies: revoking it and
reading `posts` as a member produces `ERROR: permission denied for function is_blocked_pair`,
because a policy expression is evaluated with the querying role's rights. Measured on the replay
cluster before choosing. So that one keeps its grant and gained an in-body caller guard instead,
with `auth.uid() is null` deliberately allowed for service_role and trigger contexts (0209's
notification trigger legitimately tests a pair the caller is not part of).

**My first draft failed my own sentinel, and the reason is another finding in this same audit.**
I revoked from `authenticated` only. `has_function_privilege('authenticated', …)` was still TRUE,
because a function carries an implicit **PUBLIC** EXECUTE entry and the role keeps the privilege
through PUBLIC regardless of what is revoked from the role itself. That is exactly **KRA-003** —
0196 rewrote grants only for functions whose ACL text already listed a PUBLIC entry — reproduced on
brand-new code written by someone who had read the finding that morning. One replay caught it; a
code review would not have. It also means KRA-003 is confirmed live a second way, independently.

**Deliberately NOT added:** any member-facing wrapper for `is_muted_by` / `is_restricted_by`.
A function answering "has this person muted me" would disclose precisely what D-13 promises to keep
silent. Both remain available to service_role and definer policy code only.

**Evidence (Executed-local).** Replay 237 applied / 0 failed; RLS negative 26/26; concurrency pass;
`klimr_ready` 19/19. Acceptance with a real third-party block seeded (non-zero baseline): all six raw
predicates closed to a stranger — five `permission denied`, `is_blocked_pair` → `not_your_pair`;
a member can still read their OWN pair; service context (auth.uid() null) unaffected; ladder defaults
confirmed correct (stranger `request` allowed = everyone, stranger `message` denied = network,
blocked denied either way). **One test expectation of mine was wrong, not the code** — I expected
stranger-message to pass and it correctly denied. tsc 0, eslint 0 (137), vitest 250/250.
**Not production-verified.**

### 2026-08-10 — Batch 1, pass B (part 3): KRA-008 — the ladder becomes a boundary

0233/0234 defined the predicates, granted them, and RELATIONSHIP-PRIVACY-POLICY.md said the rules
were enforced. Zero call sites. The only test covering them asserted that the *names* appeared in a
document — a vocabulary test, which is exactly what let a decorative boundary stand.

What was actually enforcing anything, and what it cost:

| Action | Before | Now |
|---|---|---|
| `message` | DM insert checked only that the peer was not the caller. `who_can_message` defaults to `network` and was ignored **entirely** — any member could DM any member. | RLS applies `can_i_act_on(peer_id,'message')` |
| `invite` | 0144 used a BINARY `open_to_invites` flag and **inlined its own copy** of the block predicate | definer trigger calls `may_act_on(...,'invite')`; boolean kept as a stricter override |
| `request` | `request_connection` **inlined another copy** of the block predicate and consulted no setting at all | `may_act_on(v_me, p_target, 'request')` |
| `comment` | insert checked authorship only | RLS applies `can_i_act_on(post_author,'comment')` |
| `tag` | insert checked the tagger owned the post | RLS applies `can_i_act_on(user_id,'tag')` |
| mute / restrict on reads | not enforced | `comments readable` applies `can_i_see_comment(id)` |

**Two inline block copies deleted rather than supplemented** — the fifth and sixth instances of the
pattern this codebase has now recorded five times. `may_act_on` already refuses across a block in
both directions, so each copy was both duplicated and narrower than the rule it stood for.

**Which form each caller uses, and why it is not arbitrary.** RLS policies call the caller-bound
`can_i_act_on`; SECURITY DEFINER triggers and commands call `may_act_on` with an explicit actor. That
split exists because 0237 revoked member EXECUTE on the raw predicate and a policy expression is
evaluated with the querying role's rights — measured on the cluster, not assumed.

**LIVE BUG FOUND WHILE TESTING — direct messages have never worked.** 0075 added
`conversations_one_anchor` (exactly one of match_id / team_id). 0110 then added DMs, which have
NEITHER — they are anchored by `peer_id` with `kind='dm'` — and never relaxed the constraint. Every
DM insert has been rejected since 0110 shipped, and `app/health/actions.ts` re-queries on error and
falls through to a generic notice, so it failed silently. "Message this professional" in the health
directory has never once worked. Same class as the two bugs 0201 repaired and the contradictory
status CHECK 0204 dropped. Fixed here, because otherwise this migration would have been enforcing a
rule on a path that cannot execute — and I would have "proved" the deny case while the allow case
was impossible. `coalesce(kind,'')` is deliberate: a CHECK evaluating to NULL **passes**.

**Evidence (Executed-local).** Replay 238 applied / 0 failed; RLS negative 26/26; concurrency pass;
`klimr_ready` 20/20. Acceptance proves **both directions**: DM denied for a stranger under
`connections`, **allowed once connected**; `request_connection` returns `blocked` under `connections`
and `requested` under `everyone`; a team invite is refused **even inserted as service_role**, because
the trigger binds the service role where RLS would not. Guardrail added asserting call sites rather
than names, with a negative control observed failing. tsc 0, eslint 0 (137), vitest 253/253.
**Not production-verified.**

**Follow-up recorded, not guessed at:** Klimr now has TWO invite settings — the 0144 boolean
(`open_to_invites`, from `user_preferences.who_can_invite` anyone/nobody) and the ladder's
`profiles.who_can_invite` audience_level (0233). Both are enforced, boolean as the stricter override.
Collapsing them into one control is a **product decision for the owner**, not an engineering cleanup.

**Also owed (named, not silently skipped):** `may_see_connections` and `may_see_schedule` are bound
and callable but their surfaces (the connections list and upcoming matches) are not yet wired to
them; D-15 makes both connections-only and that has no enforcement point yet. And KRA-020 — the
availability oracle — is now straightforward under OD-2, since the ladder is the thing that should
decide it. Both carried into the next batch.

### 2026-08-10 — OD-4 RESOLVED (owner accepted the researched recommendation)

Owner instruction: proceed on Claude's recommendation. Recorded as an **amendment to D-22** in
`docs/DECISIONS_REGISTER.md`, because it changes a settled decision and doing that silently would be
worse than the original error.

**Settled:** nothing in `quarantine` leaves the primary provider — confirmed or unconfirmed. The
provenance record (uploader identity, IP, timestamps, content hashes, decision log, report ids) is
replicated in full, marked and separated for review, which is what OD-4 was actually reaching for.

**Acted on immediately:** `supabase/harness/storage-backup.sh` copied "only the items NOT confirmed
as CSAM" to both encrypted destinations. That block is removed. `docs/RESILIENCE.md` has said
"never copied" all along — the script was the half that diverged, which is exactly the contradiction
KRA-018 reports. Bash syntax check exit 0; two `rclone copy` sites remain (plain buckets and personal
documents), quarantine has none.

**Still owed under KRA-018 and not claimed as done:** uploader IP is not captured at upload time
today, so the provenance record is currently incomplete for a CyberTipline report. Named as work,
not glossed. Counsel confirmation of the whole position remains advised.

### 2026-08-10 — Batch 1 tail + batch 2 opens: KRA-003, and the D-15 surfaces

**KRA-003 — implicit PUBLIC EXECUTE (0239).** 0196 intended to remove PUBLIC EXECUTE and processed
only `pg_proc` rows whose `proacl` TEXT already contained a PUBLIC entry — which is exactly the set
that did NOT have the defect. A function nobody ever granted has `proacl IS NULL`, meaning "the
default", and the default for a function is EXECUTE to PUBLIC. `grant_hygiene_intact()` then checked
RELATION privileges, so the readiness gate could not see it either.

Confirmed live **twice** during this batch, independently of the audit: 0237's revoke of six pair
predicates from `authenticated` did nothing (the role kept EXECUTE through PUBLIC), and the audit's
own example `feed_emit` — SECURITY DEFINER, caller-chosen actor/audience/ZIP, inserts Feed rows —
had never been granted or revoked, so any PostgREST caller could forge a Feed entry.

The sweep preserves intent and removes accident: it distinguishes an EXPLICIT grant
(`authenticated=X/owner`) from the default nobody chose (a bare `=X/owner`) by reading the catalog,
re-applies the explicit ones verbatim, and drops the rest. `alter default privileges … revoke
execute … from public` makes it a rule rather than a one-time cleanup — without that line the next
migration to create a function reopens the hole.

*My first draft failed on apply:* I typed `feed_emit`'s argument list by hand and got
`p_object_kind` wrong (text, not uuid). Signatures are now resolved from the catalog by name — the
same reason this project requires migrations to be `cat`'d rather than retyped.

**Acceptance (Executed-local).** Replay 239 applied / 0 failed; RLS negative 26/26 — which is the
regression proof that member access survived; concurrency pass; `klimr_ready` 21/21.
`anon` executable functions = **0**; authenticated-without-explicit-grant = **0**;
`feed_emit` and `prune_feed_items` DENIED to a member; **168 explicit grants preserved**, so this is
a scalpel and not a blanket lockout; a bound wrapper still callable. Negative control observed
failing when the default-privileges rule was removed. **Not production-verified.**

**D-15 surfaces (batch 1 tail) — nothing built, deliberately.** `may_see_connections` and
`may_see_schedule` are bound and callable, but the surfaces they would gate **do not exist**:
`/network` shows only the caller's own connections, and no route renders another member's upcoming
matches. Building enforcement for a page that does not exist is the speculative architecture the
contract forbids. Instead a tripwire fires when such a surface appears ungated.

That tripwire took three drafts and the first two would have been worse than nothing:
- draft 1 flagged `app/play/[id]` and `app/chats/[matchId]` — keyed on a MATCH, showing that match's
  own roster;
- draft 2 flagged `app/profile/[id]` — which reads `match_participants` for ids drawn from the
  completed-match ledger, i.e. PAST results for head-to-head and recent form.
D-15 is about a member's location at a known FUTURE time, so neither was the risk. A canary that
fires on correct code gets muted, and muting it takes the real alarm with it — this file has said so
since 2026-08-08. The shipped version asserts the derivable thing: a member-keyed page reading
future-dated matches must consult the predicate. Negative control: injecting exactly such a read
into `app/profile/[id]` turns it red and names the file.

### 2026-08-10 — Owner decision OD-6: one invite control (0240 + 0241)

Owner authorised adding a level to the ladder. Shipped as an **enum split pair**, because PostgreSQL
cannot use an enum value in the transaction that adds it — the precedent this project already set
with 0172/0173. **0240 must commit before 0241 is pasted.**

| | Before | After |
|---|---|---|
| Control | `user_preferences.who_can_invite` ('anyone'/'nobody') **and** `profiles.who_can_invite` (ladder) | the ladder alone, which can now say `nobody` |
| `profiles.open_to_invites` | authored via trigger from user_preferences | **derived mirror** of `who_can_invite <> 'nobody'`, kept because two surfaces filter on it with an index |
| Settings toggle | wrote the boolean | writes the ladder; `anyone` lifts a member out of `nobody` but never clobbers a deliberate `connections`/`following` |
| `enforce_invite_privacy` | checked the boolean AND the ladder | one predicate |

**Also closed a fail-open in `may_act_on`.** Its trailing `else true` fired when the subject had no
profiles row, so an absent subject meant ALLOW. Every ladder column is NOT NULL with a default, so
`else` was only reachable for a non-existent subject — but "indeterminate never becomes allow" is
KRA-015's acceptance criterion in this same audit. It denies now, and the acceptance suite proves it.

**Acceptance (Executed-local), 7/7 with a non-zero baseline:** default `everyone` allows the invite;
setting `nobody` flips the mirror automatically and denies; the settings toggle writes the ladder;
`anyone` does **not** clobber a deliberate `connections`; an absent subject denies.

### Two of my own controls were false, and the replay said so

**1. `alter default privileges … revoke execute on functions from public` does nothing.** I put that
line in 0239, wrote that it "makes it a rule rather than a one-time cleanup", and added a guardrail
asserting the line was present. Measured on the cluster: `pg_default_acl` stays **empty** and a
function created immediately afterwards still has `proacl IS NULL` — PUBLIC EXECUTE. The built-in
function default applies when proacl is NULL and is not removable that way.

So I had shipped a decorative control **and a test that asserted the claim rather than the
behaviour** — which is the precise failure this entire audit is about, committed while fixing it.
Replaced with an **event trigger** on `ddl_command_end` that revokes PUBLIC/anon from every newly
created function, guarded so the migration still applies if the platform refuses event triggers.
**Watched working:** a probe function created afterwards comes out `{postgres=X/postgres}` with anon
and authenticated both false. The guardrail now pins the mechanism.

*And the trigger function itself was born with PUBLIC*, because it is created before the trigger
that would have caught it. `function_acl_intact()` failed the replay on exactly that — the bootstrap
case — which is the sentinel earning its place twice in one batch.

**2. `_` is a single-character WILDCARD in LIKE.** My invite sentinel asserted
`pg_get_functiondef(...) not like '%open_to_invites%'`. The rewritten function raises
`'not open to invites'` — spaces where the underscores are — and LIKE matched it, so the gate
reported dirty while being clean. Now a positive assertion (it must CALL `may_act_on`) plus a
`position(...) = 0` negative. A guardrail that asserts on prose finds prose.

### 2026-08-10 — Batch 2 complete: KRA-019, KRA-031, KRA-020 (0242)

**KRA-019 — the report that fetched what you could not see.** `report_post` is SECURITY DEFINER and
selected the post BY ID with no visibility test, then wrote `body_snapshot` and `media_snapshot` into
a `post_reports` row the reporter may read back. Any post UUID from an old share link or a
notification returned the body of a private, friends-only, pending or blocked-author post. The
snapshot exists so an author cannot destroy evidence; it must not become a way to fetch content.
Gate added before the rate limit and before the snapshot, returning the same `not_found` as a
missing post per OD-3 — pending, private, blocked and absent are one answer.

**KRA-031 — anonymous, unbounded, privileged.** Every valid beacon created a service-role client and
inserted a row: no per-source limit, no global budget, no backpressure. The route's own comment said
the worst case was a skewed dashboard. The client "samples at 10%", which is a request TO the client,
not a control. Now a fail-closed per-IP limit in the route and a daily row budget inside `rum_ingest`
that the client cannot decline — and which **counts** what it drops, because a budget that discards
traffic silently looks exactly like a system nobody is talking to.

**KRA-020 — availability was a schedule oracle (OD-2).** The slots were never printed, but a caller
could name a person AND narrow the window and reconstruct a private weekly schedule from which
queries returned them. Per OD-2 the ladder decides: `players_open_to_requests()` applies
`may_act_on(caller, subject, 'request')`, replacing the `open_to_invites` filter which after 0241 is
only a derived mirror of one point on that ladder. Separately, a name filter combined with a time
grid is now refused — "who is free Tuesday evening" is the product, "is Alice free at 18:15" is the
primitive, and it is the COMBINATION that makes it one, so the name is dropped rather than the query.

**Residual, recorded rather than glossed:** with `who_can_request = 'everyone'` (the default) a member
can still learn that *someone* is free in a window, and repeated broad queries narrow a population.
OD-2 accepts that trade explicitly — availability is discovery data for members who accept public
requests. The person-targeted probe is what has been removed. If the owner later wants the coarse
opt-in category the audit suggested, that is a further step, not a contradiction of this one.

**Three defects of mine, all found by running rather than reading:**
1. **`rum_ingest` had an off-by-one at the boundary.** The test and both counters lived in one
   UPDATE and the outcome was inferred from RETURNING — but at the cap both branches leave `accepted`
   equal to the cap, so the 4th call against a cap of 3 counted a drop, returned `ok`, AND inserted
   the row. A budget reporting that it enforced itself while letting the row through. Now a
   `for update` read then an explicit branch.
2. **My fixture made the whole KRA-019 suite vacuous — twice.** First `post_type = 'text'` violated a
   CHECK so no posts existed and every "not_found" was denial-of-nothing. Then the posts existed but
   a trigger pins new posts to `pending`, so the ALLOW case denied too — the same correction KCDX-018
   recorded when its suite passed for the wrong reason. The suite now approves as `service_role` and
   **asserts its preconditions** before believing any result.
3. **My patch helper silently discarded three of four edits.** It re-read the file from disk for each
   replacement and wrote to one temp path, so only the last survived — the RUM route shipped without
   its rate limiter. The guardrail caught it. Fixed by accumulating in one string, which is what the
   project's own /tmp-then-cp rule assumes.
4. A guardrail assertion sliced on the bare id `KRA-031`, which also appears in the file header, so
   the slice was **empty and the assertion passed against an empty string**. It now asserts the slice
   is non-empty first.

**Evidence (Executed-local).** Replay 242 applied / 0 failed; RLS negative 26/26; concurrency pass;
`klimr_ready` 23/23. Acceptance on a clean replay, all assertions passing with preconditions
asserted and both allow and deny proven. tsc 0, eslint 0 (137), vitest 259/259. Two negative controls
observed failing and restored. **Not production-verified.**

### 2026-08-10 — Batch 3 (part 1): KRA-005, KRA-011, KRA-030 (0243 + lib/media-safety.ts)

**KRA-005 — the safety gate that had never run.** `scanForKnownCSAM` and `escalateCSAE` were fully
implemented, documented in SAFETY.md, reasoned about across three migrations — and called from
nowhere. The Feed downloaded a photo and ran the AI classifier; avatars and listings issued signed
upload URLs on a caller-DECLARED MIME with no byte inspection at all.

**Why it was probably never wired, which the fix had to solve rather than ignore:** the scanner is
fail-closed, so with `CSAM_SCAN_PROVIDER=none` it returns `blocked`. Calling it naively refuses every
photo upload on a pre-launch project with no provider. The honest options had been "wire it and break
uploads" or "leave it dead", and the second was chosen silently.

The resolution separates two things that were being conflated:
- a known **match** → preserved, escalated, never publishes. No degradation, ever.
- a scan that could not **run** → also never publishes, but is held as `pending` rather than
  destroyed. `pending` is invisible to everyone but the author, so nothing reaches another member
  without a successful decision — the acceptance criterion — while a vendor outage does not silently
  delete a member's upload.

Fail-closed means *never publishes*, not *always rejects*. Only one of those is a safety property.

**KRA-011 / KRA-030 — deletion that deleted nothing.** 0224 cleaned up with
`delete from storage.objects`. Supabase's own documentation is explicit that removing the metadata
row does not remove the object, so the row vanished, the application believed it had succeeded, and
the bytes stayed — no longer visible to `storage_manifest_verify()` (0226), which reconciles against
`storage.objects` and had just been made blind to them. The member-facing version is worse than the
invoice: content a member believes deleted is gone from every surface and still fetchable by anyone
holding a signed URL. A migration cannot call the Storage API, so the intent is now durable
(`storage_deletions`) with an absence canary, and cleanup completes when the API confirms.

**The defect worth recording — I repeated the 0214 lesson.** 0224 declares
`purge_orphan_feed_media(p_grace_hours integer default 24)`. I wrote my replacement with **no
arguments**, which does not replace that function — it ADDS an overload. The original survived, still
carrying `delete from storage.objects`, and the nightly cron entry (`select
public.purge_orphan_feed_media()`) would have kept calling the vulnerable one while my clean copy sat
beside it doing nothing.

**And my sentinel passed anyway**, because it used `limit 1` with no ORDER BY across the two rows and
happened to sample the clean one. A check that samples one of several overloads is not a check. Both
fixed: the signature now matches, the stray overload is dropped explicitly, and the sentinel asserts
across EVERY function of either name.

**A guardrail that asserted an import.** My first KRA-005 tripwire used
`toContain("scanForKnownCSAM")` — which the import line satisfies. Deleting the actual call left it
green, and the negative control caught it. Given the finding is *"these functions exist and are never
invoked"*, asserting the import was the one form of evidence guaranteed to prove nothing. Now
`/await scanForKnownCSAM\(/`, and the negative control fails correctly.

**Ratchet respected.** `app/feed/actions.ts` hit 544 against a 515 budget. The number was not raised:
the photo decision moved to `lib/media-safety.ts` as `screenAndClassifyPhoto` — a concern with its
own subject that nothing else in the module touches. Parent back to exactly 515. The dead
`moderateImage` import that the extraction left behind pushed lint to 138; removed, back to 137.

**Evidence (Executed-local).** Replay 243 applied / 0 failed; RLS negative 26/26; concurrency pass;
`klimr_ready` 24/24. Storage acceptance: shared path → 0 enqueued, last reference → 1 enqueued,
preserved evidence → 0 enqueued, exactly 1 purge overload remains, no function of either name
contains a raw catalog delete, and the absence canary reads 0 then 1 after backdating (proven
non-vacuous). tsc 0, eslint 0 (137), vitest 262/262. Two negative controls observed failing after one
was found too weak and strengthened. **Not production-verified.**

**Owed and named, not glossed:** the Storage-API deletion worker (KRA-011's other half); the avatar,
listing and evidence upload paths (KRA-005's other five surfaces); KRA-004 and KRA-006 (evidence
binding) remain OPEN in batch 3.

### 2026-08-10 — Batch 3 (part 2): the worker, evidence binding, and a regression I caused

**KRA-011 completed.** 0244 adds `claim_storage_deletions` (FOR UPDATE SKIP LOCKED, attempts
incremented on claim so a poison object cannot retry forever in silence) and `mark_storage_deletion`.
`lib/storage-deletions.ts` drains on the **existing** every-minute tick rather than a new cron entry —
KCDX-039 found both scheduled routes had never executed for their entire lives, so a new schedule is
a new thing that can be silently broken. Completion is written only after the Storage API confirms:
"we asked" must never be recorded as "it happened", because that is the original defect in a new hat.
Two canaries kept separate — `_stuck()` (waiting) and `_abandoned()` (eight failures, needs a human) —
so neither number becomes noise the other hides in.

**KRA-004.** 0203's hash covered identity and credential text and omitted `document_path`, `phone`
and `attestations` — while the admin console signs and displays `document_path` to the reviewer. The
single most decision-relevant item was the one that could change without invalidating the decision.
The freeze had the same gap, so a hash nobody could rely on and a freeze with holes failed together.
Both now cover the same set, and — the part I nearly got wrong again — the hash is **replaced in
place** rather than added beside, because 0203's trigger and `provider_review_decide()` both call the
existing name.

**KRA-006 (partial).** `verify_payment_proof_object()` checks the object against `storage.objects`:
exists, under the registration-id prefix, owned by the uploader. A path string from a caller is a
claim; `storage.objects` is the fact. **Not yet wired into the command, and no byte digest** — so
post-submit replacement is still possible. Recorded as partial rather than claimed.

**A regression I introduced, caught by an acceptance test.** 0239's sweep re-granted `service_role`
only where the old ACL already named it. `provider_application_hash` had never been granted anything
— it lived on the PUBLIC default — and 0203's freeze trigger runs with **INVOKER** rights and calls
it. So revoking PUBLIC broke every write to `provider_applications` with `permission denied for
function`, and **the replay did not notice, because applying migrations fires no triggers.**

That is a general shape, not a one-off: any invoker-rights trigger body calling a helper that was
only reachable through PUBLIC breaks identically. 0239 now always grants `service_role`, which is the
server's own identity and already bypasses RLS — withholding EXECUTE from it buys no safety and costs
exactly this. `anon` and `authenticated` stay revoked unless explicitly granted, which is where the
finding's actual risk lives. **Residual: other invoker-context callers may exist that no test
exercises. Named, not resolved.**

**Fourth weak guardrail this week.** My KRA-004 tripwire sliced the freeze function to end-of-file,
sweeping in the sentinel below it, which names the same three fields — so deleting `document_path`
from the freeze left the test green. Bounded now, and the negative control fails correctly. The
running tally of guardrails of mine that passed against something other than the behaviour:
an import line, a `limit 1` sample across overloads, a LIKE wildcard matching prose, and an unbounded
slice. Every one was found by deliberately breaking the code, none by reading the test.

**Evidence (Executed-local).** Replay 245 applied / 0 failed; RLS negative 26/26; concurrency pass;
`klimr_ready` 25/25. Evidence acceptance: document swap moves the hash; applicant swap REFUSED while
pending; phone covered; zero hash disagreements; payment object allow + three denials. tsc 0,
eslint 0 (137), vitest 265/265. Negative controls observed failing on both new guardrails after one
was strengthened. **Not production-verified.**

### 2026-08-10 — Batch 4 (part 1): KRA-014, KRA-015

**⚠ DEPLOYMENT NOTE FOR THE OWNER — read before pasting/deploying this batch.**
`TURNSTILE_SECRET_KEY` must be set in the production environment. With KRA-015 fixed, a missing
secret now **closes** the access-code gate instead of opening it. That is the intended direction — a
closed gate is a visible failure and an open one is not — but if the variable is absent today, the
invite gate will stop accepting anyone the moment this deploys. `CAPTCHA_DEV_BYPASS=true` exists as
an explicit escape and is ignored in production by design.

**KRA-014 — deadlines.** Three server-side calls had no `signal` at all: the Anthropic call in
`lib/court-facts.ts`, a Google geocode in `app/courts/search-actions.ts`, and the NCMEC report POST
in `lib/safety-escalation.ts` — the last of which is the legally-required escalation path, held open
by a hung vendor. All three now go through `callExternal` with written per-site budgets. NCMEC gets
**zero retries** deliberately: a duplicated CyberTipline submission is its own problem, and the
failure branch already routes to a manual report.

**The tripwire was worse than nothing, in two independent ways**, which is why the audit's
independently-run suite passed 85/85 with all three defects present:
1. it matched only fetches whose FIRST ARGUMENT is a literal absolute URL, so `fetch(url, …)` with
   the URL in a variable was invisible;
2. it accepted the substring `signal` **anywhere** in the call — and the Anthropic prompt in
   `court-facts.ts` contains the word "signals", so that call reported clean while having no
   deadline whatsoever.
Both fixed. **Tightening it immediately surfaced a fourth undefended fetch** (the NCMEC one) that had
never been flagged — the clearest possible evidence the old check was decorative.

**KRA-015 — indeterminate is not allow.** Both fail-open paths were deliberate and justified in
comments: "the site works before setup", "rate limiting is the real protection", "rather than risk
locking a user out". Each justification is reasonable and each produced the same outcome — an
attacker who can cause or wait for an outage walks through a gate the rest of the system assumes has
run. Rate limiting is a different control with a different threat model, not a substitute.

The AAL fix avoids the lockout the original comment feared without conceding the property:
unsatisfied and indeterminate take the same branch, and that branch is `/mfa` for navigations rather
than a hard 403. A member whose session really is aal2 completes the step; a transient error costs one
redirect instead of admitting an unverified session.

**Fifth prose-not-code guardrail.** My own KRA-015 assertion matched the comment *"Was `return
true`"* inside the very catch block it was checking. Stripped comments; negative control now fails
correctly. Running tally of guardrails of mine that asserted something adjacent to the property: an
import line, a `limit 1` sample, a LIKE wildcard, an unbounded slice, and now an explanatory comment.

**Evidence (Executed-local).** tsc 0, eslint 0 (137, at ceiling — a `signal` I wrapped but never
passed into the request was caught by lint as an unused variable, which was a real defect and not a
style nit). vitest 267/267. Negative controls observed failing on both new guardrails.
**Not production-verified.**

**KRA-042 deliberately NOT started.** The Next.js upgrade (16.2.7 → ≥16.2.11, Server-Action DoS) is a
framework bump that needs a full build plus route smoke verification, and starting it without room to
finish would leave the tree in a half-upgraded state. It remains the highest-value single remaining
item and should be its own task.

### 2026-08-10 — Batch 4 complete: KRA-016, KRA-017, KRA-018

**KRA-016 — an archive that looked complete.** The export's `one`/`many` helpers coerced `data` and
discarded `{ error }`. supabase-js does not throw, so one regressed grant or policy turned a dataset
into an empty array and the member still received a successful archive. That is the worst possible
shape for a data-rights response: they believe they have everything, and nobody is prompted to fulfil
the rest. All 21 datasets are now individually named and checked, and the archive states its own
completeness. Failures are collected rather than thrown, so a member still receives what loaded —
with the archive saying plainly what did not.

Separately, `reports_i_filed` was populated from `safety_incidents` where the member was the
**uploader**. A member asking for the reports they filed received a list of times they were the
subject — the inverse of the category — and the actual reports were never queried. Fixed, with the
incidents preserved under an honest name. The DATA-GOVERNANCE claim and its doc-claims assertion moved
to v3 in the same change, which is the KCDX-058 mechanism working as designed: the test failed the
moment code and document disagreed.

**KRA-017 — an audit row asserting a success nobody observed.** `getPrivilegedClient` wrote `ok` at
the moment it handed out the client, before the operation ran. Worse than no audit row: an incident
review reads them as evidence.

Writing `started` instead would have been wrong in a subtler way — every routine handout would then
produce an unpaired `started`, and "started with no partner" is the entire incident query 0197 exists
to answer. So 0246 adds `issued`: a client was created, nothing is promised, no partner will arrive.
Proven that the signal survives — 50 `issued` rows and a completed pair leave the incident count at 1.
**Breadth is unfixed and not claimed:** 88 files still take the raw client, and narrowing them to
transactionally-audited commands is per-domain work.

**KRA-018 — verification that could not fail usefully.** The script compared object COUNTS, and only
for the plain buckets, so the encrypted document copies and the configuration copy were unverified
entirely. Counting cannot distinguish "the file came back" from "a file with that name came back" —
which is precisely the distinction 0226's manifest was built to make, so the backup's own check was
weaker than the tooling beside it. Plain buckets now verify by `rclone check` (hashes); encrypted
destinations assert counts, which is what is assertable when ciphertext differs from source by design,
and asserting it is still better than skipping it. The quarantine contradiction closed earlier in this
session, so script and RESILIENCE.md now agree.

**Unchanged and still blocking:** no run history, no secret presence check, no alerting on staleness,
and **no restore drill**. B-01/B-02 stand. Nothing here should be read as recoverability.

**Evidence (Executed-local).** Replay 246 applied / 0 failed; RLS negative 26/26; concurrency pass;
`klimr_ready` 26/26. KRA-017 acceptance 5/5. tsc 0, eslint 0 (137), vitest 270/270. Three negative
controls, all observed failing and restored. `bash -n` on the backup script exit 0 — the script itself
is **not executed here and has never run anywhere**, which is the finding, not a gap in this work.
**Not production-verified.**

### 2026-08-10 — Deployment confirmation (owner)

`TURNSTILE_SECRET_KEY` is **set in production** (Gabriel, 2026-08-10). The KRA-015 deployment note is
therefore satisfied: the access-code gate fails closed on a missing secret, and the secret is present,
so the gate operates normally rather than closing on deploy. Recorded as **Recorded** evidence — the
owner's statement, not a probe from here.

### 2026-08-10 — KRA-042: dependency advisories cleared

**Result: `npm audit --omit=dev` goes from 4 high to 0.** The applicable one was
GHSA-m99w-x7hq-7vfj, a denial of service in Next's App Router Server Actions, for which GitHub states
there is no workaround other than upgrading. Klimr uses App Router and Server Actions throughout, so
the prerequisites were present — this was not a theoretical entry in a tree.

| Package | Was | Now | Why this version |
|---|---|---|---|
| `next` | 16.2.7 | **16.2.12** (exact) | Fix landed in 16.2.11; 16.2.12 is the current patch of the same minor |
| `postcss` | 8.5.15 | ^8.5.26 | `<=8.5.22` vulnerable. An override of `^8.5.10` already existed and the lockfile had resolved it to 8.5.15 — the override was present and not doing its job |
| `sharp` | 0.34.5 | ^0.35.3 | Inherited libvips CVEs, fixed at `>=0.35.0` |
| `nanoid` | 3.3.12 | ^3.3.18 | Patched **within 3.x**. postcss depends on `^3`, so moving to 5 or 6 would have broken it |

**Why overrides rather than `npm audit fix --force`.** The three transitive advisories were reported
through `next`, and `--force` offered to move Next across a **major** to satisfy a bundled leaf
dependency. Rewriting the framework to silence an advisory in `nanoid` is not a trade worth making,
and it would have produced a far larger change than the one being verified.

**A mistake worth recording.** I wrote `^16.2.12` and it resolved to **16.3.0** — a minor jump, when
the entire stated intent was the smallest move that clears the advisory, and when the pin already in
the file was exact (`16.2.7`). Corrected to an exact `16.2.12`, and the new release gate now asserts
that `next` is an exact pin rather than a range, so a caret cannot quietly widen it again.

**Evidence (Executed-local).** `npm audit --omit=dev` → **found 0 vulnerabilities**. tsc 0, eslint 0
(137, at ceiling), vitest 272/272. **Full production build: `✓ Compiled successfully in 92s`,
88/88 static pages generated, 164 routes emitted, zero `Failed to compile` / `Type error` lines**, and
every route touched this session present (`/feed`, `/play`, `/q/[code]`, `/q/[code]/[court]`,
`/api/rum`, `/api/cron/waitlist-sweep`). Negative control: reverting the pin to 16.2.7 turns the gate
red. **Not production-verified** — the artifact builds here; it has not been deployed.

**Deployment note:** `package.json` AND `package-lock.json` both changed. Both must go up together or
the install resolves differently from what was verified here.

### 2026-08-10 — Batch 5 (part 1): KRA-022, KRA-024, KRA-025, KRA-026

**KRA-022 — retrieved, then thrown away.** 0216 added businesses to `global_search` and the kind
router asked for them; the href map had no `business` entry and the result loop drops any row without
an href. So every business row was fetched successfully and silently discarded. A hole *inside* the
fix that claimed to add them, not an unbuilt feature. The route `/business/[id]` already existed.
Adding the kind made the compiler name all four exhaustive `Record<SearchResultType, …>` surfaces —
the type system did the finding, which is the argument for exhaustive records over string maps.

**KRA-024 — dead destinations.** AI player and provider cards linked `/play/<uuid>`. `/play/[id]` is
the MATCH page and queries `matches.id`, so every AI person result pointed at a match that does not
exist unless a user UUID happened to equal a match UUID.

**KRA-025 — resolved and never rendered.** 0228 built the resolver and the page stored only
`{id, reason}`, using it solely for the unavailable note. On `ok` the post was not fetched, prepended
or focused — and the ranked feed caps at 60 and is personalised, which is *precisely* the original
failure. A resolver that says "yes, you may see this" and then does not show it is more confusing than
the shrug it replaced. The id is prepended to the ranked set so it travels through the same caller-RLS
read as everything else; nothing bypasses a policy.

**KRA-026 — the collapse that protected one person.** 0228 collapsed the BLOCK case into `not_found`,
correctly, and left three distinguishable answers standing: moderation was checked before audience, so
a stranger learned a private post was `pending_review`; an approved-but-hidden post returned
`not_visible` **plus `author_id`** — the identity the audience rule exists to protect; and both were
separable from a genuine absence. Protecting the blocked person and nobody else.

Per OD-3 every refusal is now one answer with no author. The author check moved FIRST, so collapsing
cannot hide a member's own content from them, and `pending_review` survives for them alone.

**Evidence (Executed-local).** Replay 247 applied / 0 failed; RLS negative 26/26; concurrency pass;
`klimr_ready` 27/27. KRA-026 acceptance: public post resolves with author; friends-only, pending,
absent and blocked all return `unavailable` with no author; author reaches own post including under
review. tsc 0, eslint 0 (137), vitest 276/276.

**A negative control that was itself a no-op.** My first attempt to re-break the resolver used inline
shell escaping that silently failed to modify the file, so the suite passed and I nearly recorded that
as the control passing. Redone from a script file, and it fails correctly. A negative control that
does not apply its change is indistinguishable from a guardrail that does not work — which is the
whole failure mode this practice exists to catch, arriving one level up.

### 2026-08-10 — Batch 5 (part 2): KRA-028 fixed, KRA-029 split — and OD-7 raised

**KRA-028 — the ranking rewarded moderation traffic.** 0229's grouped `eng_comments` CTE was a real
performance win and counted every row in `post_comments` regardless of `moderation_status`. The Feed
only ever *displays* approved comments, so a post that attracted forty rejected or pending comments
ranked as though forty people had engaged with it — and the direction is the wrong way round, because
content that draws removed comments is exactly what should not be promoted. Now filtered to approved,
which makes the signal agree with what a reader can see.

**KRA-029 (counts) — fixed.** `typeCounts` was computed in the application from the ranked set AFTER
the top-60 cap, so "Photos 3" meant "3 of the 60 we happened to rank". Selecting the filter then
showed items the count never described. `feed_type_counts()` counts over the same candidate rule the
ranker draws from, before the cap, as SECURITY INVOKER so RLS applies exactly as elsewhere. The old
post-cap tally survives only as an explicit fallback when the RPC errors — a plausible number beats an
empty control, and the error reaches the server log either way.

---

## OWNER DECISION NEEDED — OD-7: what should the "Nearby" feed lane mean?

**KRA-029's other half is not a bug and has not been faked.** The audit reports that `lane === "nearby"`
passes `p_scope: "all"` to `get_ranked_feed`, i.e. no location filtering. That is accurate. But the
cause is structural, not an oversight in the parameter:

- **`posts` carries no location column** — no zip, no lat/lng, no city. Verified against the schema.
- Location in the older regional stream is resolved in **application code** by `lookupZip()`, a
  JavaScript ZIP table. There is no ZIP geometry in Postgres at all.

So `get_ranked_feed` cannot filter by distance no matter what value the scope parameter takes. Writing
a `nearby` branch that silently did nothing would be worse than the current state, and inventing a
location model is a product decision, not a bug fix. Options:

1. **Give posts a location.** Stamp the author's home ZIP (or the referenced court's) at post time and
   import ZIP centroids into Postgres so the ranker can filter by distance. Real "Nearby", at the cost
   of a data model change, a ZIP dataset, and a decision about what a post's location *is* — the
   author's home? where they were? the court they mention?
2. **Rename the lane.** If the ranked feed is interest-and-graph based, call it what it is
   ("Discover", "For you") and keep "Nearby" for the court/event surfaces where location is real.
3. **Accept and document** that Nearby is currently global, recorded here so a future audit gets this
   answer instead of re-flagging it.

**Claude's recommendation: option 2 now, option 1 later.** The label is the part that is currently
untrue, and it is one string; the data model is a real feature and should be scheduled as one rather
than smuggled in under an audit remediation. Nothing has been implemented either way.

**Evidence (Executed-local).** Replay 248 applied / 0 failed; RLS negative 26/26; concurrency pass;
`klimr_ready` 28/28. tsc 0, eslint 0 (137), vitest 279/279. Negative control applied from a script
that asserts its marker matched before writing — after the last one silently no-opped — and the gate
goes red correctly.

### 2026-08-10 — Batch 5 complete: KRA-023

`runSearch` detects a BROWSE intent — a kind word with no informative terms ("tournaments", "courts",
"gear for sale") — and implemented it for exactly two kinds. The other six fell through to the lexical
matcher with `condensed === ""`, which matches nothing by construction. So the branch whose own
comment says it exists to prevent "the screenshot bug" produced that bug for six of the eight kinds
it routes.

**Written as one SQL function rather than six TypeScript branches, deliberately.** This session has
twice shipped a wrong name into SQL and had the replay reject it in seconds — `purge_orphan_feed_media`'s
signature (0243) and the `professional_applications` table that does not exist (0245). The same guess
in application code returns an empty array at runtime and is **indistinguishable from "nothing
matched"**, which is exactly the failure being fixed. Every table and column in 0249 was read from the
live schema first, and the migration still rejected two syntax errors before it applied — which is the
argument, not an embarrassment.

Event browse also now consults `event_occurrences` (0129): ordering a recurring series by
`events.starts_at` buries a weekly session whose series began months ago, which is precisely what
someone typing "events" wants to see.

**A fixture defect worth recording.** The first acceptance run showed `browse_kind('court')` returning
zero rows under the `authenticated` role while returning one as superuser — which looks exactly like a
broken fix. The cause was mine: the `courts readable` policy keys on `auth.role()`, and I had set the
POSTGRES role without setting `request.jwt.claim.role`, so the shim's `auth.role()` returned `anon`.
The suite now asserts `auth.role() = 'authenticated'` before believing any result. Earlier acceptance
suites in this session asserted on `auth.uid()`-derived predicates and proved their allow paths, so
their results stand — but any test of an `auth.role()`-keyed policy written before this point was
measuring an anonymous caller.

**Evidence (Executed-local).** Replay 249 applied / 0 failed; RLS negative 26/26; concurrency pass;
`klimr_ready` 29/29. Acceptance: courts and teams both return rows under a proven-authenticated
caller; an unknown kind returns nothing rather than everything; the limit clamps. tsc 0, eslint 0
(137 — the extraction left a dead `nowMs` helper at 138, deleted rather than absorbed), vitest
282/282. Negative control from a marker-asserting script, observed failing.

**Batch 5 is complete.** KRA-022, 023, 024, 025, 026, 028 fixed; KRA-029 partial with OD-7 raised.

### 2026-08-10 — OD-7 RESOLVED (owner): a post's location is its author's

**Owner decision:** *"Posts don't need to carry location since we can get the location from the user
who posted it. Our platform is made based on user location and posts are always made by users or for
users."* — with an explicit instruction to check for security vulnerabilities. Accepted, with one
change to the obvious implementation, and the reasoning recorded because it is the whole safety
argument.

**The vulnerability in the naive version.** Joining `posts → profiles.home_zip` at READ time would
work and would quietly convert a private column into a queryable one. `home_zip` is not readable by
`authenticated` (verified: `has_column_privilege` = false; 0191 kept it out of the public projection
deliberately). But if a post's presence in my nearby feed depends on the author's CURRENT ZIP, I can
set my own ZIP, observe whether their posts appear, move it, and repeat — binary-searching a value
the schema refuses to show me. Same oracle shape as KRA-020, arriving through a ranking function.

**Why the owner's model is nonetheless right.** `profiles_public` already publishes `city` and
`state` to every member. "This author is within N miles of me" at city-level resolution discloses
nothing the profile does not already state. The disclosure only escalates if the resolution is finer
than city, or if it is live.

**So: stamped at write time, coarse, and never readable.**

| Property | Choice | Why |
|---|---|---|
| When | At post creation | Kills the probe — moving my ZIP re-sorts MY feed and tells me nothing about anyone else. Matches `feed_items`, which has taken a zip at emit since 0115. |
| What | ZIP **centroid** | City-level. Never device GPS, never a check-in, never a point in time — the three things that would be a real escalation. |
| Where | `post_origins`, server-only | Not on `posts`. See the mistake below. |
| Exposure | `posts_within()` returns **ids** | A coordinate is never returned to anyone. Ids are not secret; RLS still decides which rows load. |
| Radius | clamped to **[25, 250] miles** | The floor is load-bearing: without it a caller could shrink the disc and turn a city-level fact into a neighbourhood-level one. |
| Ranker | stays SECURITY INVOKER | It decides ORDER and DISTANCE, never who may see a row. |

**Residual, stated rather than hidden:** a member can sweep points and infer which authors post from
which areas, at ≥25-mile resolution. That is bounded by what `profiles_public` already gives away for
free. If the owner ever makes `city` private, this must be revisited — recorded here so that link is
not lost.

**A mistake the sentinel caught.** My first draft put `origin_lat`/`origin_lng` on `posts` and revoked
SELECT on those two columns. The next replay failed:
`has_column_privilege('authenticated', 'posts', 'origin_lat')` was still TRUE, because `authenticated`
holds a TABLE-level grant on `posts` and **a column revoke cannot subtract from a wider grant** —
which 0191 recorded in its own header. Revoking table-level SELECT on the busiest table in the schema
to re-grant every other column was too large a blast radius, so the coordinate moved to a side table
no member role can read at all. Better outcome than the original plan, arrived at by being caught.

**And a second one:** I named the sentinel `post_origin_private()`. `klimr_readiness()` discovers
checks by the `_intact` suffix, so it was never discovered, the count stayed at 29 against a floor of
30, and `klimr_ready` failed with **no individual check failing** — the count mechanism doing exactly
what 0223 built it for.

**Evidence (Executed-local).** Replay 250 applied / 0 failed; RLS negative 26/26; concurrency pass;
`klimr_ready` **30/30**. Acceptance: distance discriminates (1 post within 60mi of LA, the Phoenix one
excluded); the 250-mile cap holds; a 1-mile probe cannot narrow below the 25-mile floor; a member is
DENIED reading a coordinate yet can still call `posts_within`; own-author posts are never
distance-filtered out. tsc 0, eslint 0 (137), vitest 282/282. Size ratchet held at exactly 515 by
moving the photo conditional into the module that owns photo handling and inlining a single-use
variable — not by raising the number. **Not production-verified.**

**Owed:** existing posts have no origin row, so they will not appear in the nearby lane until
re-posted. A backfill from author ZIPs is straightforward and has NOT been written — say the word.

### 2026-08-10 — Concurrency cluster begins: KRA-032, KRA-038

**KRA-032 — the sweep measured the wrong clock.** `end_stale_court_sessions` filtered on
`created_at`, so a session created a week ago and RESTARTED five minutes ago was older than the
twelve-hour cap and ended immediately. `restartSession` exists precisely so an organiser can reuse a
session, and `court_sessions.activated_at` already recorded when that happened — the sweep never
looked at it. The failure mode is the bad kind: play stops mid-session and the audit row says
"Expired automatically after 12 hours", giving the organiser no way to tell that the number in that
sentence was measured from the wrong event. Acceptance proves both directions on the same row.

**KRA-038 — a lost update, reproduced.** `recompute_player_points` read the rolling-best-8 total and
then upserted it with nothing serialising the pair. Two matches finishing for the same player and
sport at once both read the pre-existing ledger, both compute a total omitting the other's row, and
the second write wins.

**This is the strongest evidence produced in this whole remediation, because the bug was reproduced
rather than reasoned about.** Two concurrent transactions, each inserting a 50-point row and then
recomputing:

| | ledger rows | stored total |
|---|---|---|
| **without the lock** (control) | 2 | **50** |
| **with the lock** (0251) | 2 | **100** |

Nothing errors in the broken case. The upsert succeeds; it just succeeds with a number computed from
a stale read, and a player quietly loses points. A concurrency test that passes without the fix proves
nothing, so the control was run first.

The lock is per (player, sport), not global — two players' recomputes are genuinely independent and
must not queue behind each other — and it is taken BEFORE the read, because the contended window is
between the read and the upsert. The sentinel asserts that ordering, not merely the lock's presence.

**Seventh vacuous-slice.** The KRA-032 guardrail sliced to `m.indexOf("KRA-038")`, which matches the
file HEADER above the function, producing an empty string that satisfied every content assertion.
Fixed to the section banner, and the length check now precedes the content checks in this block. The
running tally of my guardrails that asserted something adjacent to the property: an import line, a
`limit 1` sample, a LIKE wildcard, an unbounded slice, an explanatory comment, a no-op negative
control, and now a header collision.

**Evidence (Executed-local).** Replay 251 applied / 0 failed; RLS negative 26/26; concurrency pass;
`klimr_ready` 31/31. tsc 0, eslint 0 (137), vitest 284/284.

### 2026-08-10 — OWNER DIRECTIVE: points are currency (D-35, migration 0252)

*"Points should be treated like banking credits… never lost… must be traceable so if any error occurs
it must be recoverable. Users might get sponsorships and other benefits… treat it as important as
currency."*

**The architecture was already right, which is why this is enforcement rather than redesign.**
`queue_points` and `tournament_points` are event ledgers with idempotency keys
(`UNIQUE(match_id,user_id)`, `UNIQUE(division_id,user_id)`) and real provenance; `player_sports.points`
is a rolling-best-8 **projection**, not a stored balance. Points are earned and age out, never spent,
so there is no double-spend problem — the hard requirements are integrity of history and
reconstructability of the projection. Four things were missing.

| Gap | Was | Now |
|---|---|---|
| **Destruction** | `tournament_id`/`division_id` **ON DELETE CASCADE** — deleting one tournament deleted every credit earned in it, for every player, silently | `ON DELETE RESTRICT`: a tournament with awarded points cannot be deleted until they are voided |
| **Rewriting** | nothing stopped an UPDATE of `points`, `user_id` or `earned_at` | append-only trigger freezes amount and identity; only void fields may move |
| **Reversal** | the only undo was DELETE — the one operation that loses history | `void_points_entry()` marks the row dead with actor + reason, retains it forever, recomputes immediately |
| **Reconciliation** | nothing compared projection to ledger; drift was silent and permanent | `points_balance()` is the one definition, `points_drift()` reconciles, `rebuild_all_player_points()` recovers |

**Void-flags, not negative entries — and this is a design decision, not a shortcut.** Double-entry
systems reverse by posting a compensating amount, which is right for a BALANCE. Here the projection is
"best 8 of the last 52 weeks", so a −120 row would be ranked among the best-8 candidates and corrupt
the very computation it was meant to correct. Voiding preserves the row in full, excludes it from the
window, and produces the same audit trail a reversal entry would.

**Erasure is the one permitted deletion**, because the right to erasure outranks ledger permanence,
and it must declare itself via `klimr.points_erasure` so it can never happen as a side effect.

**Acceptance — 14/14, on a live fixture with preconditions asserted.** Baseline 120 → source stamped →
tournament delete **REFUSED** with the credit intact and still traceable → amount edit **REFUSED** →
delete **REFUSED** → void succeeds, row retained with reason, projection drops to 0 → un-void
**REFUSED** → drift injected (777) → **detected** → rebuilt → **drift 0** → erasure works when it
declares itself.

**Two corrections found by running it.** The first `SET NULL` design *appeared* to protect the credit,
but only because `tournament_id` is NOT NULL and the cascade errored — accidental protection reported
as a column constraint rather than a policy. RESTRICT makes the same outcome deliberate and legible.
And my 0251 sentinel broke here: it pinned the literal string `select coalesce(sum(points)` inside
`recompute_player_points`, which now delegates to `points_balance()`. It correctly noticed the shape
changed and wrongly reported a regression while the invariant held — a check pinned to an
implementation detail fails on a refactor and passes on a rewrite that breaks the property. Redefined
against the property: the lock must precede whatever reads the ledger.

**Evidence (Executed-local).** Replay 252 applied / 0 failed; RLS negative 26/26; concurrency pass;
`klimr_ready` 32/32. tsc 0, eslint 0 (137), vitest 287/287. Negative control (restoring the CASCADE)
observed failing. **Not production-verified.**

**Owed, and it matters for a currency system:** `points_drift_count()` is not yet wired to an alert or
to the nightly tick, so reconciliation exists but nobody is watching it. That is the difference
between having a control and running one, and it should be the next step here.

### 2026-08-10 — The silent-failure detector was itself a silent failure (KRA-040, D-35)

Wiring `points_drift_count()` into `klimr_health()` — the "owed" item from D-35 — required calling
`klimr_health()`. **It threw.**

`klimr_health()` (0227) queries `public.notification_outbox` and `public.waitlist_offers`. **Neither
table exists.** The real names are `social_outbox` and `tournament_waitlist`, and the latter has no
expiry column at all, so the original assertion could not have been written against it.

plpgsql resolves table names at EXECUTION, not at creation. So the migration applied cleanly, the
replay reported success, `pg_get_functiondef` returned a perfectly well-formed function, and every
call since 0227 raised `relation "public.notification_outbox" does not exist`. `klimr_healthy()`
propagated the error rather than returning false, so even a caller checking the boolean got an
exception instead of an answer.

**KRA-040 reports that nothing schedules, exports or alerts on the canaries. The truth is worse: they
had never run.** The function built to detect silent failures was one — and it is the purest example
in this entire remediation of the difference between a control that exists and a control that works.
Nothing found it because nothing had ever called it: not CI, not the replay, not the readiness gate.

Repaired against the real schema, and the health function now covers **points projection drift**
(threshold zero — there is no tolerable amount of "the ledger and the balance disagree"), **stuck**
and **abandoned** storage deletions kept separate so the actionable number cannot hide inside the
tolerable one, and a waitlist question the schema can actually answer.

**A cycle I created, and the rule it produced.** My first sentinel asserted the fix by EXECUTING
`klimr_health()` — reasoning, correctly, that only running it proves it runs. That hung the replay:
readiness discovers every `*_intact()` function, `klimr_health()` calls `klimr_ready()`, and
`klimr_ready()` calls readiness again. **A check that participates in the graph it checks cannot
execute that graph.** It now uses `to_regclass` to assert every named table exists — which catches
precisely this defect class without recursing — and execution is proven from outside, in the
acceptance suite.

**Acceptance (Executed-local), the full loop:** health green → drift injected (4242) → canary **red**,
with `run rebuild_all_player_points()` in the detail → recovery run → canary **green** → and the
abandoned-deletion canary fires while the stuck one stays green, proving they are independent.

**Evidence.** Replay on a freshly initialised cluster: 253 applied / 0 failed; RLS negative 26/26;
concurrency pass; `klimr_ready` 33/33. tsc 0, eslint 0 (137), vitest 290/290.
An earlier run showed failures from migration 0049 onward — that was a cluster corrupted by processes
I had killed during the recursion hang, not the migration; rebuilding from scratch cleared it, which
is why the clean-cluster number is the one recorded.

**Eighth prose-not-code guardrail:** my own assertion matched the comment explaining the old table
names. Comments stripped.

### 2026-08-10 — KRA-040 completed: the canaries have a caller

Repairing `klimr_health()` (0253) and leaving it uncalled would have been the same defect one step
along. This remediation has now found that exact shape five times — both cron routes (KCDX-039), the
CSAM scanner (KRA-005), `withPrivileged` (KRA-017), `klimr_health` itself, and the drift check added
hours earlier. **Building a control and not running it is the single most repeated failure in this
codebase.**

`lib/health-watch.ts` runs on the **existing** every-minute tick alongside the jobs worker and the
storage drain — a new cron entry is a new thing that can be silently broken, which is precisely how
both existing routes spent their entire lives never executing.

**Alerts fire on TRANSITIONS, not on state.** A subsystem unhealthy for a day would otherwise produce
1,440 identical notifications, and the first thing anyone does with that is mute the channel — taking
the next real alert with it. Same "a canary that cries wolf gets muted" failure the design log
records, arriving through volume rather than a bad threshold. Recovery is announced too: when the
alert was "the ledger and the balance disagree", knowing it is fixed matters as much as knowing it
broke.

`health_state.since` moves **only when the state flips**, so it measures how long a condition has held
rather than how long ago we last looked. Rewriting it every tick would report a three-day outage as
one minute — proven by backdating it three hours and confirming a snapshot leaves it alone.

**Acceptance (Executed-local), 7/7:** 9 canaries recorded → a repeat snapshot yields **0 transitions**
→ injected drift transitions **exactly once** → `failing_for` survives a snapshot → recovery is itself
a transition and clears the list → members are DENIED the state table → sentinel green. A pleasing
emergent result: injecting drift failed *both* `points.projection_drift` and `schema.boundaries`,
because `points_ledger_intact()` includes the drift count — and both recovered together.

**Another function that compiled and could not run.** `record_health_snapshot` returned columns named
`subsystem`/`ok`/`detail`, which are also columns of `health_state`, so `on conflict (subsystem)`
raised "column reference is ambiguous" — on every call, while the migration applied cleanly. Found the
same way the dead `klimr_health()` was found one migration earlier: by calling it. Resolved with
`#variable_conflict use_column`. **A function that compiles is not a function that runs**, and that
sentence now has three separate proofs in this session.

**Evidence.** Replay 254 applied / 0 failed; `klimr_ready` 34/34. tsc 0, eslint 0 (137), vitest
293/293. Negative control (alerting on state instead of transitions) observed failing.
**Not production-verified** — the tick's behaviour here is proven at the SQL boundary; that it fires
in production depends on the cron entry, which is exactly what KCDX-039 got wrong before.

### 2026-08-10 — KRA-039: a team always has an owner

`removeMember` read the actor's and target's roles, checked them, and then issued a **service-role**
delete keyed only on `(team_id, user_id)` — no lock, and no `role <> 'owner'` predicate on the delete
itself. Between the read and the write the target could be promoted, or two managers could act at
once, and the sole owner was stripped. The result is a team nobody can administer: ownership cannot be
transferred, settings cannot be changed, and there is no path back through the product.

**Fixed as a trigger, not as a better read.** Adding a predicate to that one delete fixes that one
caller. The invariant is "a team has at least one owner" and it must hold for the admin console, a
support script, a future bulk tool and any migration. This remediation has already found **five inline
copies of the block rule** that drifted apart because each surface re-implemented it — a rule enforced
at the table is the version that cannot drift. The command is the ergonomics; the trigger is the
invariant, and the delete's own `role <> 'owner'` predicate is the belt that makes a stale read
harmless.

**Acceptance:** deleting the last owner **REFUSED** (`team_must_have_an_owner`); demoting the last
owner **REFUSED**; with a second owner both become legal (no over-correction); a manager removing a
peer manager **forbidden**; removing an owner returns **transfer_first**; removing an ordinary member
**removed**.

**Two of my test's assertions were wrong, not the code** — an earlier step had promoted the actor to
owner, so "manager removes peer manager" was never exercised and the follow-up target had already
been removed. Re-run on a clean fixture with the actor's role asserted as a precondition first, which
is the habit this session has had to learn repeatedly: assert the fixture before believing the result.

**Evidence (Executed-local).** Replay 255 applied / 0 failed; `klimr_ready` 35/35. tsc 0, eslint 0
(137), vitest 296/296. Negative control (removing the delete predicate) observed failing.

### 2026-08-10 — KRA-033: migration written, **NOT VERIFIED — DO NOT PASTE 0256**

**Disposition: `IN PROGRESS`, not fixed.** 0256 exists, applies cleanly (256 applied / 0 failed,
`klimr_ready` 36/36), and its acceptance test **failed**. Recording that plainly rather than shipping
a green migration count as if it were a working fix.

**The finding is confirmed and is three defects, not one.** `enrollInSession` reads the session, the
class, the existing enrollment, then COUNTS active enrollments, then writes — with no lock between
the count and the insert:
1. **Overbooking.** Two members racing the last seat both count `cap - 1` and both insert. The unique
   key is `(session_id, user_id)`, so it cannot see a capacity breach — nothing errors, and a coach
   finds out when too many people arrive.
2. **A recorded payment erased.** Re-activating a cancelled enrollment recomputes `payment_status`
   from `cls.is_paid`. A member who had PAID, cancelled and re-joined came back as `pending`, or as
   `not_required` if the coach had since made the class free — erasing the record that money changed
   hands. Under the owner's currency directive this is the more serious half.
3. **Unchecked writes.** Both the insert and the update discard `{ error }`, and supabase-js does not
   throw, so an RLS refusal produced a cheerful "you're signed up" notification and no enrollment.

**What the acceptance test showed, and why I am not claiming a fix.** Two concurrent callers for a
session with capacity 1 produced **2 enrolled rows, 0 waitlisted** — the race is NOT closed. The same
run also returned `payment_status = 'not_required'` for a class with `is_paid = true`, which means
`v_is_paid` was falsy inside the function.

Diagnostics so far, all Executed-local:
- exactly **one** `class_enroll` overload exists, signature `p_session uuid` — not the 0243/0245
  overload trap;
- `pg_get_functiondef` confirms the deployed body contains `c.is_paid`;
- the **identical SELECT INTO, run standalone in a DO block against the same fixture, returns
  `cap=1, paid=t`** — so the SQL is right and the join is right;
- yet the same statement inside the function yields neither the capacity nor the paid flag.

**I do not yet have an explanation, so the honest label is unverified.** The plausible remaining
causes are a SECURITY DEFINER ownership/RLS interaction in the harness that does not match production,
or something about the record variable that I have not isolated. Either way the contract is explicit:
"fixed" requires the required tests to pass, and they do not.

**Action: 0256 must NOT be pasted.** It is inert in the sense that nothing calls `class_enroll` yet —
the app still uses the original path — so the tree is safe, but the migration should not ship until
the race test passes. `enrollInSession` is deliberately left on its original code path rather than
routed to an unverified command.

**Next step when resumed:** instrument `class_enroll` with RAISE NOTICE on `v_cap`/`v_is_paid`
immediately after the SELECT INTO, run it under the same authenticated caller, and compare against
the standalone DO block that works. The difference between those two contexts is the whole bug.

### 2026-08-10 — KRA-033 CORRECTION: my earlier failure claim was not sound either

The previous entry stated "the race is NOT closed" as a finding. **That conclusion does not hold**,
and correcting an overstated failure matters as much as correcting an overstated success — both are
the same error, which is reporting a result the evidence does not support.

**What is now established (Executed-local, instrumented).** `class_enroll` was replaced in-session
with a byte-identical body plus `RAISE NOTICE` after each step and called as a real authenticated
caller. It reported:

```
AFTER_SELECT class=8888… cap=1 paid=t
AFTER_COUNT  taken=0 cap=1
DECIDED      status=enrolled payment=pending
```

So the logic is correct: the capacity is read, the paid flag is read, the seat count is right, and the
first caller is `enrolled/pending` — not the `not_required` the failing run reported. Supporting
checks: exactly one `class_enroll` overload; `pg_get_functiondef` matches the migration byte for byte;
the same query in a standalone DO block and in a probe function returns `cap=1 paid=t` under BOTH a
superuser and an `authenticated` caller, so this is not an RLS or definer-ownership effect.

**Which means the failing race run contradicts itself.** It reported `payment_status = 'not_required'`
for a class the instrumented run proves yields `pending`. Both cannot be true of the same code, so the
fixture in that run was not what the script claimed — most likely the `classes` insert did not land as
written. A test whose fixture is wrong can produce a false PASS or a false FAIL, and this session has
now produced both; the "2 seats sold" result is therefore **untrustworthy in both directions**. I
cannot say the race is closed, and I can no longer say it is open.

**Disposition unchanged: `IN PROGRESS`, DO NOT PASTE 0256.** Not because it is known broken — because
it is **unverified**, and that is the only claim the evidence supports. `enrollInSession` stays on its
original code path; nothing calls `class_enroll`, so the migration is inert.

**Blocker: the replay harness became unstable.** Successive from-zero replays now lose the server
partway through — the harness's own end-of-run probes report `search_zero_rate_callable=NO`, so this
is the harness and not these migrations. Verification needs a fresh container. Everything before this
point in the session was verified while it was healthy.

**When resumed, one run settles it:** rebuild the container, run the race with the class row's
`is_paid` and the session's `capacity` asserted as preconditions BEFORE the concurrent calls — which
the corrected `/tmp/race.sh` already does — and read `SEATS`/`WAITLIST`. If the preconditions print
`cap=1 paid=t` and seats stay at 1, KRA-033 closes.

**Repo hygiene confirmed:** all instrumentation lived in `/tmp` only; `0256` contains no
`RAISE NOTICE` and no probe function, and the tree is tsc 0, eslint 0 (137), vitest 296/296.

### 2026-08-10 — KRA-033 RESOLVED: two correct controls colliding

**First, the harness.** The "instability" recorded earlier was mine: stray `postgres` processes left
by the commands I killed during the recursion hang. Clearing them and re-initialising gave a clean
replay (`search_zero_rate_callable=yes`), and every result below comes from that healthy harness.

**The root cause.** 0201 added `guard_enrollment_insert`, a BEFORE INSERT trigger pinning
`status := 'enrolled'` and `payment_status := 'not_required'` unless the caller is the provider or
`service_role`. That control is right and necessary — the INSERT policy only checks identity, so
without it a learner could POST themselves in as `attended`/`paid`.

`class_enroll` is SECURITY DEFINER, so inside it `current_user` is the owner (`postgres`) and
`auth.uid()` is the LEARNER. The guard fired and overwrote both values the command had just computed
under a lock. **The seat maths was correct all along and its verdict was discarded a moment later** —
which is exactly why the race looked open and why a paid class stored `not_required`.

Neither control was wrong. Two correct controls disagreed because each was written without the other
in view, and the newer one lost silently. Same family as the block predicate reimplemented five times,
approached from the opposite side: not a rule copied and drifted, but two rules colliding on one row.

**The fix, and the one I rejected.** Exempting `current_user = 'postgres'` would have worked and would
have exempted **every** definer function, present and future, including ones written later by someone
unaware this trigger exists — converting a targeted control into a blanket one. Instead the command
announces itself with `set_config('klimr.enrollment_command', 'on', true)`, transaction-scoped, the
same mechanism as `klimr.points_erasure` and `klimr.privileged_write`. A learner calling PostgREST has
no way to set it. The negative control restores the blanket bypass and the guardrail goes red.

**Acceptance (Executed-local), all three directions:**

| | result |
|---|---|
| Race, capacity 1, two concurrent callers | **SEATS=1 WAITLIST=1** |
| Paid class | `enrolled/pending` — the `not_required` bug is gone |
| Learner inserts `attended/paid` directly | **still pinned to `enrolled/not_required`** |

**On the two corrections this took.** I first reported the race as open, then withdrew that as
unverified, and only now can state it closed. The withdrawal was right on the evidence available at
the time: the instrumented run (which replaced the function, and therefore dropped the trigger's
effect from view) disagreed with the race run, and I could not explain which was true. What resolved
it was not more reasoning but a clean harness plus a fixture that PRINTS its preconditions — `cap=1
paid=t` — before the calls it is testing. Three claims, two withdrawn, one verified: the record shows
all three because the sequence is the useful part.

**Evidence.** Replay 257 applied / 0 failed; RLS negative 26/26; concurrency pass; `klimr_ready`
37/37. tsc 0, eslint 0 (137), vitest 300/300. Negative control observed failing.
**0256 and 0257 must be pasted together** — 0256 alone reproduces the collision.

### 2026-08-10 — KRA-034: a dispute I nearly filed, and why it would have been wrong

**I almost recorded this finding as a phantom.** `capacity_mode` and `capacity_unit` are not columns
on `tournaments` — verified against the live schema, which carries only `capacity` and `entry_type`.
One more step and this register would contain a confident, wrong dispute.

They are keys inside the `format_config` JSONB, read by `app/tournaments/actions.ts:963` and four
other surfaces. The audit cited the UI model, and the UI model was right. Recording it because
"the column does not exist" *felt* like proof and proved only that I had looked in one place — the
same shape as every fixture error this week, arriving in a dispute instead of a test.

**The real drift.** `capacityBlock()` implements four combinations — pooled/per-division × team/person.
`tournament_register` implemented one: it counted registrations, and scoped to a division only when a
division id happened to be supplied (`coalesce(v_div_cap, v_t.capacity)` is a fallback, not a mode).

So a **person**-unit tournament counted teams — a doubles pair filled one seat of a draw measured in
people — and a **pooled** tournament with divisions counted per-division whenever the registrant
picked one. The UI refused correctly; the command admitted the registration. **The check that can be
bypassed was right and the check that cannot be bypassed was wrong**, which is the worse arrangement
of the two.

The excluded-status sets also disagreed: the command excluded `waitlisted`, the UI did not. Kept the
command's version — a waitlisted entry does not occupy a seat, which is what waitlisted means.

**Acceptance (Executed-local), both modes, both directions:**

| Configuration | Result |
|---|---|
| person unit, pooled, capacity 2 | R1 `pending`, R2 `pending`, **R3 `waitlisted`** |
| per_division, division cap 2, pooled cap 1 | D1 `pending`, D2 `pending`, **D3 `waitlisted`** |

The second case is the sharper one: the pooled capacity of 1 correctly did **not** apply, proving the
mode is honoured rather than the old `coalesce` fallback.

**Ninth prose-not-code guardrail, caught by its control.** My first assertion matched
`tournament_registration_players` — which the migration's own header comment mentions — so removing
the table from the query left the test green. Then my *negative control* was wrong too: it replaced
the `from` clause while the assertion had moved to the `join`, so it changed something the test did
not check. Both fixed; the control now removes the join and the guardrail goes red.

**Evidence.** Replay 258 applied / 0 failed; `klimr_ready` 38/38. tsc 0, eslint 0 (137), vitest
302/302. Negative control observed failing after two corrections to the control itself.

### 2026-08-10 — KRA-035 verified; KRA-036 code-complete but UNVERIFIED

**A bookkeeping failure of mine, found by reading the disk rather than my notes.** Migrations 0259
(KRA-035) and 0260 (KRA-036) already existed in the repo, written earlier in this session and never
recorded in this register. I only noticed because I started writing 0259 a second time and found the
file. Two consequences worth stating: the register was NOT a complete record of the work, and a
replay reporting "260 applied" was the only thing that would have told anyone. The register is the
durable artifact — if it disagrees with the disk, the disk is right and the register has failed at
its one job.

**KRA-035 — verified.** `tournament_register` inserted the captain inside its locked command and the
caller then bulk-inserted the rest of the roster outside that transaction with `{ error }` discarded.
Three silent outcomes: a **duplicate captain** (no unique key existed on
`(registration_id, user_id)` — verified), a **silently one-player entry** if the second insert failed,
and — because `tournament_points` is awarded per registration player — **points credited to the wrong
people**, which under D-35 is a currency error rather than a cosmetic one.

0259 takes the roster as an argument, adds the missing unique index after de-duplicating (keeping the
non-reserve row where someone appears as both), and re-checks every listed player is a real member of
the entered team. Acceptance with a roster containing the captain AND a non-member: **2 players,
captain exactly once, stranger rejected, sentinel green.**

**KRA-036 — code complete, acceptance NOT run.** 0260 exists, applies cleanly, and `applyStartNext`
is wired to `queue_start_next` with every error code mapped. But **the concurrent race test has not
executed**: my fixture used invented table names (`court_session_courts`, `court_queue_teams`,
`court_matches`) where the schema has `queue_courts`, `queue_teams`, `queue_matches`. Correcting the
names still produced an empty fixture, meaning further column mismatches remain.

**So KRA-036 is NOT claimed as fixed.** The code reads correctly and the reasoning is sound, but
"reads correctly" is precisely the evidence standard this remediation exists to reject — the same
standard that let `klimr_health()` throw for months and `class_enroll` be silently overwritten by a
trigger. It stays CODE COMPLETE until a race test runs.

**The harness is degrading again** under repeated from-zero replays in one container — the same
symptom as before, cleared once by removing stray processes and now recurring. Verification of
KRA-036 needs a fresh container.

**Next step, precisely:** read `queue_courts` / `queue_teams` / `queue_matches` column definitions
from `information_schema` FIRST, build the fixture from that, assert `queued=4 live=0` as a printed
precondition, then run two concurrent `queue_start_next` calls and assert `LIVE_MATCHES=1` and
`PLAYING=2`.

**Evidence for this entry.** Replay 260 applied / 0 failed; `klimr_ready` 40/40; KRA-035 acceptance
as above. tsc 0, eslint 0 (137), vitest 308/308.

### 2026-08-10 — KRA-036 VERIFIED: the race runs, and the test can fail

Last entry recorded this as CODE COMPLETE because the race test had never executed. It has now.

**What unblocked it: reading the schema instead of assuming it.** My fixture used
`court_session_courts`, `court_queue_teams`, `court_matches` — none of which exist. Correcting the
table names still gave an empty fixture because the COLUMNS were invented too: I had written `name`
and `position` on `queue_teams`, which actually carries `status`, `wins`, `hold_court`, `queued_at`.
The definitions were sitting in `0081_court_queue.sql` the whole time, and reading them took one
command. Three failed runs preceded that one command.

**Result, precondition printed first:**

```
PRECONDITION queued=4 live=0
LIVE=1  PLAYING=2  STILL_QUEUED=2  CONSISTENT=yes
```

Two concurrent operators — a Courtside tablet and the organizer's phone, the ordinary setup —
produced exactly one live match, both its teams marked `playing`, the other two left `queued`, and no
inconsistency between match state and team state.

**Negative control, and it matters here.** The DB already had
`queue_matches_one_live_per_court`, a partial unique index, so "LIVE=1" alone would have proven
nothing — the index guarantees it regardless of the fix. The finding's real failure is a live match
whose teams still read `queued`, so the control simulates exactly that: insert a match and never land
the team update. It returns `CONSISTENT=NO` while the real command returns `yes`. **Without that
control this test would have been another green result that measured a pre-existing constraint.**

A second control on the guardrail (removing the session lock) also fails correctly.

**Evidence.** Replay 260 applied / 0 failed; race and negative control as above. tsc 0, eslint 0
(137), vitest 311/311.

**Harness note:** the container's Postgres is now unreliable across repeated from-zero replays —
several attempts timed out or lost the socket before this run succeeded. The results above come from
a run that completed cleanly end to end; anything further needs a fresh container.

### 2026-08-10 — KRA-021 and KRA-041 (no database required)

Both fixed without the replay harness, which is now unreliable in this container. Recording that
constraint alongside the work: these two are code-level and their evidence is `tsc`/`eslint`/`vitest`
plus negative controls, not a SQL acceptance run. Neither claim depends on the database.

**KRA-021 — one event, two notifications.** `app/network/actions.ts` called `createNotification` at
three sites for connection requests and accepts. 0212's trigger on `friendships` already enqueues
`connection_requested`/`connection_accepted` into `social_outbox`, and `deliver_social_outbox()`
inserts the **identical** notification — same kind, title, body and link. Every connection request
produced two.

The inline call is the one removed, and the reasoning matters: the outbox is trigger-fired inside the
same transaction as the friendship row, it retries, and it delivers even if the request dies between
the RPC and the notification. The inline call is the one that can silently not happen. Removing it
also left `myName()` unused — worth noting because the outbox reads the display name in SQL at
DELIVERY time, which is more correct anyway: the name as it stands when the notification is sent,
rather than as it stood when the request was made.

**KRA-041 — a boot probe that could hang forever.** `assertSchemaCurrent()` runs from
`instrumentation.ts`, i.e. during startup, and awaited two Supabase calls with no deadline. A refused
connection was always fine — it errors fast and the existing "inconclusive, continuing" branch handles
it. A **blackholed** endpoint is the case with no handler: it accepts the connection and never
answers, so there is no error to catch and no timeout to hit. The instance never finishes booting and
never reports why; the platform kills it and the logs show a start that stopped mid-sentence.

Both probes now race an 8s deadline — generous on purpose, because this is a cold start rather than a
request path and a slow-but-alive database should still get to answer. What matters is that "never" is
not among the outcomes. The timer is cleared in `finally`: leaving it pending holds the event loop
open and delays the very startup the deadline protects.

Typing note: supabase-js query builders are **thenable but not `Promise`**, so `withDeadline` takes
`PromiseLike`. The timeout branch carries no `data`, which widened the manifest result to `unknown` —
narrowed at the call site rather than by loosening the helper, so a future caller with a different
shape is not silently accommodated.

**Evidence.** tsc 0, eslint 0 (137, at ceiling — removing the duplicates left two dead symbols and
pushed it to 139; deleted rather than absorbed), vitest 315/315. Negative controls on both new
guardrails observed failing. **No database verification** — see the harness note above.

### 2026-08-10 — KRA-027: the surface aimed at strangers disclosed the most

**Evidence caveat first: 0261 has NOT been replayed.** The container's Postgres no longer completes a
from-zero run. The code-side changes are covered by tsc/eslint/vitest and two negative controls; the
migration is reviewed and unverified, and must be replayed in a fresh container before pasting.

**The privacy half.** `people_you_may_know()` returned `neighborhood`, and `pymk-rail.tsx` rendered it
in PREFERENCE to city: `location={p.neighborhood ?? p.city ?? null}`. Everyone in that rail is by
definition someone the viewer is **not** connected to — that is what makes them suggestions. So the
one surface whose entire audience is strangers disclosed the most about them.

`profiles_public` (0233, tightened by 0236) publishes `city` and `state` and deliberately not
`neighborhood`. That is the reference point: whatever a member has agreed to show the world is
available, and nothing past it. A neighbourhood is the difference between "somewhere in Los Angeles"
and a few streets — the same resolution OD-7 kept out of the nearby feed, for the same reason.

The column is **removed from the return type**, not left and ignored by the card. A returned field is
one some future caller renders — which is precisely how this became a rendered field.

0261 also applies the OD-2 ladder (`may_act_on(..., 'request')`), so a suggestion is never offered
with a Connect button the subject would refuse.

**The fail-open half, which was the sharper bug.** Two paths:
1. `validSuggestions` returns null when the validation RPC fails; the code fell through to recompute,
   which is right — but said nothing, so an outage of the guarantee was invisible. Now logged.
2. On RPC failure the function returned `cached.payload` **verbatim** — the up-to-24h-old list, with
   NO validation, at exactly the moment validation was known to be unavailable. **The one moment the
   guarantee mattered was the one moment it was skipped.**

Now it returns an empty rail. A suggestion rail is discretionary: showing nothing costs a member an
empty shelf, while showing a stale one can offer a Connect button for somebody who has since blocked
them. Empty is the correct failure.

**Tenth prose-not-code guardrail.** My assertion sliced to end-of-file and matched the `comment on
function` text and the sentinel's own `parameter_name = 'neighborhood'` check — both of which
legitimately name the removed column. Bounded to the function body; the control now fails correctly.

**Evidence.** tsc 0, eslint 0 (137), vitest 318/318. Two negative controls observed failing (restoring
the fail-open; restoring the column). **No SQL replay.**

### 2026-08-10 — KRA-012: the finding that made every other claim provisional

**Evidence caveat: 0262 has not been replayed.** Same harness limit as 0261. Code-side coverage is
tsc/eslint/vitest plus a negative control; the migration is reviewed and unverified.

Klimr applies migrations by pasting SQL into the Supabase editor, and **nothing recorded that it
happened**. `MIGRATIONS_LEDGER.md` lives in the repo, so it states what somebody believed and typed.

The cost ran through this entire session. Every sentence of the form "production is at 0234" traced
back to a person remembering, and every disposition resting on it inherited that. When the owner
confirmed 0207–0234 applied, the correct evidence label was `Recorded` — someone else's evidence —
and it stayed that way because there was no mechanism that could raise it.

**What 0262 gives, and what it honestly cannot.** From 0262 onward every migration records itself in
`migration_journal` as its final statement — last, so only a migration that reached the end is
recorded. `journal_drift(repo_ids[])` reports both directions: a file in the repo the database never
ran, and a migration the database ran that no file explains, which is the hand-edit-in-the-console
case nobody looks for. A vitest guardrail fails the build for any migration ≥0262 lacking its journal
line, because without that the mechanism decays on the first migration written in a hurry.

**What it cannot do is prove the past.** 0001–0261 ran before the table existed. Writing them in as
though observed would produce a complete-looking journal whose earliest and least verifiable rows are
fabricated — which is precisely the failure KRA-012 describes, reintroduced by its own fix. So the
baseline row is explicit: `applied_by = 'owner-confirmation'`, note reading *"ASSERTED, not
observed"*, and the sentinel checks for that wording. The first machine-observed entry is 0262 itself.

That is a smaller claim than the audit asks for. It is the true one, and it is now written in the
database rather than in a chat log.

**Still open in this finding:** the audit's "seven historical migration files changed in place"
sub-claim remains unverifiable here — no git history in the container and no prior tree to diff
against. Checksums are supported by the journal (`p_checksum`) but not yet supplied by the paste
workflow; wiring that is the natural next step and is not done.

**Evidence.** tsc 0, eslint 0 (137), vitest 321/321. Negative control: an unjournalled migration
`0263_nc_probe.sql` was created, the guardrail named it and failed, and the probe was deleted.
**No SQL replay.**

---

## 2026-08-10 — SESSION HANDOFF (zip rebuilt at owner request)

### Do this first in the next session
1. Extract `klimr-web.zip`, `npm install`, install Postgres 16, rebuild the replay harness.
2. **Replay from zero.** Migrations 0261 and 0262 have NEVER been replayed — the container's Postgres
   stopped completing from-zero runs. Everything through 0260 was replayed clean.
3. Then finish: **KRA-037** (queue placement idempotency — the last unstarted finding).

### Paste order and constraints — READ BEFORE DEPLOYING ANYTHING
Migrations **0235–0262** are new this session. They are numbered in dependency order, but three
constraints do not appear in the numbering:

| Constraint | Why |
|---|---|
| **0235 needs the Courtside iOS batch first** | The tablet app must send `enrollmentCode` instead of `code`. Until it does, existing displays cannot enroll. Fails closed, which is correct, but it IS a break. |
| **0240 must commit before 0241** | Postgres cannot use an enum value in the transaction that adds it (precedent 0172/0173). |
| **0256 and 0257 must go together** | 0256 alone reproduces the guard collision it was written to fix. |

`package.json` and `package-lock.json` both changed (KRA-042) and **must deploy together**, or the
install resolves differently from what was verified.

### Evidence status, stated plainly
- **Replayed and acceptance-tested:** everything through 0260.
- **Reviewed, NOT replayed:** 0261 (KRA-027), 0262 (KRA-012).
- **Static gates at handoff:** tsc 0, eslint 0 (137, at the D-35 ceiling), vitest 321/321.
- **Nothing in this session is production-verified.** Every claim is Executed-local at best.

### Outstanding decisions for the owner
- **OD-4 / KRA-018 tail** — the CSAM backup position needs counsel confirmation before the remaining
  storage-DR work. The researched recommendation and the D-22 amendment are recorded above.
- **Two invite settings** — the 0144 boolean and the ladder's `who_can_invite` were collapsed under
  OD-6; nothing further is owed unless the owner wants the UI simplified to match.

### Known-owed work, not glossed
- `post_origins` backfill for existing posts (OD-7) — they will not appear in the nearby lane until
  re-posted. Needs a script, not a migration, since ZIP→centroid resolution lives in JS.
- `klimr_health()` fires from the every-minute tick; **that the cron entry actually invokes that route
  in production is unconfirmed** — which is exactly what KCDX-039 got wrong before.
- KRA-005's other five upload surfaces (avatars, listings, credential/business/payment evidence).
- KRA-006's command wiring and byte digest.
- KRA-017's breadth: 88 files still take the raw admin client.
- KRA-012's checksum supply from the paste workflow, and the "seven historical files" sub-claim
  (unverifiable without git history).

### The pattern worth carrying forward
Ten guardrails of mine this session asserted something adjacent to the property rather than the
property — an import line, a `limit 1` sample across overloads, a LIKE wildcard matching prose, four
unbounded slices, an explanatory comment, a no-op negative control, and a header collision. **Every
one was found by deliberately breaking the code and demanding the test notice. None was found by
reading the test.** The negative control is not optional.

The counterpart, four times over: `purge_orphan_feed_media`'s signature, a `professional_applications`
table that does not exist, `feed_emit`'s argument list, and three invented queue column names.
**Read the schema; do not recall it.**

---

### 2026-08-11 — INCIDENT: KRA-001 broke Courtside registration in production. Reverted.

**Symptom.** Every Courtside display showed *"This display isn't registered yet — re-enter the code to
set it up."* Owner reported it live, ~5:31 PM, on a session that was otherwise healthy (queue
rendering, 5 teams, live data).

**Cause — mine, and predicted in writing.** The hardened `app/api/courtside/register/route.ts`
shipped to production. It reads `body.enrollmentCode` and calls
`courtside_register(p_secret_hash …)`. Neither half can work yet:

- `lib/courtside-install.ts` sends `code`, so `enrollmentCode` is undefined → the route returns
  **400 `enrollment_required`** → `ensureDeviceToken()` returns null → the display reports itself
  unregistered and cannot record a result.
- Migration **0235 is deliberately unpasted**, so the deployed database still has
  `courtside_register(uuid, text, text, text, text)` expecting `p_code`. Even a correct client would
  have failed on the argument name.

The handoff written hours earlier says exactly this: *"0235 needs the Courtside iOS batch first — the
tablet app must send `enrollmentCode` instead of `code`. Until it does, existing displays cannot
enroll. Fails closed, which is correct, but it IS a break."*

**So the constraint was documented, understood, and still shipped.** That is the lesson, and it is
not "write the constraint down" — it already was. A documented ordering constraint only helps if the
thing it constrains cannot ship without it. Prose in a register does not gate a deploy.

**Fix applied: revert, not forward-fix.** `route.ts` accepts `code` again and calls `p_code`;
`database.types.ts` restored to the deployed signature. Deliberately NOT patched to "accept either" —
a compatibility shim would leave the vulnerable path live indefinitely and quietly, which is how
KCDX-007 left the token mintable in the first place.

**Consequence, stated plainly: KRA-001 is OPEN again.** The public join code can once more mint a
Courtside operator token. That was true before this remediation began, so the system is no worse than
it was — but it is not fixed, and the register now says so.

**The guardrail was pinned to the wrong thing.** The old test asserted the FIX (`route must send
p_secret_hash`), so it passed happily while client, route and RPC signature were out of step, and
failed the moment the revert restored a *working* system. Backwards.

Replaced with one that asserts the **three-way coupling**: `lib/courtside-install.ts`,
`app/api/courtside/register/route.ts` and the `courtside_register` signature in `database.types.ts`
must all be on the same scheme. **Negative control: hardening the route alone — exactly what shipped —
turns it red.** That test would have caught this before deploy.

**To ship KRA-001 properly, all three move in one change:**
1. `lib/courtside-install.ts` → send `enrollmentCode` from the organizer-issued secret
2. `app/api/courtside/register/route.ts` → the hardened version (in git history / this entry)
3. Migration **0235** pasted, plus the organizer UI to issue codes (`issueCourtsideEnrollment`, already
   written and wired in `queue-client.tsx`)

**Unrelated, and worth separating:** the CSP report-only violations are NOT connected. Report-only
cannot block anything, and the enforced policy still carries `'self' 'unsafe-inline'`. Different
issue, no interaction.

**Evidence.** tsc 0, eslint 0 (137), vitest 321/321 after the revert. Negative control reproducing the
incident observed failing.

### 2026-08-11 — Incident correction: 0235 WAS deployed, so the route revert alone was wrong

Owner then reported **all migrations through 0262 are deployed**. That inverts the diagnosis I gave an
hour earlier and is worth recording as a correction rather than an edit.

0235 does `drop function if exists public.courtside_register(uuid, text, text, text, text)` and
recreates it with `p_secret_hash`. Both forms have identical argument TYPES, so the drop replaced it:
**the deployed database now has only the secret-hash form.** My route revert sends `p_code`, and
PostgREST resolves RPCs by argument NAME — so the reverted app alone would still fail, with
"function does not exist" instead of a 400. Same outage, different error.

**Note that the outage is consistent with EITHER ordering** — app-hardened-first, or
migration-pasted-first. Both leave the three pieces out of step, which is exactly why the replacement
guardrail asserts the coupling rather than either end of it.

**0263 restores the `p_code` form** and drops the secret-hash form first, so no two functions with
identical argument types survive together — 0214 and 0243 both record what happens when a vulnerable
overload lives beside its replacement and the caller picks.

**KRA-001 is OPEN.** The public join code can mint an operator token again, and the rollback comment
names the specific regression it reintroduces: clearing `revoked_at` on re-register lets a revoked
device re-enroll itself with a public code.

**Kept deliberately:** `courtside_enrollments`, `courtside_issue_enrollment`, and the organizer's
"Get a display code" button. Inert without a client that uses them, and most of the work already done
for shipping KRA-001 properly.

**VERIFICATION GAP, stated plainly.** 0263 has **not been executed**. The container's Postgres no
longer starts at all — not the replay harness, not a fresh `initdb`. What was checked: dollar-quoting
and quote balance (balanced once comment apostrophes are excluded), drop-before-create ordering, and
the session predicate compared line-for-line against the deployed 0184 original it restores. That is
static review, not proof. **Paste it inside `begin; … rollback;` first if you want certainty before
committing** — a syntax error then costs nothing.

**Also unrelated, and now confirmed by the second screenshot:** the CSP violations at 5:31 PM come
from `KlimrCourtside/1.0` on `/q/JC2ETF/1` — the Courtside app itself. Still `csp://report-only`.
Report-only **cannot block anything**; the enforced policy in `next.config.ts` still carries
`'self' 'unsafe-inline'`, which permits those chunks. The display failed because registration
returned an error, not because a script was blocked. Two independent problems that happened to
surface in the same ten minutes.

### 2026-08-11 — Feed regression: I emptied the default lane, and photos stopped publishing

Reported as *"when I post something on the feed, it doesn't show up in the actual feed."* **Two
independent causes, both mine, both from this remediation.**

**Cause 1 — unknown origin treated as "far away" (fixed in 0264).** 0250 gave the ranker a real
`nearby` scope and the Feed page began passing `p_scope = 'nearby'` for the DEFAULT lane. The distance
predicate required a `post_origins` row. Origins are stamped at write time and **the backfill was
never run** — it was recorded as owed and then not treated as blocking. Every pre-deploy post has no
origin, the predicate is false for all of them, and the default lane collapsed to "my own posts plus
my connections'".

The defect is the semantics, not the missing backfill. **"We do not know where this came from" is not
"this is far away."** A post is now excluded only when it HAS an origin outside the radius; unknown
origins stay visible, so the lane degrades gracefully instead of emptying. That also makes the
backfill a quality improvement rather than a prerequisite — the right shape for any derived-data
feature, and what I should have written the first time.

**Also fixed: the counts and the ranker disagreed again.** The page passed `'all'` to
`feed_type_counts` while passing `'nearby'` to the ranker — a number above a filter describing a
different feed. That is precisely the defect KRA-029 was raised about, reintroduced by me when the
nearby lane landed, three days after I wrote the entry explaining why it mattered. The single-argument
`feed_type_counts(text)` is dropped so a stale caller fails loudly.

**Cause 2 — every photo post is held for review. NOT fixed; this is the owner's call.**
`CSAM_SCAN_PROVIDER` defaults to `none`, and `scanForKnownCSAM()` then returns `blocked` by design.
KRA-005 wired that scanner into the Feed, my seam maps `blocked` → `undecided` → `moderation_error`,
which is in `GATE_DOWN`, which resolves to **`pending`** — invisible to everyone but the author.

The behaviour is exactly what KRA-005 specified: never publish unscreened media. The consequence in a
deployment with no scanner configured is that **photo posting is silently switched off**. My entry at
the time said "fail-closed means never publishes, not always rejects" — true, and I did not follow it
through to "with no provider configured, never publishes means never." Three options, all the owner's:

1. **Configure a provider** (`CSAM_SCAN_PROVIDER=webhook` + `CSAM_SCAN_WEBHOOK_URL`) — the intended
   end state; photos publish once screened.
2. **`SAFETY_DEV_BYPASS=true`** — the file says explicitly "local development ONLY, never in
   production". Not recommended, and named here only so the option is not hidden.
3. **Accept photos held** — safe, but photo posting does not work, and the author is not clearly told.

### 2026-08-11 — B-01 confirmed by machine evidence: the storage backup has never run

`storage-backup #2` failed in 16s at `storage-backup.sh: line 72: PGURI: set PGURI` — the
`: "${PGURI:?set PGURI}"` guard. The GitHub Actions secret is not configured, so **the workflow has
never produced a backup**. KRA-018 and blocker B-01 said there was no run evidence; there is now
positive evidence of the opposite, which is better than an absence.

The script's own guard did its job — it refused to run half a backup. Set `PGURI` (plus the rclone
remotes) in repository secrets, then the FIRST run is a test, not a backup: B-02 (restore drill)
remains untouched and is the blocker that actually matters.

### 2026-08-11 — CI `gates` failing on the Dependabot PR

`schema-replay` **passes**; `gates` fails after the build ("route table not found" means the build log
never contained the route table, i.e. the build itself failed). The ten annotations are pre-existing
`jsx-a11y` warnings, not the cause.

**Do not merge that PR as-is.** It bumps 24 packages and would overwrite the KRA-042 security work:
the exact `next` pin at 16.2.12 (the Server-Action DoS fix) and the `postcss`/`sharp`/`nanoid`
overrides that took `npm audit --omit=dev` from 4 high to 0. Re-run it after this branch lands so it
rebases onto the pins, and check `npm audit --omit=dev` still reports 0 before merging.


---

## 2026-08-12 — Session 9 continuation: 0263/0264 verdicts, 0265–0267, KRA-037

**0263 — verified correct.** Executed-local, from-zero replay + full acceptance: one
`courtside_register` form (the `p_code` shape), anon/authenticated denied,
service_role granted, `ON CONFLICT (install_id)` backed by a real unique index,
join and display codes register case-insensitively, wrong code refused with no
row, ended session refused, revoked device re-enrolls with `revoked_at` cleared —
the documented KRA-001 cost, confirmed behaving exactly as documented.
`journal_migration` returns void: the `NULL` the owner saw pasting 0264 is the
expected success output.

**0264 — verified WRONG; fixed by 0266.** Its predicate reads `post_origins`
directly inside two INVOKER functions; 0250 revoked that table from members, and
the executor checks all relation privileges up front. At the 0264 head, every
member call to `get_ranked_feed` and `feed_type_counts` raises "permission denied
for table post_origins" — all scopes. Proven Executed-local by running the
acceptance as `authenticated`; production inference is strong (the revoke is
explicit in the ledger) but owner should confirm with
`select has_function_privilege('authenticated','public.get_ranked_feed(text,integer,double precision,double precision,double precision)','EXECUTE');`
and by pasting 0265+0266. 0266 adds DEFINER `posts_with_origin(since)` (ids only,
30-day bound) and rewrites both functions to use it. New permanent
`feed_visibility_suite.sql` runs in every replay as a real member; negative
control (revoke the helper) observed red.

**0264's fail-loudly claim falsified.** The four-argument forms' parameter
defaults absorb the old one- and two-argument call shapes: a stale deployed build
gets 'all'-scope results silently, no error. Pinned in the suite as a rolling-
compat guarantee; removing the defaults is a contraction step gated on the owner
confirming the current build is deployed.

**0265 — explicit grants for `get_ranked_feed(5-arg)`.** 0250 created it with no
grant; it rode platform default privileges. Audit of all app-called RPC names:
exactly one executable by neither `authenticated` nor `service_role`. Shim now
models Supabase's function default privileges; permanent `rpc-grants.sh` probe in
the replay (95 names / 0 failing at head; negative control: revoke one → exactly
one red).

**KRA-037 → Resolved (Executed-local; production paste + app deploy pending).**
0267, both halves: (1) `place_on_team` honors a key hit only while the logged
placement is still live for that identity; dead/vacated placements start a new
epoch and the log row is refreshed. (2) `queue_join_full_team` — atomic team +
members, key-locked, liveness-replayed, standard lock order; the split TS writes
and their hand-rolled delete rollback are gone. App side: guests and full teams
send one-shot form tokens (`components/queue/guest-join.tsx`), keys composed in
`app/queue/actions.ts` (member identity / guest token / legacy name fallback),
sanitizer in `lib/idem-token.ts`, `queue_join_full_team` + `posts_with_origin`
registered in `lib/database.types.ts`, KCDX-067 budget consciously 972 → 985
(reason recorded beside the number in `tests/guardrails.test.ts`). Evidence:
concurrency suite 13/13 with 8 new checks, observed red pre-0267 exactly at the
defect (dead-epoch, guest-ghost, full-team); sealing from-zero replay 267/0 with
every gate green; tsc 0 / eslint 0 / vitest green. Old deployed builds keep
working: `place_on_team` accepts token-less keys, and the old split-write path
is simply replaced server-side on next deploy.

**Paste order:** 0265 → 0266 → 0267, in one sitting, any app version — all three
are app-independent and restore the member feed without a deploy. Open items
unchanged: CSAM provider decision, B-01 `PGURI` secret, Dependabot rebase after
this branch, deploy-status question to owner.


## Session addendum 2026-08-12 (b)
- Grant-gap class, third instance: policy-referenced functions (0268). Production drift confirmed for is_match_participant (granted at replayed head, denied in prod report) — reconciler-with-NOTICE chosen precisely so the paste output documents what production was missing. Deny-list (0237 six) enforced by exception, not exemption.
- Guardrail lesson: policy-fn gate v1 passed on a dead database (empty output ≡ clean). Gates now must prove they measured: psql exit + SCANNED sentinel. Negative control observed red before trust.
- KRA-029 extension: counts and ranker share the visibility definition including author-own-pending (0269); suite pins author/stranger agreement both ways.


## 2026-08-13 — B-01 CLOSED
storage-backup run #4 fully green: PASS (0 issues), checksums verified on both providers, config snapshot on both. Secrets live: SUPABASE_DB_URI, RCLONE_CONF (crypt plaintext in owner password manager). Root cause of final blocker: bucket-scoped R2 token vs rclone bucket check on virgin prefix; fixed with --s3-no-check-bucket (script, main) + no_check_bucket=true (template).

## 2026-08-17 — FOLLOW-UP AUDIT INTAKE: four rows corrected against source

The KFU follow-up audit (42→35-finding successor, `KLIMR_FOLLOW_UP_AUDIT_2026-08-17.md`) contradicted four rows of this register; source verification this date CONFIRMS the auditor:

- **KRA-011 / KRA-040 → REOPENED (regression by 0232).** vercel.json schedules only tournament finalization; 0232 re-used the single `waitlist-sweep` pg_cron name for the SQL sweep, leaving `/api/cron/waitlist-sweep` — the sole orchestrator of storage-deletion draining, health-watch, venue jobs, perf pruning, and waitlist notifications — with no driver. The watcher that would have alerted was on the same dead route. Recorded process failure: replay-level proof is structurally blind to deployed-scheduler state; a driver-inventory guardrail joins the gates (WP-G). Hotfix 0276 queued.
- **KRA-034 / KRA-035 → REOPENED pending executed verification (auditor's line-cited claims accepted provisionally):** person-mode capacity reserves v_taken+1 before the roster lands; roster inserts filter foreign/malformed rows via ON CONFLICT DO NOTHING instead of rejecting; app can notify from a stale precheck. WP-I closes as one locked exact-reject command.
- **KRA-037 → PARTIAL confirmed** (approval and placement remain two commits; 0267 fixed placement idempotency only). WP-I.
- **KRA-005/029 adjacency:** `containsCSAE` defined but never called — AI-classified CSAE deletes without preservation; safety-escalation/media-safety ignore resolved Supabase error objects. New rows KFU-007/KFU-029, WP-S. This is the named supabase-does-not-throw footgun, found in our own safety path.
- **New live-breakage candidate KFU-005:** 0239 left `provider_application_hash` without an authenticated grant while 0245's INVOKER trigger calls it during member writes. Hotfix 0277 after executed reproduction.

Full dispositions and the work-package plan: `docs/KFU_RESPONSE_AND_PLAN_2026-08-17.md`. The 2026-08-17 baseline (`AUDIT_STATUS_FOR_EXTERNAL_REVIEW.md`) is superseded for this cycle; its owner-decision section performed exactly as designed — none of the fifteen recorded positions was re-litigated by the follow-up audit.

## 2026-08-17 (b) — RECONCILIATION ADOPTED: shared baseline established

The auditor's reconciliation (`KFU_CONTESTED_ITEMS_RECONCILIATION_2026-08-17.md`, responding to our response doc SHA-256 30F1…) is **adopted in full** as the shared planning baseline. Outcomes:

**Our four contests — all granted:** KFU-031 reframed (derivation preserved as necessary; hardening = four-class function taxonomy, exact-signature/audience gate, stale-grant removal, private schema for policy-only helpers — a better design than our blanket caller-binding proposal, adopted); KFU-033 shares KFU-028's eligibility machinery with separate closure (P1 while D-38 stands); KFU-017 text-field wording narrowed (selects + unproven-equivalence fields added to our fix scope — their two counter-examples verified fair); KFU-019 recorded-disabled P2 with a deployment guard requirement. CI accepted as E-CI evidence under retained-artifact conditions; new evidence vocabulary adopted (E-CI / E-AUDITOR / P-STAGING / P-PROD / R).

**Their eight plan corrections — all accepted on merits, two of them catching OUR errors:**
1. WP-0 freeze/manifest BEFORE any hotfix (our deferral to WP-G was wrong — later proof could reference a mutated candidate).
2. C0 Courtside containment precedes everything (disable public-code registration + revoke existing device tokens; owner confirmation requested since displays go dark until the P0 package).
3. **H1 corrected — our 0276 sketch was wrong:** re-driving `/api/cron/waitlist-sweep` would run BOTH waitlist engines (SQL requeue/30-min vs app expire/20-60-240 + emails) — conflicting semantics, double promotion. Revised H1: a dedicated heartbeat endpoint driving ONLY storage-deletion drain, health-watch, venue jobs, perf pruning + a promoted-without-notification reconciler; waitlist unification is full KFU-002, later. A restored driver is containment, not closure.
4. H2 gains action-result checking + credential orphan cleanup + an invoker-trigger nested-privilege inventory test.
5. **KFU-028 corrected — our signOut(userId) proposal was the wrong API** (GoTrue admin signOut takes a JWT). Design: database active-member gate is the authoritative immediate containment; admin ban/update for future sessions; reconcile the two writes.
6. KFU-014: memory-only + POST/opaque token; no sessionStorage; kill/canonicalize the legacy ?ll parser.
7. Checksums: recomputable external release manifest, never in-file self-reference.
8. Packages split one-root-cause-each; planning range revised to **16–24 sessions to Gate A, 19–30 to Gate B** (our 10–13 excluded freeze, containment, staging setup, and review latency — their correction stands). Re-estimate after WP-0.

**Auditor findings about our harness, verified this date:** `rls_and_invariants_checks.sql` and `social_graph_checks.sql` exist in supabase/tests/ and are NOT invoked by replay.sh (confirmed: zero references) — two shipped suites silently unhooked; CI runs PostgreSQL 17 vs local 16; no machine-readable proof artifact uploaded; Actions unpinned. All join the corrected package list (hooking the suites is a change and belongs to the first change packet, not WP-0 capture).

**Corrected execution order adopted:** WP-0 → C0 → H1 → H2 → H3 → P0 (Courtside enrollment, default UX = signed-in organizer's single-use ~2-minute QR bound to session/court/installation/purpose, pending OD-1 copy/placement) → B1…B5 → D1/D2 → S1/S2 → I1…I5 → U1/U2 → R1/R2 → tail. Closure format: the brief's eleven sections, evidence-suffixed statuses only.

**Open owner items:** (1) confirm C0 containment (Courtside displays paused until P0 lands); (2) OD-1 sign-off on the default enrollment UX; (3) staging Supabase project when B-packages begin; (4) identify the qualified non-author reviewer for security P0/P1 packets (interim: the auditing model per packet; a human security review remains a pre-GO gate).

## 2026-08-17 (c) — WP-0 + first three packets EXECUTED (C0, H1, H2)

Candidate frozen: SHA-256 4390ca77…f26411e. Migrations 0275 → 0278.

- **C0 / KFU-001 → FIXED-EXECUTED (containment).** 0276 disables BOTH courtside_register overloads (uuid+text — the first apply caught a second overload the single-signature revoke missed) and revokes all live device tokens. Verified on head: authenticated cannot execute either overload; live tokens = 0. Owner-authorized; displays dark until the permanent organizer-issued enrollment package (next P0). Permanent KFU-001 remains OPEN.
- **H1 / KFU-002 → FIXED-STATIC (containment); full KFU-002 OPEN.** Root cause confirmed: 0232 reused the waitlist-sweep pg_cron job name, orphaning /api/cron/waitlist-sweep and its four workers. Fix: dedicated /api/cron/worker-heartbeat + separately-named 0278 schedule, per-task failure boundaries, HTTP 207 on partial failure; old route reduced to waitlist-email-only. Corrected our own prior sketch (would have double-swept). New WP-G guardrail tests/cron-drivers.test.ts enforces unique-named drivers. Deployed-fire proof owed (P-STAGING). Waitlist unification deferred to full package.
- **H2 / KFU-005 → FIXED-EXECUTED.** EXECUTED finding corrected the static read: authenticated INSERT SUCCEEDS on head (hash carries an authenticated grant from default-privilege creation order, in no migration source). 0277 makes the grant explicit + least-privilege so prod matches head by construction. App layer: insert/withdraw results now checked; orphaned credential removed on failure. invoker_trigger_grants_suite (2/2, negative control fires) hooked into replay.

**Guardrail system worked as designed:** the new cron-driver test found three stale assertions in guardrails.test.ts that encoded the OLD (defective) "workers run on the waitlist tick" premise; repointed to the heartbeat route (intent preserved, not deleted — brief rule 18). Final: vitest 326/326, replay 278/0, klimr_ready=PASS(42), rpc_grants 98/0, all suites green, build clean, eslint 0/137.

**Harness debt surfaced:** rls_and_invariants_checks.sql (IDOR CHECK fails on head) and social_graph_checks.sql (cooldown CHECK 4b fails) are unhooked AND red standalone — real assertion failures needing their own diagnostic packet; NOT hooked while red (hooking a red suite is worse than none). Added to the package list.

Closure packets: docs/WP_H_CLOSURE_2026-08-17.md. NOT YET DELIVERED as pastes — awaiting the rebuild for this batch. iPhone impact: none (Courtside is a display surface, not the iOS player app; the bottom-nav app is unaffected).

## 2026-08-17 (d) — H3 executed (KFU-028)

0279 makes suspension a database fact: fail-closed `member_write_allowed` + `enforce_active_member` trigger across a 30-table member-write surface via catalog loop; service/definer paths pass through so moderation still functions. App half: `accountActive()` fails closed (was reading a swallowed error as active), admin suspend checks its result and redirects on failure, Auth ban switched to `updateUserById({ban_duration})` after the auditor correctly noted `admin.signOut()` takes a JWT not a user id. suspension_gate_suite 12/12 hooked into replay; replay 279/0; vitest 326/326.

Suite found two of MY fixture bugs before I trusted it: 0008's guard_account_status silently reverts status changes for non-service_role callers (so the first run's suspension was a no-op and the gate correctly permitted the write), and a wrong moderation_status enum literal. The non-zero baseline check is what exposed (a) — without it the suite would have "passed" while measuring nothing.

Next packet: the permanent KFU-001 Courtside enrollment (owner approved the auditor's QR design, OD-1).

## 2026-08-17 (e) — P0 PACKET EXECUTED: permanent Courtside enrollment (KFU-001)

0280 restores and extends 0235's design: organizer-issued one-time secrets bound to session + court + audience, server-side hashing (a leaked hash is not a credential), single-statement claim, organizer revocation, scope-checked courtside_authorize, both legacy register overloads dropped. courtside_enrollment_suite 16/16 — public join code, public display code, invented secret, replay, expiry, revoked challenge, revoked device, cross-session scope, copied install id, ended session ALL refused; fresh organizer challenge enrolls (non-zero baseline).

App layer completed the contract that broke on 2026-08-11: route takes enrollmentCode, client no longer auto-enrolls, and court-display.tsx stopped passing the JOIN CODE into enrollment at two sites (that was the vulnerability in client form). The coupling guardrail written after that incident FIRED when route+RPC moved ahead of the client — proof the post-incident control works.

Final: replay 280/0, all eight suites green, klimr_ready 42, rpc_grants 98/0, vitest 326/326, eslint 0 errors, build clean.

Owed for P0 closure: P-STAGING HTTP exploit replay + non-author security sign-off (audit requires both before Courtside re-enables). Migrations to paste in order: 0276, 0277, 0278, 0279, 0280.

## 2026-08-17 (f) — B1 executed (KFU-003, AAL2 at the database boundary)

0281: fail-closed caller_aal()/require_aal2() plus enforcement on ownership-destructive team_members transitions; ordinary membership writes deliberately untouched (over-broad gates get disabled). aal2_boundary_suite 6/6 hooked; replay 281/0; nine suites green; vitest 326/326.

Two method corrections recorded: the scratch head had been building from a migration cache missing 0274/0275 (now count-asserted before every build; from-zero replays read the repo directly and were never affected), and the first suite draft used direct DML that RLS matched at zero rows — team_members has no UPDATE policy, so the suite exercises the real DEFINER commands where the trigger still sees the caller.

Owed: P-STAGING observation that hosted Auth issues the `aal` claim. Migrations to paste in order: 0276, 0277, 0278, 0279, 0280, 0281.

## 2026-08-17 (g) — B2 executed (KFU-004, block-aware base profiles boundary)

0282: the base profiles SELECT policy was `using (true)` beside a correct block-aware view — the audit's finding confirmed in the live catalog. Policy now permits own row or a non-blocked pair in both directions, reusing the same is_blocked_pair helper the view uses (one definition, no drift). profile_block_boundary_suite 9/9 first run, including count parity and view/table agreement; replay 282/0; ten suites green; vitest 326/326.

Owed: P-STAGING cache/RSC-payload proof and query-cost measurement. Migrations to paste in order: 0276 → 0277 → 0278 → 0279 → 0280 → 0281 → 0282.

## 2026-08-17 (h) — B4 executed (KFU-033, adult admission)

0283: server-set adult_attested_at granted by writing an adult DOB through any legitimate path, unforgeable from the data plane (outside the member column grant list + trigger revert), required by the shared member_write_allowed helper so admission rides H3's existing 30-table enforcement. enforce_active_member now distinguishes admission_required from account_not_active. attest_adult() is the explicit command; onboarding needed no change because it already writes the member's own DOB (suite proves that path). Backfill attests stored-adult profiles and NOTICEs the count of active-but-unattested profiles — in production that number identifies accounts that must finish onboarding.

adult_admission_suite 12/12; replay 283/0; eleven suites green. The new rule broke three suites' fixtures (members who never onboarded, then wrote) — two via the recorded auto-profile-trigger law where ON CONFLICT dropped the DOB. Fixtures corrected; rule not weakened.

Paste: 0283 (after 0282, which is already deployed).

## 2026-08-17 (i) — B5 executed (KFU-031): the B-series is complete

0284 adopts the auditor's four-class contract design: exact-signature registry (108 rows incl. the 98-name app RPC surface), caller binding on four verified-safe policy-only helpers, and two general controls with planted red/green proofs. Deliberately NOT bound: is_conversation_participant (0011 legitimately evaluates a second subject — the auditor's own "no blanket rewrite" case), is_business_manager (own packet).

The controls found what the audit could not name: seven oracle-shaped functions instead of two, and — via stale_policy_grants — an oracle I had introduced myself in 0279, member_write_allowed(uuid) granted to authenticated, leaking account state about arbitrary users. Revoked with caller_aal/require_aal2; all five enforcement suites re-run green afterwards, proving the DEFINER paths never needed those member grants.

34 actionable stale grants remain, reported and explicitly NOT gated at that number (no gate with a tolerance). function_contracts_suite 8/8; replay 284/0; twelve suites green; vitest 326/326.

B-SERIES COMPLETE: B1 (KFU-003) · B2 (KFU-004) · B3 (KFU-028, as H3) · B4 (KFU-033) · B5 (KFU-031).
Paste in order: 0283, 0284 (0276-0282 already deployed). Next: D1/D2 (erasure + DSAR), then S1/S2 (safety).

## 2026-08-17 (j) — D1/D2 executed (KFU-006, KFU-030)

0285 replaces hand-maintained coverage with a versioned data_inventory checked against the catalog. On its first run the contradiction control found that notifications.user_id is SET NULL, not CASCADE — account deletion would have left notification content about the person behind with a null user. Declaration corrected to 'delete' with the reason recorded. Export route now reports coverage_status (vs the declaration) separately from query_integrity, at format_version 4; DATA-GOVERNANCE and two guardrails updated to match (the doc-drift test fired correctly and was answered by fixing the doc, not the test).

data_inventory_suite 9/9 with planted contradiction and planted undeclared-table controls; replay 285/0; thirteen suites green; vitest 326/326.

Stated openly: 51 user-referencing tables remain undeclared (reported, not defaulted, not gated). The erasure execution command + per-account isolation + physical Storage verification are the next packet.

Paste in order: 0283, 0284, 0285.

## 2026-08-17 (k) — S1 executed (KFU-007, KFU-029)

escalateCSAE returned void with every failure swallowed, and both callers deleted the original regardless — the irreversible case of the project's own "supabase-js does not throw" footgun. It now returns a checked EscalationResult; both removal sites are gated by mayDestroyOriginal() (durable copy AND durable incident), and a failed preservation retains the original with a logged reason instead of destroying evidence. containsCSAE had no caller: the AI path now routes a minors verdict through preservation + escalation with kind ai_csae_flag before any removal, and never publishes either way.

The destroy decision moved into lib/safety-rules.ts — pure, no server-only import — precisely because that is why it had no executable test. 10 unit tests + 3 wiring guardrails; vitest 339/339.

Owed: adapter-live fault injection (P-STAGING). Next: KFU-008 evidence binding + KFU-009 payment digest.

## 2026-08-17 (l) — S2 executed (KFU-008 database half, KFU-009 complete)

0286: media_screenings ledger keyed by (bucket, path, sha256) so replaced bytes cannot inherit a clean verdict, plus media_evidence_current() — fail-closed on missing, stale, mock/disabled-scanner or non-clean evidence, with the freshness bound supplied by the caller. tournament_submit_payment_proof now CALLS verify_payment_proof_object (built and proven in 0245, never called since) and records a proof_fingerprint so a byte swap under a reviewed decision is detectable.

evidence_binding_suite 12/12 first run; replay 286/0; fourteen suites green; vitest 339/339.

Paste-law caught my own carry-over of `select … into v_r` from 0193 — command rewritten in assignment form before delivery.

OPEN and next: write screening rows from screenAndClassifyPhoto and consult media_evidence_current() on the publish path; remaining upload surfaces; video gate. Paste order now: 0283, 0284, 0285, 0286.

## 2026-08-17 (m) — S2b: the ledger has a writer and the publish path a gate

Every screening decision now records evidence (digest + scanner provider/version + policy version); the Feed publish path consults media_evidence_current() through decidePostModeration() and fails closed on missing, stale, mock or mismatched evidence. KCDX-067's module-size budget fired when the gate landed in the action — the concern was extracted (twice) rather than the budget raised; the action is now 514 lines against a 515 budget. vitest 342/342.

Remaining for KFU-008: avatars, listings, credential documents, video gate. P-STAGING: live adapter proof.

## 2026-08-17 (n) — I4/I1 executed (KFU-013, KFU-010)

0287 freezes terminal team-match rows against every result and identity column, with team_match_correct_result as the only route — manager-gated, reason-required, append-only before/after audit written BEFORE mutation, transaction-local unlock (not a definer bypass, so direct writes still cannot). recordResult no longer re-enters on completed. listing_meetups gains an insert shape check (proposer must be the caller and a counterparty), frozen identities and a transition matrix taken from the table's own CHECK vocabulary.

terminal_immutability_suite 16/16; replay 287/0; fifteen suites green; vitest 342/342.

Execution corrected two of my assumptions: marketplace_listings names the owner listed_by (not seller_id), and meetups have no 'completed' state — the guard would have encoded a status the schema forbids.

Open in the I-series: KFU-011 (queue approval atomicity), KFU-012 (exact-reject roster/capacity), KCDX-046 residual. Paste order: 0283…0287.

## 2026-08-18 — 0288 incident fix verified in production; gate command corrected

0283's admission gate blocked 254 of 256 active production accounts (only 2 held a birth date). 0288 grants a dated per-row 30-day pre-admission window; production now reports 2 attested / 254 in window (deadline 2026-09-17) / 0 blocked. Attestation was not backfilled — the gate's own fact must not be invented.

Process corrections recorded: (a) gating migrations must be preceded by an owner-run count query, because RAISE NOTICE is invisible in the Supabase SQL editor; (b) the local lint gate must be `npm run lint` (eslint --max-warnings 137), not bare eslint — a bare run exits 0 on warnings and let a 138th warning reach CI.

Still open: klimr_ready() = false in production while local head at 288 is true. Diagnosis pending the owner's `select * from public.klimr_readiness() where not passed` output.
