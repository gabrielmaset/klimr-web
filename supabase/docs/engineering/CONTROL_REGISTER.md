# Klimr engineering control register

Completed 2026-08-10 against the installed rules package. **A control is listed as
`ENFORCED NOW` only if it currently runs on the protected branch and has been observed to
fail a deliberately noncompliant case.** Everything else is `RATCHET/ADOPTION` or
`PUBLIC-GO BLOCKER`.

Known audit P0/P1 issues, exposed secrets, auth/privacy/RLS bypasses, schema-integrity
failures, applicable KEVs, and required acceptance-test failures are **not** eligible to be
recorded as an accepted baseline.

## Enforced now

| ID | Rule source | Enforcement | Scope | Evidence / last result | Owner | Fails a bad case? |
|---|---|---|---|---|---|---|
| C-01 | testing-quality | `npx tsc --noEmit` in CI | repo | exit 0 | Claude | yes — type error blocks |
| C-02 | testing-quality | `npm run lint` → `eslint --max-warnings 137` in CI | repo | exit 0 at 137 | Claude | **yes — verified 2026-08-10: exit 1 at 138** |
| C-03 | testing-quality | `npm test` (vitest) | repo | 244 passing, 24 files | Claude | yes |
| C-04 | supply-chain-ci | `npm run build` in CI | repo | compiles, 88/88 pages | Claude | yes — caught `node:dns` in a client bundle |
| C-05 | database-supabase | Migration replay **from zero** | schema | 234 applied, 0 failed | Claude | **yes — verified: broke 0188, gate exited 1** |
| C-06 | database-supabase | Migration replay **from production baseline** | schema | 233 applied, 0 failed | Claude | yes |
| C-07 | database-supabase | Real-role RLS negative suite | schema | 26 checks, PASS | Claude | yes — anon/authenticated/service_role, both directions |
| C-08 | data-access-invariants | Concurrency suite, 2 synchronized psql sessions | schema | 5 races, PASS | Claude | **yes — verified: reverted a lock, got `2, want 1`** |
| C-09 | CLAUDE.md | `klimr_ready()` — 16 boundary sentinels, discovered by name | schema + boot | 16/16 pass | Claude | yes — count assertion catches a *deleted* check |
| C-10 | supply-chain-ci | Node 22 pinned across engines/.nvmrc/CI/README | build | doc-claims test asserts all four agree | Claude | yes |
| C-11 | CLAUDE.md | doc-claims tests bind 4 control documents to code | repo | claims verified | Claude | yes |
| C-12 | silent-failure-canaries | `klimr_health()` — 9 absence canaries | production | all ok | Gabriel | **yes — closed a real 12-min outage on first use** |
| C-13 | supply-chain-ci | `supabase/config.toml` — config as code, `config diff` reports drift | Supabase | installed, not yet pushed | Gabriel | pending first push |

## Ratchet / adoption

| ID | Gap | Baseline | Interim control | Target |
|---|---|---|---|---|
| R-01 | Lint backlog | 137 warnings, 0 errors | ceiling asserted in tests; cannot rise | reduce per batch |
| R-02 | `noUncheckedIndexedAccess` unset | — | `strict` on; new code written to survive it | enable after backlog review |
| R-03 | No SAST | none | manual review + rules | add CodeQL |
| R-04 | No secret scanning | none | secrets never in repo by convention | add gitleaks — **highest value per effort** |
| R-05 | No SCA / SBOM / KEV | none | — | `npm audit` + CycloneDX in CI |
| R-06 | No CI-audited API/boundary inventory | none | route manifest exists (KCDX-039) | extend to full inventory |
| R-07 | No CODEOWNERS | none | single owner | add on second contributor |

## Public-GO blockers

| ID | Blocker | Why it cannot be waived |
|---|---|---|
| B-01 | **No Storage backup executed** | A database restore returns every row pointing at bytes that no longer exist. Tooling built and scheduled; never run. |
| B-02 | **No restore drill; RPO/RTO unvalidated** | `RESILIENCE.md` targets are inferences from the backup schedule, not measurements. Marked UNVALIDATED in the doc and asserted by test. |
| B-03 | **No browser evidence** | No Playwright, no axe, no field Core Web Vitals. WCAG 2.2 AA is claimed nowhere and proven nowhere. |
| B-04 | **No qualified non-author reviewer** (ADAPTATION 1) | Compensating controls are weaker than a specialty human review. Must not become permanent by default. |
| B-05 | **No build provenance / SLSA** | The served artifact is not attested. |

## Verification questions, answered

- *Does the control fail a deliberately noncompliant case?* C-02, C-05, C-08, C-09, C-12 have been observed failing. The rest are asserted but not yet adversarially proven — that is the next pass.
- *Can Claude bypass it?* CI gates run in GitHub Actions, not locally. Branch protection status is **unknown to Claude and must not be inferred** from repository text.
- *Does it run on the served artifact?* Not yet — Vercel rebuilds. Recorded as B-05.
- *Is a human alerted on failure?* CI failure is visible; `klimr_health()` is pull-only, with no alerting. Gap.
- *Is evidence tied to revision/build/schema?* Partly — the migration ledger and readiness checks are; CI artifacts are not retained.
