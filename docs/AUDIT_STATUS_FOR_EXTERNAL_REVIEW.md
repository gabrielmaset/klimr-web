# KLIMR — AUDIT STATUS BASELINE FOR EXTERNAL REVIEW
**Date:** 2026-08-17 · **Production schema:** migration 0275 · **Deployed build:** 2026-08-15 (Batch C UI pending next push)
**Distilled from:** `docs/KRA_DISPOSITION_REGISTER.md` (authoritative, 42 findings, owner-signed dispositions) and `docs/AUDIT_REMEDIATION_STATUS.md` (the prior 68-finding KCDX ledger, migrations 0191–0234). When this summary and the registers disagree, the registers win.

---

## To the auditing model — read this first

This document exists so a re-audit spends its effort on what is genuinely unknown, not on re-discovering what is recorded. Ground rules, set by the owner:

1. **Items marked SETTLED or OWNER-DECIDED below are resolved or consciously decided.** Do not re-raise them as findings unless you have **new evidence that the recorded fix or decision is wrong** — a changed file, a contradicting behavior, a flaw in the recorded reasoning. "I would have chosen differently" is not new evidence.
2. **Owner's explicit exception: genuinely serious security issues should ALWAYS be raised**, even if they appear in this document. If you believe an OWNER-DECIDED item is a serious vulnerability, say so plainly and argue the severity — that is welcome. What is not useful is re-reporting it as if undocumented.
3. **Evidence labels are preserved and honest**: `Static` (source inspected) · `Executed-local` (proven on a full-migration local replay with real member roles) · `Production` (proven on production). Asking for production proof where an item is labeled Executed-local is legitimate; reporting the item as *unaddressed* is not.
4. Every claim below is traceable to a register row, a migration number, or a suite check. Cite-back format for disputes: `KRA-0NN / register line` or `migration 0NNN`.

## Current guardrail inventory (what now runs on every replay and in CI)

- **From-zero migration replay: 275 applied / 0 failed**, in CI (`schema-replay` job) and locally before every release.
- **Readiness sentinel `klimr_ready()`: 42 checks** (function ACLs incl. the 0273 lawful-anon class, RLS presence, sentinel functions, journal drift, canaries).
- **Behavioral suites as real member roles: 89 checks** — rls_negative (26), concurrency (13, races reproduced before fixes trusted), feed_visibility (15), match_visibility (19), teams (16). Every guardrail was proven **red on a planted violation before being trusted green**.
- **rpc-grants probe: 98 RPC names, 0 failing** (every app-called function explicitly granted; negative control observed red).
- **policy-fn-grants gate**: pg_depend-derived — every function referenced by an RLS policy must be executable by the querying role; shares one lawful-class definition with the readiness sentinel (0273) so the two cannot drift.
- **Event trigger `klimr_revoke_public_execute`**: strips PUBLIC/anon from every newly created function; explicit grants only.
- **`migration_journal` + `journal_drift()`** (0262): every migration ≥0262 self-records; drift in either direction is a failing check.
- **Doc-claims tests**: countable documentation claims are asserted against source; drifting docs fail the build.
- **Nightly storage backup**: dual-provider (R2 + B2), `rclone check` checksums on every bucket, config snapshot on both, encrypted remotes; run #4+ fully green (**B-01 closed 2026-08-13**).
- **Supply chain**: `npm audit --omit=dev` = 0 vulnerabilities (KRA-042); Dependabot PRs are **deliberately held unmerged pending manual review** — that is policy, not neglect.

---

## A. The 42 re-audit findings — status as of 2026-08-17

Status vocabulary: **FIXED** (with evidence label) · **PARTIAL** (fixed core, named remainder) · **OPEN** (real, tracked, unstarted) · **OWNER-DECIDED** (deliberate position, do not re-flag) · **DEFERRED** (owner-accepted to a named milestone).

| ID | Area | Status now | Where / evidence | Re-raise? |
|---|---|---|---|---|
| KRA-001 | Courtside enrollment authz | **OPEN — by owner decision after a production incident** | 0235 shipped, broke registration in prod 2026-08-11, reverted same day. The proper three-part fix is specified in the register (line ~1528). Display-code minting risk is known and accepted *pre-launch* while Courtside is operator-supervised. | Only to argue severity/timeline; the diagnosis is done. |
| KRA-002 | Queue SSR privacy | FIXED — Executed-local | `lib/queue-audience.ts` single load+project seam; 5 call sites; import guardrail. | Only the owed browser/RSC-payload proof (B-03). |
| KRA-003 | DB function privileges | FIXED — Executed-local, **strengthened since** | 0239 full sweep + default privileges + event trigger; 0268 lawful-anon reconciler; 0273 sentinel amendment. Continuously enforced by `klimr_ready` + CI. | No. |
| KRA-004 | Professional-review hash | FIXED — Executed-local | 0245 in-place hash covering document/phone/attestations; freeze widened. | No. |
| KRA-005 | Media safety (CSAM/unscreened) | **PARTIAL — updated since audit** | Feed photo path: fail-closed seam + **production classifier is now OpenAI omni-moderation (owner decision D-36), armed via env**; unavailable scan → held `pending`, never published. Hash-matching (PhotoDNA) + NCMEC ESP registration **DEFERRED-OWNER to incorporation (D-37)**. Cloudflare zone CSAM tool enabled (email-only requirement); recorded coverage caveat: Supabase-served UGC bypasses the zone cache — proxying is a tracked fast-follow. | The **owed surfaces** (avatars, listings, credential/business/payment evidence) — yes. The provider/timing decisions — no. |
| KRA-006 | Tournament payment proof | PARTIAL | 0245 `verify_payment_proof_object()` proven (allow + 3 denials). Owed: wiring into `tournament_submit_payment_proof` + byte digest. | The owed wiring — yes. |
| KRA-007 | Marketplace meetups WITH CHECK | **OPEN** | `listing_meetups` member DML lacks column/transition freeze. Tracked for a hardening batch. | Yes (it's open). |
| KRA-008 | Privacy-ladder enforcement | FIXED — Executed-local | 0238: DM/tag/comment/invite/connection all ladder-gated; found+fixed a live DM-unrepresentable bug. | No. |
| KRA-009 | Privacy pair-oracles | FIXED — Executed-local | 0237: six raw predicates closed; `can_i_*` caller-bound wrappers; measured exception (`is_blocked_pair`) with in-body guard. | No. |
| KRA-010 | Legal names / gender / blocking | FIXED — Executed-local, **contains an owner decision** | `first_name`/`last_name` member-restricted; projection block-aware both directions. **`gender` is public by explicit owner decision (OD-5)** — do not re-flag gender visibility as a leak. | Only names/blocking regressions. |
| KRA-011 | Storage deletion durability | FIXED — Executed-local | 0243/0244 outbox + claim/mark; completion only after Storage confirms; separate stuck/abandoned canaries. | No. |
| KRA-012 | Deploy/readiness proof | **OWNER-DECIDED epistemic design** | 0262 journal: every migration ≥0262 self-records; `journal_drift()` bidirectional; build-failing test. **Pre-0262 history is an ASSERTED owner-confirmed baseline, deliberately labeled as asserted** — a journal cannot retroactively observe the past, and pretending otherwise is the exact failure this finding named. | Flag any NEW unjournaled migration (drift catches it). Do not re-flag the asserted baseline. |
| KRA-013 | Waitlist sweep | **OPEN** | Hard-coded 30-min offers vs app's 20/60/240; promotion without outbox/notification. Tracked. | Yes (it's open). |
| KRA-014 | External I/O deadlines | FIXED — Executed-local | `callExternal` everywhere with per-site budgets; NCMEC retries=0 (a duplicated legal report is its own harm); tripwire found a 4th undefended fetch. | No. |
| KRA-015 | MFA/CAPTCHA fail-open | FIXED — Executed-local; **one DEFERRED tail** | Indeterminate never allows; CAPTCHA denies on missing secret/vendor error. **MFA verification-attempt hook is Supabase-Pro-gated → owner-deferred to go-live** (0055 pre-run; activates with the plan upgrade). | Only if you dispute the go-live deferral's risk. |
| KRA-016 | Account export completeness | FIXED — Executed-local | `format_version: 3`, 21 named datasets, per-dataset errors, `incomplete_datasets` surfaced; governance doc bound by test. | No. |
| KRA-017 | Privileged audit | PARTIAL | False-success removed (`issued` outcome); incident signal unburied (proven with 50 handouts). Owed: narrowing ~88 raw admin-client callers into audited domain commands — an ongoing program, 0193 is the pattern. | The breadth program — yes, as progress check. |
| KRA-018 | Storage backup / DR | **CLOSED except the drill** | B-01 closed 2026-08-13: nightly dual-provider, checksum-verified, config snapshots, failure output verbose. **Restore drill: DEFERRED-OWNER to the go-live checklist** (explicitly: backups are not called done until a restore is rehearsed). OD-4 interim position: quarantined suspected-CSAM bytes are **not** copied to backups, pending counsel. | The drill at go-live — yes. OD-4 only with legal argument. |
| KRA-019 | Feed report exfiltration | FIXED — Executed-local | 0242: visibility gate under real caller before rate-limit/snapshot; uniform `not_found` (OD-3). | No. |
| KRA-020 | AI availability oracle | **FIXED per owner decision (OD-2)** | Availability search is a *feature* by owner decision; ladder-applied as caller; the name×time-grid **combination** refused (that is the extraction primitive). Residual recorded. | Do not re-flag the feature's existence; regressions only. |
| KRA-021 | Notification exactly-once | FIXED — Executed-local | Inline sends removed; outbox is the single durable path; guardrail + negative control. | No. |
| KRA-022 | Business search routing | FIXED — Executed-local | `business` type wired end-to-end; compiler-enforced exhaustive maps. | No. |
| KRA-023 | Browse/temporal search | FIXED — Executed-local | `browse_kind()` (0249), INVOKER; recurring events ordered by next occurrence. | No. |
| KRA-024 | AI result routing | FIXED | Person cards → `/profile/<id>` (was a dead match route). | No. |
| KRA-025 | Feed deep-link render | FIXED — Executed-local | Resolvable post prepended through the same caller-RLS read. | No. |
| KRA-026 | Deep-link enumeration | **FIXED per owner decision (OD-3)** | 0247: absent/private/pending/rejected/blocked all return indistinguishable `unavailable`, no author id; author-first self-access. | Do not re-litigate the uniform-response decision. |
| KRA-027 | PYMK privacy/fail-open | FIXED — Executed-local (replay since covered) | 0261: neighborhood out of the return type; OD-2 ladder before Connect; both fail-open cache paths closed. Initially "not replayed"; every from-zero replay since (through 275/0) covers it. | No. |
| KRA-028 | Feed aggregate contract | FIXED — Executed-local | `eng_comments` counts approved only; INVOKER asserted by sentinel. | No. |
| KRA-029 | Feed Nearby/counts | **FIXED incl. owner decision (OD-7)**, extended 0269 | Nearby = author's ZIP centroid, stamped server-side (`post_origins`), ids-only helper; counts share the ranker's visibility incl. author-own-pending; suite-pinned both ways. | No. |
| KRA-030 | Shared media deletion | FIXED — Executed-local | Reference-counted enqueue; safety evidence never deleted; both directions proven. | No. |
| KRA-031 | RUM abuse | FIXED — Executed-local | Fail-closed IP limit + DB daily budget that **counts its drops**. | No. |
| KRA-032 | Queue expiry clock | FIXED — Executed-local | 0251 `greatest(activated_at, created_at)`; both directions on one session. | No. |
| KRA-033 | Class enrollment race | FIXED — Executed-local, race reproduced | 0256/0257; root cause was a trigger collision, resolved with a transaction-local flag, **not** a definer bypass; direct tamper still pinned. | No. |
| KRA-034 | Tournament capacity | FIXED — Executed-local | 0258 reads the same `format_config` the UI reads; both modes both directions. | No. |
| KRA-035 | Team tourney roster | FIXED — Executed-local | 0259 single-transaction roster + missing UNIQUE added (with de-dup). | No. |
| KRA-036 | Queue match start race | FIXED — Executed-local, race run | 0260 one-transaction start; concurrent-operator test consistent; negative control detects the old shape. | No. |
| KRA-037 | Queue placement idempotency | **FIXED — production-pasted** | 0267 both halves (epoch-aware keys; atomic full-team join); concurrency suite +8 checks observed red pre-fix; pastes 0265–0267 confirmed in production; app deployed 2026-08-15. | No. |
| KRA-038 | Ranking race | FIXED — race reproduced | 0251 advisory lock (player,sport); without it: 50 stored instead of 100, silently — reproduced, then closed. | No. |
| KRA-039 | Team ownership race | FIXED — Executed-local | 0255 trigger invariant (never lose last owner) + locked `team_remove_member()`. | No. |
| KRA-040 | Health canary export | FIXED — Executed-local | Canaries had **never run** (named nonexistent tables); repaired; transition-only alerting proven fire-once. | No. |
| KRA-041 | Readiness deadline | FIXED | 8s deadline on boot probes; timer cleared in `finally`. | No. |
| KRA-042 | Dependency advisories | FIXED | next pinned 16.2.12; prod audit 0. Dependabot PRs held by policy for manual review. | No — and don't flag the unmerged PRs as neglect. |

## B. Positions we decided NOT to follow the auditor's suggestion on — and why

These are **owner-signed decisions**, each with reasoning in the register. Re-raise only with a serious-security argument (rule 2 above).

1. **Gender is publicly visible (OD-5 / KRA-010).** Owner decision for a sports platform where gendered play divisions are core product. Legal names remain restricted; the public/member surfaces were made consistent so there is one truth.
2. **Availability search exists (OD-2 / KRA-020).** "Find players free at a time" is a feature, not a leak — but it runs under the viewer-bound privacy ladder, and the name×time-grid combination (the actual stalking primitive) is refused.
3. **Uniform `unavailable` on deep links (OD-3 / KRA-019/026).** All refusal causes are indistinguishable and carry no author id; the auditor's alternative (differentiated errors) is the enumeration primitive.
4. **Nearby = author ZIP centroid (OD-7 / KRA-029).** Precise geodata never leaves the server; `post_origins` is server-only and the ranker consumes ids.
5. **Pre-0262 migration history is ASSERTED, not observed (KRA-012).** A retroactive journal would be fabricated evidence — the precise failure the finding condemned. The asserted baseline is labeled as such forever.
6. **Quarantined suspected-CSAM bytes are excluded from backups (OD-4 / KRA-018, interim).** Copying suspected illegal material into two more storage providers multiplies legal exposure; position held pending counsel at incorporation.
7. **PhotoDNA / NCMEC ESP registration at incorporation, not before (D-37 / KRA-005).** Registration requires the legal entity; the interim layer is the fail-closed OpenAI classifier + Cloudflare zone scanning + preserve-and-escalate paths already live.
8. **MFA verification-attempt hook waits for the Supabase Pro upgrade at go-live (KRA-015).** The hook is plan-gated; migration 0055 is pre-run so activation is a toggle, and the surrounding lockout/CAPTCHA layers are live now.
9. **Leaked-password protection is N/A.** Klimr has no passwords (magic link + TOTP). A prior audit generation suggested enabling it; there is nothing to protect.
10. **`anon` holds EXECUTE on exactly two functions (0268), by design.** `tournament_is_visible` and `is_tournament_staff` are referenced by RLS policies on anon-readable public tournament pages; policies run as the querying role, so the grant is *required* (executed baseline: logged-out pages die without it). The readiness sentinel was amended (0273) to derive this lawful class from pg_depend — sentinel and reconciler share one definition. **An auditor grepping for anon grants will find these two; they are correct.**
11. **Feed function parameter defaults absorb legacy call shapes (rolling compat).** Deliberate zero-downtime pattern; the contraction migration (dropping defaults so stale builds fail loudly) is gated on deploy confirmation and queued.
12. **Advisory, not enforced, skill range on open matches (D-42 / 0270).** The organizer approves every join request — the request flow is the enforcement point; a hard gate would only push mismatched players into lying at signup.
13. **Scheduled matches are discoverable under the visibility ladder (0270).** Deliberate change from 0001's open-only exposure (which contradicted the product's own browse query); suite-pinned.
14. **Roster rule (owner/manager) is stricter than challenge rule (owner/manager/staff) (0274/0275).** Asymmetry is intentional — seating members is a bigger power than proposing matches — and a suite check pins the distinction permanently.
15. **KCDX-067 guardrail budget consciously moved 972 → 985** with the reason recorded beside the number — invariants moved into the database and explanatory commentary arrived; the metric was allowed to move honestly rather than gamed.

## C. Known-open and tracked — do not "discover" these; audit their progress

KRA-001 (Courtside three-part fix) · KRA-005 remaining upload surfaces · KRA-006 digest wiring · KRA-007 meetups WITH CHECK · KRA-013 waitlist sweep · KRA-017 breadth (88 raw callers) · restore drill (go-live gate) · B-02/B-03 staging & browser-payload proofs · KCDX-061 relevance corpus · KCDX-063 type-filter into the feed RPC · KCDX-065 performance tail (fonts, Queue push) · KCDX-066 44px targets + typography tokens · media_screenings audit table + video gate (KCDX-006 batch) · Cloudflare-coverage image proxying · managers-only join-request notifications · Dependabot review batch · feed compat-defaults contraction migration.

## D. Changed since the audited zip (0263 → 0275) — fresh eyes welcome here

The audited zip predates all of the following; this is where new review effort pays:

- **0263–0267**: Courtside register verified; feed permission regression found+fixed (0264 wrong → 0266 DEFINER `posts_with_origin`); explicit-grant gap class closed (0265 + rpc-grants gate); KRA-037 resolution.
- **0268–0269**: policy-referenced-function reconciler (lawful anon class, production drift confirmed and documented in paste output); Nearby-counts visibility unification.
- **0270–0271 (Batch A)**: match visibility ladder (public/followers/friends, mirrors posts 0140 via caller-bound DEFINER helper) + advisory skill bands; **adult platform gate** — DB trigger rejects minor birth dates (third layer; D-38), backfill asserted clean.
- **0272 (Batch B)**: `ranked_players` gains gender/age filters + viewer-bound block exclusion + rank-true windowing; switched to SECURITY DEFINER **because the filters read member-hidden columns while returning display fields only** — an auditor seeing DEFINER here should read the register note, not assume privilege escalation.
- **0273**: readiness sentinel learns the lawful anon class (shared pg_depend definition; CI green restored).
- **0274–0275 (Batch C)**: per-team join policy + race-safe ask/approve/withdraw command RPCs (deny-by-default table writes, advisory locks, idempotent asks, capacity under lock); team-match guard trigger (same-sport at insert, away-only acceptance, transition matrix, terminal states).
- **Ops**: backup system fully green dual-provider (B-01 closed); OpenAI moderation armed in production (D-36); Cloudflare CSAM zone tool (D-37); category/copy corrections (sports network framing).
- **Suites grew**: match_visibility (19) and teams (16) are new since the audited zip; concurrency +8.

---

*Maintained alongside `docs/KRA_DISPOSITION_REGISTER.md`. Statuses reflect 2026-08-17; the register's append-only decisions log is the arbiter of anything time-sensitive. Prepared by Klimr's engineering function at the owner's direction.*
