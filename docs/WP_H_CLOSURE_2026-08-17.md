# WP-0 / C0 / H1 / H2 — CLOSURE PACKETS (2026-08-17)
Format per CLAUDE_REMEDIATION_BRIEF §"Closure report format". Statuses are evidence-suffixed. Candidate frozen at WP-0.

## WP-0 — Freeze and inventory
- **Audited candidate SHA-256:** `4390ca7730203a6bdd98bee419c741ea526d617bb2bb71cc3f9d291a6f26411e` (klimr-web.zip, the artifact the KFU audit examined).
- **Boundary/job capture:** cron drivers inventoried (two routes: waitlist-sweep, worker-heartbeat); courtside_register found to have TWO overloads (uuid + text); provider_application_hash grant found to arrive from default-privilege ordering, not source.
- **Harness state captured:** two shipped suites (rls_and_invariants_checks, social_graph_checks) confirmed NOT hooked into replay.sh AND failing standalone on head (real assertion failures — deferred to their own diagnostic packet, not hooked while red).
- **New baseline after this work:** migrations advance 0275 → 0278; append-only from here.

---

## C0 — Courtside containment (KFU-001)

**1. Findings addressed:** KFU-001 (P0) — a public join/display code can be exchanged for a Courtside operator-capable device token.

**2. Root cause:** `courtside_register(...)` mints/rotates a device token from a code with privileged DB access; the public Queue projection necessarily exposes the join code; the operator guard then accepts that token. This is the deployed (pre-KRA-001-revert) behavior. Owner authorized containment 2026-08-17: displays may go dark.

**3. Design and trust boundary:** containment at the database boundary (not the route), so it holds against a direct call. Both overloads of `courtside_register` are replaced with a hard `raise courtside_enrollment_disabled`; EXECUTE revoked from public/anon/authenticated on both, granted only to service_role; and every existing `courtside_devices` token is revoked (`revoked_at = now()`) so a previously-minted operator token cannot continue to act.

**4. Files and migrations changed:** `supabase/migrations/0276_courtside_containment.sql` (new).

**5. Tests added:** verified inline on head (below); permanent enrollment package will carry the full negative matrix.

**6. Commands actually executed:** applied 0276 on a from-zero head (273→ applied clean); queried effective privileges and token state.

**7. Results and retained evidence (Executed-local):**
- `has_function_privilege('authenticated', courtside_register(text,…), 'execute')` = **false**; same for the `(uuid,…)` overload.
- live device tokens (`revoked_at is null`) = **0**.
- from-zero replay after this batch: **278 applied / 0 failed**, klimr_ready=PASS (42).

**8. Migration/deploy/rollback:** paste 0276; reversible — the permanent package replaces both functions. No app change required for containment.

**9. Observability/operator:** operator sees `courtside_enrollment_disabled` with a hint pointing at the enrollment release. Displays intentionally non-functional until then.

**10. Residual risk / non-goals:** this is CONTAINMENT, not the fix. Courtside is unusable until the organizer-issued enrollment package (P0 packet) ships. Owner accepted this explicitly.

**11. Independent reviewer:** owner-authorized; security reviewer sign-off required on the PERMANENT enrollment package before Courtside is re-enabled (Gate A).

**Status: FIXED-EXECUTED (containment).** The permanent KFU-001 repair remains OPEN and is the next P0 packet.

---

## H1 — Worker heartbeat containment (KFU-002)

**1. Findings addressed:** KFU-002 (P1, launch blocker) — the HTTP heartbeat was unscheduled, stranding Storage-deletion drain, jobs worker, perf pruning, and health canaries; the health watcher that would alert was on the same dead route.

**2. Root cause:** 0232 re-used the single `waitlist-sweep` pg_cron job NAME for the SQL sweep (`cron.schedule` on an existing name overwrites it), so `/api/cron/waitlist-sweep` — the sole driver of all four workers — lost its pg_cron ping. It has not run since 0232 deployed.

**3. Design and trust boundary:** a NEW, separately-named pg_cron job (`worker-heartbeat`, so it can never collide with `waitlist-sweep` again) drives a NEW dedicated endpoint `/api/cron/worker-heartbeat` that does **not** sweep waitlists — running a second waitlist engine beside 0232's SQL sweep would double-promote. Each worker task runs in its own try/catch failure boundary and returns a counted result; the endpoint returns HTTP 207 on any partial failure so an uptime monitor sees a dropped task as a real event. The old route is reduced to waitlist-email-only.

**4. Files and migrations changed:** `app/api/cron/worker-heartbeat/route.ts` (new); `supabase/migrations/0278_worker_heartbeat_schedule.sql` (new); `app/api/cron/waitlist-sweep/route.ts` (worker duties removed); `tests/cron-drivers.test.ts` (new WP-G guardrail); three stale assertions in `tests/guardrails.test.ts` repointed to the heartbeat route (intent preserved — workers have a driver, done-after-remove ordering).

**5. Tests added:** `cron-drivers.test.ts` — every cron route must have a declared driver, and no job name may drive two routes (the exact 0232 regression class). Passes 5/5.

**6. Commands actually executed:** tsc; eslint; full vitest; from-zero replay (0278 applied).

**7. Results and retained evidence:**
- **Executed-local:** replay 278/0; the heartbeat schedule migration applies (harness-guarded for absent pg_cron, same pattern as 0173/0232).
- **Static:** the guardrail proves the driver exists and is unique; the old route no longer imports the workers; the new route carries per-task boundaries + 207 semantics.
- **P (owed):** deployed-scheduler proof — that the pg_cron job actually fires in production — requires the next deploy plus `app.settings.site_url`/secret set. This is the exact P-class the reconciliation formalized.

**8. Migration/deploy/rollback:** paste 0278 (creates the schedule only where pg_cron/net exist and site_url is set); deploy the new route. Rollback: unschedule `worker-heartbeat`. FULL KFU-002 closure (waitlist window unification 20/60/240 vs 30-min, transactional promotion+outbox, offered-without-notification reconciliation) is a SEPARATE later package — this is containment that stops the bleeding.

**9. Observability/operator:** 207 on partial failure; per-task error strings in the response body; missed-tick alerting to be wired in the full package.

**10. Residual risk / non-goals:** waitlist semantic unification NOT done here; missed-tick SLA alert NOT wired here; deployed-fire proof owed at staging/prod.

**11. Independent reviewer:** non-author review owed before GO (per brief rule 19).

**Status: FIXED-STATIC (workers re-driven; deployed-fire proof owed P-STAGING). Full KFU-002 = OPEN (scheduled package).**

---

## H2 — Provider application repair (KFU-005)

**1. Findings addressed:** KFU-005 (P1, likely-live) — 0239's ACL sweep vs 0245's SECURITY INVOKER freeze trigger calling `provider_application_hash` during member writes; plus (reconciliation add) app-layer ignores insert/withdraw errors and can orphan an uploaded credential.

**2. Root cause (EXECUTED, corrects the static read):** on a from-zero head the authenticated INSERT **succeeds** — the hash function carries an `authenticated` grant that appears in NO migration source; it arrives from platform default privileges because 0245 CREATEs the function after 0239's sweep. So the defect is not "broken on head" but "correct only by default-privilege timing, which may differ in production and is invisible to a reader." Separately, the app discarded the insert result and any orphaned credential object.

**3. Design and trust boundary:** make the grant EXPLICIT and least-privilege (authenticated + service_role only) so production matches head by construction, not by ordering luck. In the app: check the insert result; on failure, remove the just-uploaded credential object via the privileged client and redirect to an honest error; check the withdraw result too.

**4. Files and migrations changed:** `supabase/migrations/0277_provider_hash_grant_explicit.sql` (new); `app/settings/professional/actions.ts` (checked results + orphan cleanup); `supabase/tests/invoker_trigger_grants_suite.sql` (new, hooked into replay).

**5. Tests added:** invoker-trigger suite — a member submission fires the freeze trigger and stores a hash (positive), and revoking the grant breaks the member write (negative control, proving the test measures the real dependency). 2/2.

**6. Commands actually executed:** authenticated-role reproduction on head (INSERT succeeded — documented); applied 0277; ran the suite; full gate.

**7. Results and retained evidence (Executed-local):** suite 2/2 with negative control firing; replay 278/0; `provider_application_hash` now shows explicit `authenticated`+`service_role` grants and no anon/public.

**8. Migration/deploy/rollback:** paste 0277 (idempotent — safe whether or not the incidental grant is present); deploy the app change. Rollback: revoke the explicit grant (returns to default-privilege behavior).

**9. Observability/operator:** insert/withdraw failures now log with code+message; orphan-cleanup failures log distinctly.

**10. Residual risk / non-goals:** the broader KFU-008 evidence-binding (attestation bound to object version/digest across every upload surface) is a separate safety package; this packet closes the ACL dependency and the app-layer result/orphan handling only.

**11. Independent reviewer:** non-author review owed before GO.

**Status: FIXED-EXECUTED (ACL made explicit + app-layer hardened, negative-control-proven). P-proof that production's pre-fix grant state matched head is now moot — the explicit grant makes them identical.**

---

## H3 — Suspension containment (KFU-028)

**1. Findings addressed:** KFU-028 (P1) — suspended/banned users retain direct write capability; `accountActive()` failed open on a swallowed lookup error; suspension did not revoke sessions.

**2. Root cause:** member-write policies validate ownership (`author_id = auth.uid()`), never account status, so a retained JWT keeps working against PostgREST/RPC after suspension. The app helper read a missing row / discarded error as "active."

**3. Design and trust boundary (per the reconciliation's correction):** the DATABASE is the authoritative immediate containment — an issued access token stays valid until expiry, so Auth-side action alone cannot stop the writes. One fail-closed predicate (`member_write_allowed`) plus one trigger (`enforce_active_member`) applied across the member-write surface **by a catalog-driven loop over a named table list** — not 54 hand-edited policies (editing instances instead of the pattern is a recorded past failure). `auth.uid() is null` (service_role, definer commands, cron) passes through, so moderation can still act ON a suspended member's rows. App half fails closed and surfaces failures. Auth ban uses `updateUserById({ ban_duration })` — the audit correctly noted `admin.signOut()` takes a JWT, not a user id — with the two writes explicitly NOT treated as one transaction.

**4. Files and migrations changed:** `supabase/migrations/0279_active_member_write_gate.sql` (new); `supabase/tests/suspension_gate_suite.sql` (new, hooked into replay); `lib/guards.ts` (fail-closed, checks `suspended_until`); `app/admin/actions.ts` (checked status result → redirect notice on failure; corrected Auth ban).

**5. Tests added:** suspension gate suite, 12 checks — **non-zero baseline first** (an active member CAN post, so the suite provably measures something), then: suspended member cannot INSERT / UPDATE own earlier content / DELETE / create social edges; unrelated active member unaffected (no over-broad denial); predicate fails closed on unknown profile; banned denied; expired timed suspension restores access; future-dated window denies; moderation still acts on a suspended member's content.

**6. Commands actually executed:** applied 0279 on a from-zero head; ran the suite (twice red first — see 7); tsc; eslint; vitest; from-zero replay.

**7. Results and retained evidence (Executed-local):** replay **279 applied / 0 failed**; suspension_gate_suite **12/12**; all prior suites green; klimr_ready 42; rpc_grants 98/0; vitest 326/326; eslint 0 errors; build clean.
**Two honest failures found by the suite itself, both fixture bugs, both worth recording:** (a) 0008's `guard_account_status` silently REVERTS a status change unless the caller is `service_role` — my fixture suspended as `postgres`, so the suspension never persisted and the gate correctly allowed an active member; suspending as `service_role` (as production moderation does) fixed it. Had the baseline check not existed, this would have looked like a passing suite measuring nothing. (b) a wrong enum literal (`removed` vs `rejected`). Both are exactly the "verify the fixture before believing the result" rule paying for itself.

**8. Migration/deploy/rollback:** paste 0279 (idempotent; trigger creation is drop-then-create per table, guarded by `to_regclass`). Rollback: drop the triggers. Deploy the app changes with the batch. Compatible with the currently deployed build: the gate only denies accounts that are already suspended/banned.

**9. Observability/operator:** failed suspensions now log and redirect with `?error=status-update-failed` instead of appearing successful; Auth-ban failures log distinctly while the DB gate keeps enforcing.

**10. Residual risk / non-goals:** the trigger covers a named 30-table member-write surface — a future member-content table must be added to that list (a follow-on guardrail should assert coverage from the catalog). Storage-object writes are governed by Storage policies, not this trigger (separate packet). `ban_duration` behavior on refresh tokens is version-dependent and needs P-STAGING confirmation. KFU-033 (adult admission) will reuse this same eligibility machinery in its own packet, per the reconciliation.

**11. Independent reviewer:** non-author review owed before GO.

**Status: FIXED-EXECUTED (database containment proven with negative controls; Auth-ban behavior owed P-STAGING).**

---

## P0 — Courtside enrollment, permanent (KFU-001)

**1. Findings addressed:** KFU-001 (P0) — possession of the public join/display code could be exchanged for an operator-capable device token.

**2. Root cause:** `courtside_register` accepted a value that is public by design (poster, walk-up QR, signage URL, public queue projection) and returned a fresh operator token; the upsert also cleared `revoked_at`, so revocation lasted until the next registration. 0235 built the right fix in Aug 2026 but was reverted 2026-08-11 because the route shipped without its migration and without the tablet batch — a DEPLOY-ORDER failure, not a design failure.

**3. Design and trust boundary (OD-1, owner-approved: auditor's proposed default):** a signed-in organizer mints a one-time enrollment secret in their own session; the server stores only SHA-256 and binds the challenge to session + court + audience `courtside-operator`, default TTL 2 minutes (hard cap 30). Registration CONSUMES the challenge under a single-statement claim (expiry, prior consumption, revocation, audience and a live session are all in the claim predicate, so two devices racing one secret cannot both enroll). **The server hashes the secret itself** — a leaked hash is not a credential. `revoked_at` clearing is safe only on this path because reaching it requires a secret issued AFTER the revocation. `courtside_authorize` re-checks scope at command time (device not revoked, session matches, session live). Both legacy `courtside_register` overloads are DROPPED so the vulnerable shapes are unreachable (0214's lesson: a differing default set adds an overload rather than replacing it).

**4. Files and migrations changed:** `supabase/migrations/0280_courtside_enrollment_permanent.sql` (new); `supabase/tests/courtside_enrollment_suite.sql` (new, hooked); `app/api/courtside/register/route.ts` (secret scheme); `lib/courtside-install.ts` (no auto-enrollment; `ensureDeviceToken` now takes an enrollment secret); `components/queue/court-display.tsx` (**stopped auto-enrolling from the join code at two sites** — presents the held token or tells the operator to get a code); `lib/database.types.ts`; two guardrail probes updated to the new scheme. `app/queue/courtside-actions.ts` (organizer issuance) already existed from the 0235 era and needed no change.

**5. Tests added:** courtside_enrollment_suite, **16 checks** — non-organizer cannot issue; public JOIN code enrolls nothing; public DISPLAY code enrolls nothing; invented secret enrolls nothing; no device rows exist after those attempts; **BASELINE a fresh organizer challenge DOES enroll**; device bound to the named session; REPLAY refused; EXPIRED refused; REVOKED challenge refused; device authorized for its own session; SCOPE — cannot operate a different session; copied install id with wrong token refused; revoked DEVICE refused; **revocation STICKS (public code cannot re-enroll it)**; ended session refused.

**6. Commands actually executed:** applied 0280 on from-zero head; ran the matrix (five honest iterations — see 7); tsc; eslint; vitest; from-zero replay.

**7. Results and retained evidence (Executed-local):** replay **280 applied / 0 failed**; courtside_enrollment_suite **16/16**; suspension 12; invoker 2; teams 16; match_visibility 19; feed 15; rls 26; concurrency clean; klimr_ready 42; rpc_grants 98/0; vitest **326/326**; eslint 0 errors; build clean.
**Iterations worth recording:** (a) paste-law caught three `select…into` / `returning…into` forms plus two occurrences inside my own comments; (b) a data-modifying CTE cannot sit in a scalar subquery — restructured while keeping the single-statement claim; (c) `pgcrypto.digest` is unreachable under `search_path = public` on Supabase, so the migration uses built-in `sha256()`; (d) two suite fixtures wrongly read a server-only table as a member — corrected to use the id the issue call returns, which is what the UI does; (e) **the 2026-08-11 coupling guardrail fired correctly** when the route and RPC moved but the client had not — the exact half-shipped state that darkened every display, caught by the test written after that incident.

**8. Migration/deployment/rollback:** paste 0280 AFTER 0276–0279. Deploy order is safe in both directions: with 0280 pasted and the old app deployed, enrollment stays refused (identical to today's C0 state — no working display breaks, because none currently work); with the new app deployed, organizers issue codes and displays enroll. Rollback: re-apply 0276 (containment) — never 0263.

**9. Observability/operator:** organizer issues codes at Queue → Displays (existing action, `XXXX-XXXX-XXXX`, shown once); a display with no token shows the queue read-only and instructs the operator; refusals are uniform (no oracle).

**10. Residual risks / non-goals:** HTTP-level exploit replay against the deployed route and the QR UX pass are owed at **P-STAGING** (the audit requires HTTP + real-role evidence for final closure; database-level negatives are complete here). Physical possession of an enrolled tablet is out of scope by design — revocation is the control. Court binding is stored and enforced through the session; a future multi-court session would need per-court device scoping.

**11. Independent reviewer:** **required before Courtside is re-enabled** — the audit states a security reviewer must sign off on this packet specifically. Recommend sending 0280 + the 16-check matrix to the auditing model as the reviewer for this packet.

**Status: FIXED-EXECUTED at the database and application layers (16/16 negative matrix, from-zero). Final P0 closure pending P-STAGING HTTP replay + non-author security sign-off.**

---

## B1 — AAL2 at the database boundary (KFU-003)

**1. Findings addressed:** KFU-003 (P1) — MFA/AAL2 was enforced only while a request passed through Next middleware and the app-side step-up helper; an AAL1 access token calling PostgREST/RPC directly met neither.

**2. Root cause:** middleware is not a trust boundary. The D8 "sensitive mutation" classification existed in application code (`lib/step-up.ts`, `lib/step-up-rules.ts`) with no counterpart in the database.

**3. Design and trust boundary:** `caller_aal()` reads the assurance level from the verified JWT and returns null when absent (never upgraded to satisfied); `require_aal2()` raises `aal2_required` unless the caller proved AAL2, with service/definer paths passing through. Enforcement is placed on **ownership-destructive** `team_members` transitions (owner role in/out, owner row delete) — deliberately NOT on ordinary membership writes, because requiring MFA to seat a member or create a team is an over-broad gate, and over-broad gates get switched off by the next person who trips on one. Additional surfaces are added by naming them, not by widening this trigger.

**4. Files and migrations changed:** `supabase/migrations/0281_aal2_database_boundary.sql` (new); `supabase/tests/aal2_boundary_suite.sql` (new, hooked into replay).

**5. Tests added:** 6 checks — `caller_aal()` null when absent; AAL1 caller cannot transfer ownership; **absent claim refused (fail closed)**; removing an ordinary member is unaffected (no over-broad denial); **BASELINE an AAL2 caller CAN transfer ownership** (the gate is not a wall); service path unaffected.

**6. Commands actually executed:** applied 0281 on a faithful from-zero head; ran the suite (three honest iterations — see 7); tsc; eslint; vitest; from-zero replay.

**7. Results and retained evidence (Executed-local):** replay **281 applied / 0 failed**; aal2_boundary_suite **6/6**; all nine suites green; klimr_ready 42; rpc_grants 98/0; vitest 326/326; eslint 0 errors; build clean.
**Method corrections found by running it:** (a) my scratch head had been built from a STALE migration cache missing 0274/0275 — caught because a fixture referenced `join_policy`; the cache refresh now asserts repo-file-count equals cache-file-count before building, and the authoritative from-zero replays were never affected because they read the repo directly; (b) the first suite draft attempted ownership changes by direct DML, which RLS matched at zero rows — "no error" looked like a gate failure but proved nothing; `team_members` has **no** direct UPDATE policy, so the suite now exercises the real DEFINER commands, inside which the trigger still sees the caller's identity.

**8. Migration/deployment/rollback:** paste 0281 after 0280. No app change required — the app-side step-up checks remain as the first line and now agree with the database. Rollback: drop the trigger.

**9. Observability/operator:** a refused operation returns `aal2_required` with a hint to re-authenticate with a second factor.

**10. Residual risks / non-goals:** **P-STAGING owed** — that hosted Supabase Auth issues the `aal` claim as expected must be OBSERVED, not inferred from this migration; the audit says so explicitly and I am not claiming otherwise. The sensitive surface currently covers team ownership; account-lifecycle and payment surfaces are named for follow-on packets as those commands land. Route-level classification (`lib/route-manifest.ts`) is unchanged.

**11. Independent reviewer:** non-author review owed before GO.

**Status: FIXED-EXECUTED at the database layer (6/6 with baseline and fail-closed controls). Hosted `aal` claim behaviour owed P-STAGING.**

---

## B2 — Block-aware profile boundary (KFU-004)

**1. Findings addressed:** KFU-004 (P1) — a blocked member could bypass the block-aware `profiles_public` view by reading the base `profiles` table directly through PostgREST.

**2. Root cause (verified in the live catalog, not inferred):** 0236's view is correct and block-aware, but 0191 grants `authenticated` SELECT on ~35 base-table columns, and the base table's RLS SELECT policy was literally `using (true)`. The view was a front door with the back door still open — a member could select the same columns from the relation the view reads.

**3. Design and trust boundary:** the boundary moves to the table. The SELECT policy now permits a row when it is the caller's own, or when caller and subject are not blocked in EITHER direction, using **the same `is_blocked_pair` helper the view uses** — one definition of "blocked" rather than a second copy that can drift (0238 deleted two such copies for exactly this reason; the helper's in-body guard permits the call because the caller is one of the pair). Service role and SECURITY DEFINER paths bypass RLS and are deliberately unaffected: moderation, feed projection and admin surfaces must still resolve names across a block.

**4. Files and migrations changed:** `supabase/migrations/0282_profiles_block_boundary.sql` (new); `supabase/tests/profile_block_boundary_suite.sql` (new, hooked into replay).

**5. Tests added:** 9 checks — **BASELINE before any block A can read B** (so the suite provably measures something); blocker cannot read the blocked row from the base table; a single granted column returns nothing (no column-level bypass); the blocked member cannot read the blocker (both directions); **COUNT parity** — a blocked row is not countable while an unrelated one is; a member always reads their own row (no self-lockout); an unrelated member stays readable (no over-broad denial); **view and base table agree** on a blocked pair; the service path still resolves both sides.

**6. Commands actually executed:** applied 0282 on a faithful from-zero head (cache count-asserted first); ran the suite; tsc; eslint; vitest; from-zero replay.

**7. Results and retained evidence (Executed-local):** replay **282 applied / 0 failed**; profile_block_boundary_suite **9/9 on first execution**; ten suites green; klimr_ready 42; rpc_grants 98/0; vitest 326/326; eslint 0 errors; build clean.

**8. Migration/deployment/rollback:** paste 0282 after 0281. No app change required — every existing read either already used the view or now gets the same answer from the table. Rollback: restore the `using (true)` policy (not advised; it is the finding).

**9. Observability/operator:** none needed; a blocked row is simply absent, which is the same shape the view already produced.

**10. Residual risks / non-goals:** **P-STAGING owed** for the audit's cache/RSC-serialization and query-cost items — that a blocked profile does not survive in a cached RSC payload, and the measured cost of the added predicate under production row counts. Column exposure is still governed by the 0191 grant list; this packet changes row visibility, not the column set. Other relations that embed profile data (search index, feed projections) are DEFINER-mediated and were not in scope here.

**11. Independent reviewer:** non-author review owed before GO.

**Status: FIXED-EXECUTED at the database layer (9/9 with baseline, both directions, count parity). Cache/RSC and cost evidence owed P-STAGING.**
