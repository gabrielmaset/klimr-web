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

---

## B4 — Adult admission (KFU-033)

**1. Findings addressed:** KFU-033 (P1 under the current 18+ posture, D-38) — 0271 rejects a known minor but a profile with NO birth date passes, and the signup trigger creates a profile before onboarding runs, so a direct data-plane client can hold an active member profile that never met the age check.

**2. Root cause:** the platform had a *rejection* rule and no *admission* rule. Absence of evidence was treated as evidence of adulthood.

**3. Design and trust boundary (per the reconciliation — share KFU-028's machinery, keep separate closure):** a server-set `profiles.adult_attested_at` becomes the trusted fact. Writing an adult birth date through any legitimate path grants it (that IS what self-attestation means, and 0271's rule guarantees any stored date is adult); a null birth date earns nothing. Members cannot forge it — the column is outside the 0191 member grant list AND the trigger reverts a hand-set value, so two independent defenses stand. `member_write_allowed()` — H3's single eligibility predicate, already wired to the 30-table `enforce_active_member` trigger — now means **active AND admitted**, so admission is enforced everywhere suspension is with no second mechanism to drift. `enforce_active_member` distinguishes the two refusals (`admission_required` vs `account_not_active`) so an un-onboarded member gets an accurate message. `attest_adult(date)` is the explicit validated command.

**HONEST NAMING:** this is self-attestation, recorded as such in the migration and the column comment. It is not identity verification; the stepped-up verified-identity programme remains separate and later.

**4. Files and migrations changed:** `supabase/migrations/0283_adult_admission_state.sql` (new); `supabase/tests/adult_admission_suite.sql` (new, hooked); fixture corrections in `suspension_gate_suite.sql`, `aal2_boundary_suite.sql`, `feed_visibility_suite.sql`, `profile_block_boundary_suite.sql`, `supabase/harness/concurrency.sh`. **No app change was required** — onboarding already writes the member's own `date_of_birth`, which the trigger converts into admission; a suite check proves that exact production path.

**5. Tests added:** 12 checks — BASELINE adult admitted; admitted adult can write; **null-age profile is NOT admitted**; null-age member write refused with `admission_required`; **member cannot forge the fact** (either defense passes; the assertion is on end state); minor refused by the command; refused attempt leaves nothing behind; **exactly 18 today is admitted** (inclusive boundary); the command stores the attested date; **one day short of 18 is refused**; **the real onboarding path (member writes own adult DOB) earns admission**; suspension still overrides admission; service path unaffected.

**6. Commands actually executed:** applied 0283 on a faithful from-zero head; ran the new suite plus every dependent suite; tsc; eslint; vitest; two from-zero replays.

**7. Results and retained evidence (Executed-local):** replay **283 applied / 0 failed**; adult_admission_suite **12/12**; all eleven suites green (rls 26, concurrency clean, feed 15, match 19, teams 16, invoker 2, suspension 12, courtside 16, aal2 6, block 9, admission 12); klimr_ready 42; rpc_grants 98/0; vitest 326/326; eslint 0 errors; build clean.
**Blast radius, found by running rather than assuming:** the new rule initially broke three suites whose fixtures created members who never onboarded and then had them write — concurrency, feed_visibility and profile_block_boundary. Two failures were the SAME recorded law biting again: the `auth.users` trigger auto-creates profile rows, so `ON CONFLICT DO NOTHING`/partial `DO UPDATE` silently dropped the fixture's birth date. Fixtures corrected to represent onboarded members; the rule itself was not weakened to make tests pass.

**8. Migration/deployment/rollback:** paste 0283. The migration backfills admission for every profile that already carries an adult birth date and **prints two NOTICEs**: how many it attested, and how many active profiles remain unattested and therefore cannot make member writes until they finish onboarding. On the local from-zero database both were 0; **in production the second number is the one to read** — those accounts must complete onboarding. Rollback: revert `member_write_allowed` to the H3 form.

**9. Observability/operator:** `admission_required` carries a hint pointing at onboarding; the paste output states the unattested inventory rather than leaving it to be discovered.

**10. Residual risks / non-goals:** self-attestation only — no identity proof. Storage-object writes are governed by Storage policies, not this trigger. Existing unattested accounts are intentionally write-blocked rather than silently grandfathered; that is the admission rule doing its job, and the count is surfaced at paste time.

**11. Independent reviewer:** non-author review owed before GO.

**Status: FIXED-EXECUTED (12/12 including both boundary directions, forgery, and the real onboarding path).**

---

## B5 — Function contracts (KFU-031)

**1. Findings addressed:** KFU-031 (P2 security control) — policy dependency was being treated as proof that a function is safe as an arbitrary direct RPC, and nothing removed a grant when its policy dependency disappeared.

**2. Root cause:** 0268's reconciler is right that a policy's role needs EXECUTE (proven by executed baseline). The unsound inference rode alongside it: a function safe when a POLICY supplies its arguments (row + `auth.uid()`) is not automatically safe when a CALLER supplies them. The auditor named `is_match_participant(match_id, user_id)` and `is_match_organizer(...)` as concrete relationship oracles.

**3. Design and trust boundary (the auditor's design, adopted over my blanket-binding proposal):** four-class taxonomy recorded in `public.function_contracts` keyed by **exact signature** — `public_rpc` / `policy_only` / `trigger_service` / `anon_predicate` — so exposure is a recorded decision, not an inference. Caller binding applied only where verified safe. Two general controls replace instance-fixing: `identity_oracle_candidates()` (policy-referenced, takes a uuid, body never consults `auth.uid()`) and `stale_policy_grants()` (executable by anon/authenticated, no policy references it, no contract claims it).

**4. Files and migrations changed:** `supabase/migrations/0284_function_contracts.sql` (new); `supabase/tests/function_contracts_suite.sql` (new, hooked into replay).

**5. Tests added:** 8 checks — the two named oracles refuse an arbitrary subject; a member may still ask about themselves (binding is not a wall); **BASELINE the match policy still resolves for a real participant** (the binding did not break the thing the grant exists for); **planted grant observed red** by `stale_policy_grants()` and **clearing once revoked** (the control is neither blind nor stuck on); the registry covers the application RPC surface by exact signature; `member_write_allowed` is no longer member-executable.

**6. Commands actually executed:** verified all seven call sites of each helper before binding anything; applied 0284; ran the new suite plus every enforcement suite that could have been broken by the revokes; tsc; eslint; vitest; from-zero replay.

**7. Results and retained evidence (Executed-local):** replay **284 applied / 0 failed**; function_contracts_suite **8/8 first run**; twelve suites green; klimr_ready 42; rpc_grants 98/0; vitest 326/326; build clean.

**What the general controls found that the audit did not name — the reason to write a predicate instead of fixing instances:**
- The oracle predicate reported **seven** functions of the same shape, not two. Three more were verified safe to bind (`is_team_manager`, `is_team_member`, plus the two named); **`is_conversation_participant` was deliberately NOT bound** because 0011 legitimately evaluates a second subject `(conversation_id, recipient_id)` — precisely the "do not apply one blanket rewrite" case the auditor flagged. It stays declared and reported until its internal and public contracts are split.
- The stale-grant control reported grants that outlived their reason, and among them **an oracle I introduced myself earlier the same day**: `member_write_allowed(uuid)` was granted to `authenticated` in 0279, so any member could ask whether *another* account was suspended or un-onboarded. Revoked, along with `caller_aal()` and `require_aal2()`. Every caller of these is a SECURITY DEFINER function, so enforcement is unaffected — proven by re-running all five enforcement suites after the revoke.

**8. Migration/deployment/rollback:** paste 0284 after 0283. No app change. Rollback: re-grant the three helpers (not advised) and drop the registry.

**9. Observability/operator:** `identity_oracle_candidates()` and `stale_policy_grants()` are service-role reports intended for the release checklist; the registry records why each exposed function is exposed.

**10. Residual risks / non-goals (stated, not hidden):** `stale_policy_grants()` currently reports **34** actionable grants — genuine untidy exposure to be worked down in follow-on packets. **It is deliberately NOT gated at that number**: encoding 34 as an accepted baseline would be exactly the "gate with a tolerance" this project forbids. Trigger-returning functions are excluded on principle (PostgreSQL refuses direct invocation), not as a tolerance. `is_conversation_participant` and `is_business_manager` remain reported pending their own packets. The audit's real-PostgREST `/rpc` negatives as anon and unrelated members remain **P-STAGING**.

**11. Independent reviewer:** non-author review owed before GO.

**Status: FIXED-EXECUTED for the named oracles and the control design (8/8 with planted controls proven red). Residual exposure is reported, quantified and un-gated by design.**

---

## D1/D2 — Erasure semantics and DSAR coverage (KFU-006, KFU-030)

**1. Findings addressed:** KFU-006 (P1) — account erasure had no declared semantics per artifact, failures were not isolated, physical deletion unverified. KFU-030 (P1) — DSAR coverage was built from a hardcoded list in the route, and a single `status` conflated "every query succeeded" with "we covered everything we hold".

**2. Root cause (both):** coverage was an opinion held in application code. 69 public tables reference `profiles` with **different FK delete rules**, several of them NO ACTION or SET NULL, so what actually happens to a person's data on erasure varied per table and was written down nowhere. The export measured itself against the same list that produced it, which cannot detect an omission.

**3. Design and trust boundary:** one versioned declaration, checked against the catalog rather than against itself. `public.data_inventory` records, per user-referencing table, what it holds, what the export does with it (`included` / `excluded_e2ee` / `excluded_shared` / `excluded_safety` / `not_personal`), and what erasure does (`cascade` / `delete` / `anonymize` / `retain_safety` / `retain_legal`). `erasure_semantics_gaps()` reports undeclared tables **and declarations that contradict the real FK delete rule**. `export_declared_datasets()` is read by the export route at runtime, so coverage is measured against the declaration.

**4. Files and migrations changed:** `supabase/migrations/0285_data_inventory.sql` (new); `supabase/tests/data_inventory_suite.sql` (new, hooked); `app/settings/export/route.ts` (attempted-dataset recording; `coverage_status` + `missing_datasets` + `query_integrity` as separate facts; `format_version: 4`; `status` now the honest conjunction); `lib/database.types.ts`; `docs/DATA-GOVERNANCE.md`; two guardrail/doc-claims assertions repointed.

**5. Tests added:** 9 checks — no declaration contradicts its FK rule; **planted false cascade detected, then clearing when corrected**; **a newly created user-referencing table is reported undeclared**, and declaring it clears the gap; the export's declared surface is plausible and every included artifact names its dataset; **exclusions carry a recorded reason** (not silent omission); the inventory is service-only.

**6. Commands actually executed:** applied 0285 on a faithful from-zero head; ran the suite; tsc; eslint; vitest; from-zero replay.

**7. Results and retained evidence (Executed-local):** replay **285 applied / 0 failed**; data_inventory_suite **9/9**; **thirteen suites green**; klimr_ready 42; rpc_grants **99**/0; vitest 326/326; eslint 0 errors; build clean.
**What the control found on its first run — the reason this design was worth building:** `notifications.user_id` is declared in the inventory as part of a member's data, and the FK delete rule is **SET NULL, not CASCADE**. Deleting an account would have left notification rows — titles and bodies about that person — with a null user id. My own first declaration said "cascade"; the catalog said otherwise and the control caught it immediately. The declaration is now `delete`, with the reason recorded inline, meaning erasure must remove them explicitly.

**8. Migration/deployment/rollback:** paste 0285 after 0284. The migration prints the current gap count as a NOTICE. Deploy the app change with the batch — the export gains fields; no field was removed. Rollback: drop the inventory and revert the route to `format_version: 3`.

**9. Observability/operator:** a DSAR archive now states `coverage_status`, `missing_datasets` and `query_integrity` separately, so a partial export cannot present itself as complete; `erasure_semantics_gaps()` is a release-checklist control.

**10. Residual risks / non-goals (stated plainly):** **51 user-referencing tables remain UNDECLARED** and are reported by the control. That is a real work list, deliberately not defaulted to a convenient value — a default here would be a guess about someone's personal data — and deliberately **not gated at 51** (no gate with a tolerance). The erasure COMMAND itself (executing the declared semantics per artifact, per-account failure isolation, and physical Storage-object verification) is the next packet; this one establishes the semantics it must implement. Physical byte-deletion proof remains **P-STAGING**.

**11. Independent reviewer:** non-author review owed before GO.

**Status: FIXED-EXECUTED for the declaration and controls (9/9, both plants proven). The erasure execution command and Storage-byte verification remain OPEN and scheduled.**

---

## S1 — Preservation outcomes and CSAE escalation (KFU-007, KFU-029)

**1. Findings addressed:** KFU-007 (P1) — preservation outcomes were neither returned nor checked, and the original object was deleted regardless. KFU-029 (P1) — `containsCSAE` was defined and called from nowhere, so an AI-classified CSAE verdict was handled as an ordinary refusal: bytes dropped, nothing preserved, no incident.

**2. Root cause:** `escalateCSAE` returned `void` with each step wrapped in a bare `catch { console.error }`, so quarantine-upload failure and incident-insert failure were both invisible to the caller — which then removed the original unconditionally. This is the project's own recorded footgun (Storage and PostgREST report failure in a **resolved** object, not by throwing) sitting in the one path where the mistake is irreversible: the object IS the evidence, and in the CSAE case its preservation is legally required. Separately, the AI classification path returned its verdict without ever asking whether the categories named a minor — the `ai_csae_flag` escalation kind existed for exactly that and had no caller.

**3. Design and trust boundary:** the destroy decision becomes a pure, testable rule and moves out of the server-only modules. `lib/safety-rules.ts` holds `mayDestroyOriginal()` — the original may be destroyed only when a durable quarantine copy **and** a durable incident row both exist — plus `preservationHoldReason()` and `requiresCsaeEscalation()`. `escalateCSAE` now returns an observed `EscalationResult` with both resolved error objects explicitly checked, and treats a failed safety-contact alert as serious but **not** as preservation (conflating them would retain objects for the wrong reason). Both destruction sites are gated by the rule; when preservation is incomplete the original is RETAINED (it is already unpublishable) and the reason is logged for the operator. The AI path now routes a minors verdict through preservation and escalation before deciding anything, and never publishes either way.

**4. Files changed:** `lib/safety-rules.ts` (new, pure); `lib/safety-rules.test.ts` (new, 10 executed tests); `lib/safety-escalation.ts` (typed result, checked errors); `lib/media-safety.ts` (rule-gated removal in both paths, AI CSAE wiring); `tests/guardrails.test.ts` (three wiring assertions).

**5. Tests added:** **10 executed unit tests** — destruction allowed only with both durable artifacts; refused when the copy failed; refused when the incident failed; refused when both failed, with the reason naming it; a failed *alert* does not block destruction (the two are not the same fact); the OpenAI `sexual/minors` category routes to escalation; hash-match and generic CSAE labels route; case and padding from a vendor do not defeat it; ordinary refusals (`sexual`, `violence`) do **not** escalate; empty/missing categories are not treated as a match. Plus 3 wiring guardrails asserting every removal site is gated and both resolved errors are checked.

**6. Commands actually executed:** tsc; eslint; full vitest; production build.

**7. Results and retained evidence (Executed-local):** vitest **339/339** (up from 326 — 13 new); tsc 0; eslint 0 errors; build clean. The decision that protects the evidence is now proven by execution rather than by reading.

**8. Migration/deployment/rollback:** no migration. App-only; deploy with the batch. Rollback: revert the two library files.

**9. Observability/operator:** a failed preservation now logs `ORIGINAL RETAINED` with the specific reason and the path, so an operator can complete preservation by hand; previously the same failure was a silent `console.error` followed by deletion.

**10. Residual risks / non-goals (stated):** these are unit and wiring proofs. **Fault injection against live Storage and a live classifier remains P-STAGING**, exactly as the audit requires — I am not claiming adapter-live evidence. KFU-008 (binding each screening result and attestation to an immutable object key/version plus digest, rejecting stale or mock scanners) and KFU-009 (payment-proof digest wired into the command) are the next packet; the remaining upload surfaces and the video gate stay open.

**11. Independent reviewer:** non-author review owed before GO.

**Status: FIXED-EXECUTED for the preservation rule and CSAE routing (13 executed tests). Adapter-live fault injection owed P-STAGING.**

---

## S2 — Evidence binding and the uncalled verifier (KFU-008, KFU-009)

**1. Findings addressed:** KFU-008 (P1) — screening results and attestations were not bound to an immutable object identity plus digest, and nothing rejected stale, mock or dead scanners. KFU-009 (P1) — 0245 built `verify_payment_proof_object()`, proved it with an allow case and three denials, and then **nothing ever called it**; the submit command still only checked that the path string was non-empty.

**2. Root cause:** verdicts were computed in memory and discarded, so no record tied "these bytes were screened by this scanner under this policy" to anything, and a reviewed decision could not be connected to the bytes it was made about. On the payment side, a verifier that is never called is a comment — the path string from the client remained the only input, so a guessed path, a path to nothing, another registration's prefix, or someone else's upload could all be recorded as a submitted payment.

**3. Design and trust boundary:** `media_screenings` is the evidence ledger, keyed by **(bucket, path, sha256)** — by the BYTES, not the path. A replaced object produces a new digest, which has no evidence, so it cannot inherit an earlier clean verdict; a path-keyed ledger would have allowed exactly that swap. `media_evidence_current()` is the fail-closed publish predicate: clean verdict, for this digest, from a real scanner (never `none`/`mock`/`stub`/`disabled`), within the **caller's** freshness bound rather than a hard-coded constant. On the payment side the submit command now calls the 0245 verifier and records a `proof_fingerprint` (etag/size/mtime) so bytes replaced under a reviewed decision are detectable.

**4. Files and migrations changed:** `supabase/migrations/0286_evidence_binding_wired.sql` (new); `supabase/tests/evidence_binding_suite.sql` (new, hooked). Registered in both governance surfaces built earlier today: the two new functions in `function_contracts`, and `media_screenings` in `data_inventory` as `excluded_safety` / `retain_safety`.

**5. Tests added:** 12 checks — BASELINE clean evidence permits publication; **replaced bytes have no evidence**; unscreened object fails closed; **a mock/disabled scanner is not evidence**; **stale evidence fails the freshness bound** while a wider bound accepts the same row (the bound is the caller's); a `match` verdict never publishes; duplicate evidence for one object+digest is refused; the ledger is service-only; the payment command **calls** the verifier; it records a fingerprint; **a fabricated proof path is refused rather than recorded**.

**6. Commands actually executed:** applied 0286 on a faithful from-zero head; ran the suite; tsc; eslint; vitest; from-zero replay.

**7. Results and retained evidence (Executed-local):** replay **286 applied / 0 failed**; evidence_binding_suite **12/12 first run**; **fourteen suites green**; klimr_ready 42; rpc_grants 99/0; vitest 339/339; eslint 0 errors; build clean.
**Caught in my own migration by our own law:** I carried `select … into v_r` across from 0193 when rewriting the command. That record form cannot survive the Supabase SQL editor's paste scanner, so the whole command was rewritten in scalar assignment form — same semantics, pasteable. The into-scan is why it was caught before delivery rather than in your editor.

**8. Migration/deployment/rollback:** paste 0286 after 0285. The command keeps its signature, so no app change is required for KFU-009; the ledger has no writer yet (see residual). Rollback: restore the 0193 body.

**9. Observability/operator:** a refused proof returns `proof_object_invalid` instead of silently recording an unverifiable payment; the fingerprint gives a reviewer something to compare against.

**10. Residual risks / non-goals (stated plainly):** the **ledger is not yet written to** — `screenAndClassifyPhoto` must record its verdict, and the publish path must consult `media_evidence_current()`. That app wiring is the next step of this packet and is deliberately not claimed here; today's work is the durable, tested substrate it needs. Attestation binding for the remaining upload surfaces (avatars, listings, credential documents) and the video gate stay open. Live-adapter and real-Storage proof remains **P-STAGING**.

**11. Independent reviewer:** non-author review owed before GO.

**Status: FIXED-EXECUTED for the payment-proof wiring (KFU-009) and the evidence substrate + publish predicate (KFU-008 database half, 12/12). The screening-write and publish-gate wiring is OPEN and next.**

---

## S2b — Screening ledger written and consulted (KFU-008, app half)

**1. Findings addressed:** KFU-008 remaining half — the evidence ledger built in 0286 had no writer, and no publish path consulted it.

**2. Root cause:** verdicts were computed and discarded (S2 built the substrate; this wires it).

**3. Design and trust boundary:** every terminal screening decision — `clean`, `match`, `undecided`, `csae_escalated` — now writes a row carrying the digest, the scanner **provider and version**, and the **policy version** (`moderationScanner()` / `MODERATION_POLICY_VERSION`, new exports, so evidence records what actually judged the bytes rather than an assumption). Duplicate evidence for the same object+digest is a unique violation deliberately swallowed: it means "already recorded", not "failure". The publish decision — verdict folding *and* the evidence gate — moved wholesale into `lib/media-safety.ts` as `decidePostModeration()`, which fails closed: a missing digest, an RPC error, or absent/stale/mock evidence all downgrade an otherwise-approved photo to `pending` with a `media_unscreened` label.

**4. Files changed:** `lib/moderation.ts` (scanner + policy version exports); `lib/media-safety.ts` (`recordScreening`, `evidenceAllowsPublish`, `decidePostModeration`); `app/feed/actions.ts` (delegates the decision); `lib/database.types.ts`; `tests/guardrails.test.ts` (3 wiring assertions).

**5. Tests added:** 3 wiring guardrails — all four verdict kinds are recorded; evidence carries scanner and policy version; the action delegates and the module enforces the fail-closed gate.

**6. Commands actually executed:** tsc; eslint; full vitest; production build.

**7. Results and retained evidence (Executed-local):** vitest **342/342**; tsc 0; eslint 0 errors; build clean.
**The size budget did its job and I obeyed it.** Adding the gate pushed `app/feed/actions.ts` past its KCDX-067 line budget. I did not raise the budget — that would be encoding a tolerance in a guardrail. The concern was extracted instead, twice: first the gate, then the whole publish decision, until the action was smaller than before (514 lines vs a 515 budget) and media safety owned its own subject end to end. The budget was the thing that was right.

**8. Migration/deployment/rollback:** no migration (0286 already carries the schema). App-only; deploy with the batch.

**9. Observability/operator:** a held post logs `publish held —` with the specific reason; the ledger records what judged each object.

**10. Residual risks / non-goals:** the gate currently guards the Feed photo path. Avatars, marketplace listings and credential documents still need the same treatment, as does the video gate. Live-Storage and live-classifier proof remains **P-STAGING**.

**11. Independent reviewer:** non-author review owed before GO.

**Status: FIXED-EXECUTED (ledger written at all four decisions; publish gated fail-closed; 342/342).**

---

## I4/I1 — Terminal immutability and the meetup state machine (KFU-013, KFU-010)

**1. Findings addressed:** KFU-013 (P1) — a completed team-match result stayed editable indefinitely, and the app's `recordResult` explicitly re-entered on `status = 'completed'`. KFU-010 (P1) — `listing_meetups` had member DML with no transition matrix and no frozen identities, on the surface where two strangers arrange to meet in person.

**2. Root cause:** 0275 froze status TRANSITIONS and said so in its own comment — non-status edits stayed under the flat manager policy. That comment is how the gap was found: the migration documented its own hole and nobody read it as a finding until the auditor did. For meetups, no guard existed at all.

**3. Design and trust boundary:** terminal rows (`completed` / `declined` / `cancelled`) are frozen against every result-bearing and identity column. The only route to change one is `team_match_correct_result` — manager-gated, requires a stated reason, writes the before/after to an append-only audit table **before** mutating, and unlocks the trigger with a **transaction-local flag** (the 0256/0257 precedent, not a definer bypass) so a direct data-plane write still cannot do it. Corrections are legitimate; silent corrections are not. Meetups gain an insert shape check (must start `proposed`; the proposer must BE the caller and a counterparty — a third party cannot arrange a meeting between two other people), frozen identities, and a transition matrix drawn from the table's own CHECK vocabulary.

**4. Files and migrations changed:** `supabase/migrations/0287_terminal_immutability.sql` (new); `supabase/tests/terminal_immutability_suite.sql` (new, hooked); `app/team/[teamId]/matches/actions.ts` (records a result only for `scheduled`; a finished result points at the correction path).

**5. Tests added:** 16 checks — a completed score, winner and status each refuse direct edits; a non-manager cannot correct; a correction without a reason is refused; **BASELINE the correction command CAN change a finished result** (the freeze is not a wall); the correction recorded before, after and reason; **the transaction-local unlock does not leak to later writes**; a third party cannot arrange a meetup between two other people; a caller cannot propose in someone else's name; a meetup cannot be created already accepted; a counterparty can propose; **who is meeting whom is frozen**; a proposed meetup cannot skip states; the legitimate path works; an agreed meeting can still be cancelled; a cancelled meetup cannot be revived.

**6. Commands actually executed:** applied 0287 on a faithful from-zero head; ran the suite through four honest iterations; tsc; eslint; vitest; from-zero replay.

**7. Results and retained evidence (Executed-local):** replay **287 applied / 0 failed**; terminal_immutability_suite **16/16**; **fifteen suites green**; klimr_ready 42; rpc_grants 100/0; vitest 342/342; eslint 0 errors; build clean.
**Two assumptions corrected by execution:** I wrote `seller_id` on `marketplace_listings` — the column is `listed_by`, caught immediately by the catalog. And I gave meetups a `completed` state; the table's own CHECK constraint permits only proposed/accepted/declined/cancelled, so a guard allowing `completed` would have encoded a status the schema forbids. Both were fixed by reading the catalog rather than trusting the domain word.

**8. Migration/deployment/rollback:** paste 0287 after 0286; deploy the app change with the batch. The app change is strictly narrowing, so an older client simply gets the new refusal. Rollback: restore the 0275 guard body.

**9. Observability/operator:** a refused edit returns `result_is_final` with a hint pointing at the correction path; every correction is queryable by the involved teams' members.

**10. Residual risks / non-goals:** the remaining I-series items are open and scheduled — KFU-011 (queue approval as one locked transaction), KFU-012 (exact-reject roster and capacity units), and the KCDX-046 tournament reconfiguration residual. No UI exists yet for filing a correction; the command is callable and the audit table is readable by involved members.

**11. Independent reviewer:** non-author review owed before GO.

**Status: FIXED-EXECUTED (16/16 including the baseline that corrections still work and the unlock does not leak).**
