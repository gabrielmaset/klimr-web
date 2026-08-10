# Klimr — Master Document Index

Pre-Seed Round · Confidential · **Updated August 10, 2026**

The running index of every document in the Klimr package — investor materials, product and
strategy artifacts, and internal working documents — plus what's still planned.

This file is the machine-maintained master; `Klimr_Document_Index.docx` mirrors it for the data
room. **When the two disagree, this file wins** and the .docx should be re-mirrored from it.

> **August 10 cycle:** the Klimr Codex security remediation closed (68 findings), migrations
> 0191–0234 deployed, the relationship & privacy policy was decided and encoded, and the backup
> programme was designed. Rows marked ⚠ below were reconstructed from session history rather
> than from the August 5 file and should be confirmed against your copy.

---

## Category 1 — Investor materials (data room)

| Document | What it covers | Status |
|---|---|---|
| Executive Summary — `Klimr_Executive_Summary.docx` | The pitch in brief: the ask, the shipped platform, the open-play wedge, business model, use of funds, and the bet. | Regenerated Aug 5 2026 — $900K ask, repaired allocation, precise identity language |
| Market Analysis — `Klimr_Market_Analysis.docx` | SFIA 2026 data, the five court sports, TAM/SAM/SOM, supply tailwind, LA venue beachhead. Court-intel table added as a proprietary supply-measurement asset. | Updated Aug 2026 |
| Target Audience — `Klimr_Target_Audience.docx` | Broad market vs. venue wedge, four segments + organizer/venue/business audiences, personas, 18+ policy. Personas updated with observed August behaviours. | Updated Aug 2026 |
| Competitive Landscape — `Klimr_Competitive_Landscape.docx` | Four competitor groups incl. the PaddleStack-class open-play utilities; feature matrix; moat; honest risks. August added two matrix rows — AI-verified court data (evidence-quoted) and waitlists with timed offer confirmations. | Updated Aug 2026 |
| Go-to-Market — `Klimr_Go_To_Market.docx` | The venue wedge: courtside-display distribution, organizer-ambassadors, three phases, monetization sequencing. Phases 1–2 carry the August wedge hardware and the iPhone/waitlist ship items. | Updated Aug 2026 |
| Match Integrity Strategy — `Klimr_Match_Integrity_Strategy.docx` | Mutual confirmation, two-tier ratings, referees — anchored by court-verified queue matches, extended with waitlist confirmations as affirmative commitment, roster snapshots, consent-signed substitutions. | Updated Aug 2026 |
| Ranking Integrity Threat Model — `Klimr_Ranking_Integrity_Threat_Model.docx` | Attacker playbook and six-layer defense, extended with queue evidence, rotating QR, clustering, automatic point awards, and venues as validated entities. | Updated Aug 2026 |
| Document Index — `Klimr_Document_Index.docx` | Data-room mirror of this file. | ⚠ Mirror is **stale at July 2026** — re-mirror from this file |
| Financial Model — `klimr-financial-model.xlsx` | 18-month operating model, field marketing & event equipment section, Scenarios sheet (Base/Lean/Downside), headcount plan with live contractor start months. 591 formulas, zero errors. | Rebuilt Aug 5 2026 — $900K recommended raise, signed off |

## Category 2 — Product & strategy

| Document | What it covers | Status |
|---|---|---|
| Production platform — `klimr.com` | The live product: verified identity, events, tournaments, teams, feed, classes, marketplace, and the queue/courtside system. Supersedes the interactive demo. | Live |
| Market Study — `klimr-market-study-2026-07.md` | Deep market & competitor research: SFIA 2026, funding landscape, the open-play whitespace, P0 gaps, LA playbook, valuation context. | Jul 2026 |
| Feed 2.0 & Business Accounts Plan — `klimr-feed2-business-accounts-plan-2026-07.md` | Full product spec: social feed (Ace, comments, moderation, recaps, Discover rail) + business accounts, verification tiers, sponsorship system. | Jul 2026 |
| Plan Addendum — `klimr-plan-addendum-liveness-business-console-2026-07.md` | Event Pulse liveness design, business sign-up field inventory, blue business console IA. | Jul 2026 · superseded by Plan v2 |
| Plan v2 Consolidated — `klimr-plan-v2-consolidated-2026-07.md` | The binding build plan: platform foundations, evidence-ledger liveness, verification state machines, sponsorship lifecycle, security contracts, phases, and confirmed decisions (18+, three strikes, milestone-bucket analytics, no payments v1). | Jul 2026 · Authoritative |

## Category 3 — Internal & working

| Document | What it covers | Status |
|---|---|---|
| Design Decisions — `docs/DESIGN_DECISIONS.md` (in repo) | The running engineering log of every shipped decision, newest first — including the mistakes, which are the entries most worth keeping. | Living |
| Master Document Index — `klimr-document-index.md` | This file. The machine-maintained catalog of all deliverables; the .docx mirrors it for the data room. | Living |
| Project Handoff Package — `Klimr_Project_Handoff.md` | Master context: decisions, product spec, brand, infra, conventions. | Living |
| Co-founder Outreach Playbook — `klimr-cofounder-outreach.md` | Strategy and templates for recruiting a technical co-founder / founding engineer. | Living |
| iPhone App Handoff — `klimr-iphone-app-handoff.md` | The iOS program kickoff: history-first operating rule, architecture options, auth-in-shell, native capability checklist, kickoff agenda. Program active (hybrid B, `klimr-ios` repo). | Aug 2026 · Active |
| Independent Audit Assessment — `Klimr_Independent_Assessment_and_Objection_Report_August_2026.md` | Validation of the 74-finding external audit: per-finding statuses, objections O-1–12, additional findings ADD-01–12, founder decisions D1–D17. | Aug 5 2026 |
| Master Remediation Plan — `Klimr_Master_Remediation_Plan_August_2026.md` | The working engineering plan: phases K0–K4, traceability to every audit finding and decision, exit gates, delivery status. Supersedes the external implementation plan. | Aug 5 2026 · Authoritative |
| **Klimr Codex Remediation Ledger** — `docs/AUDIT_REMEDIATION_STATUS.md` | The 68-finding security & reliability audit, per-finding: what was wrong, what was built, what remains. All 8 P0s closed; 14 findings partial with the remainder recorded. Moved into the repo Aug 10 — it had been living in a scratch workspace that resets between sessions. | **Aug 10 2026 · Complete** |

### Repository control documents (in `klimr-web/docs/`)

Each states rules the system must obey and is tied to code by an assertion in
`tests/doc-claims.test.ts` — a claim that drifts from the code fails the build.

| Document | States | Enforced by |
|---|---|---|
| `SECURITY.md` | The security posture and its known gaps | doc-claims tests |
| `docs/DATA-GOVERNANCE.md` | What personal data exists, who may read it, what an export contains | `/settings/export`, doc-claims |
| `docs/RESILIENCE.md` | Backup coverage and RPO/RTO targets — **marked UNVALIDATED until a drill runs** | `storage_manifest_*`, doc-claims |
| **`docs/RELATIONSHIP-PRIVACY-POLICY.md`** | **Who may do what to whom, per relationship — the KCDX-032 policy matrix** | **`may_act_on()`, `may_see_connections()`, the three lists (0233/0234)** |
| `docs/MIGRATIONS_LEDGER.md` | Every migration, what it changes, whether it is applied | reconciled through 0234 |

Also in the repo, non-asserted: `SAFETY.md`, `CHAT.md`, `README.md`, `docs/MINOR-SAFETY.md`,
`docs/MODERATION-SLA.md`, `docs/RUNBOOKS.md`, `docs/METRICS.md`, `docs/PERFORMANCE.md`,
`docs/RANKING-POINTS.md`, `docs/FEED-ARCHITECTURE.md`, `docs/SEARCH-RELEVANCE.md`,
`docs/CLAIMS-REGISTER.md`, `docs/ADDING_A_SPORT.md`, `docs/FEATURE-INTEGRATION-CHECKLIST.md`,
`docs/FONTS.md`, `docs/MONETIZATION-READINESS.md`, `docs/PLACES-COMPLIANCE-INVENTORY.md`,
`docs/SPONSORSHIP-CATEGORIES.md`, `docs/VENUE-PLAYBOOK.md`,
`docs/Klimr_Product_Strategy_and_Page_Roadmap.md`.

### Operational tooling (Aug 10 2026)

| Artifact | Purpose |
|---|---|
| `supabase/config.toml` | Supabase configuration as code — auth providers, redirect URLs, session timeboxes, SMTP. Secrets referenced by `env()`, never stored. `supabase config diff` reports drift. |
| `supabase/harness/storage-backup.sh` | Nightly Storage backup to two providers, tiered: member content plain, personal documents client-side encrypted, confirmed CSAM excluded under legal hold. |
| `supabase/harness/config-capture.sh` | Inventory of what a restore needs and cannot get from a database backup. Records secret **names**, never values. |
| `supabase/harness/concurrency.sh` | Five proven race conditions, re-run on every replay. |
| `.github/workflows/storage-backup.yml` | Schedules the backup — on GitHub Actions, not Vercel cron, deliberately. |

## Category 4 — Planned / not yet built

| Document | What it would cover | Status |
|---|---|---|
| Pitch Deck (PPTX, ~10–12 slides) | The centerpiece presentation — everything above feeds into it, now with a shipped product to show. | Planned |
| Cap Table (spreadsheet) | Current ownership and the post-money SAFE structure. | Planned |
| Demo video / courtside reel | Short capture of the live queue and courtside display in the field — the wedge, visibly working. | Planned |
| Disaster-recovery drill record | A dated artifact proving a restore worked, with measured RPO/RTO. `docs/RESILIENCE.md` §"How to make the drill produce evidence" is the procedure. | **Planned — the largest open risk before public launch** |

---

**How to read status:** Updated Aug 2026 = refreshed this cycle and current · Living = maintained
continuously · Planned = identified, not yet built · Authoritative = the binding version where
documents overlap · ⚠ = needs confirmation against your copy.

*Document Index — Klimr, Inc. · Confidential · Updated August 10, 2026. Prepared for evaluation
purposes; figures reflect current third-party research and the company's bottom-up model, and are
not guarantees of future performance.*
