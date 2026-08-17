# Klimr — Master Document Index

Pre-Seed Round · Confidential · **Updated August 10, 2026**

The running index of every document in the Klimr package — investor materials, product and
strategy artifacts, and internal working documents — plus what's still planned. All Category-1 and
Category-2 documents were refreshed in August 2026 for the post-July platform. **Aug 5 refresh:**
audit assessment, master remediation plan, and financial-model rebuild ($900K ask). **Aug 10
refresh:** the Klimr Codex security remediation closed (68 findings, migrations 0191–0234), the
relationship & privacy policy was decided and encoded, and the backup programme was designed.

This file is the machine-maintained master; `Klimr_Document_Index.docx` mirrors it for the data
room. **When the two disagree, this file wins.** The .docx copy in circulation is stale at July 2026
and should be regenerated from this file.

## Category 1 — Investor materials (data room)

| Document | What it covers | Status |
|---|---|---|
| Executive Summary — `Klimr_Executive_Summary.docx` | The pitch in brief: the ask, the shipped platform, the open-play wedge, business model, use of funds, and the bet. | Regenerated Aug 5 2026 ($900K ask, repaired allocation, precise identity language) |
| Market Analysis — `Klimr_Market_Analysis.docx` | SFIA 2026 data, the five court sports, TAM/SAM/SOM, supply tailwind, LA venue beachhead. | Updated Aug 2026 |
| Target Audience — `Klimr_Target_Audience.docx` | Broad market vs. venue wedge, four segments + organizer/venue/business audiences, personas, 18+ policy. | Updated Aug 2026 |
| Competitive Landscape — `Klimr_Competitive_Landscape.docx` | Four competitor groups incl. the PaddleStack-class open-play utilities; feature matrix; moat; honest risks. | Updated Aug 2026 · matrix rewording pending (K1-09) |
| Go-to-Market — `Klimr_Go_To_Market.docx` | The venue wedge: courtside-display distribution, organizer-ambassadors, three phases, monetization sequencing. | Updated Aug 2026 |
| Financial Model — `klimr-financial-model-aug2026.xlsx` | 18-month operating model rebuilt Aug 5 2026: Use-of-Funds repair, field-marketing & event program, Base/Lean/Downside scenarios, live hire timing, zero-check controls. 9 sheets; $900,000 ask. | Rebuilt Aug 5 2026 · signed off |

## Category 2 — Product & strategy

| Document | What it covers | Status |
|---|---|---|
| Production platform — `klimr.com` | The live product: identity review (manual today, automated checks in preview), events, tournaments, teams, feed, classes, and the queue/courtside system (iPad app in field testing). Supersedes the interactive demo. | Live |
| Match Integrity Strategy — `Klimr_Match_Integrity_Strategy.docx` | Mutual confirmation, two-tier ratings, referees — now anchored by court-verified queue matches. | Updated Aug 2026 |
| Ranking Integrity Threat Model — `Klimr_Ranking_Integrity_Threat_Model.docx` | Attacker playbook and six-layer defense, extended with queue evidence, rotating QR, and clustering. | Updated Aug 2026 |
| Market Study — `klimr-market-study-2026-07.md` | Deep market & competitor research: SFIA 2026, funding landscape, the open-play whitespace, P0 gaps, LA playbook, valuation context. | Jul 2026 |
| Feed 2.0 & Business Accounts Plan — `klimr-feed2-business-accounts-plan-2026-07.md` | Full product spec: social feed (Ace, comments, moderation, recaps, Discover rail) + business accounts, verification tiers, and the sponsorship system. | Jul 2026 |
| Plan Addendum — `klimr-plan-addendum-liveness-business-console-2026-07.md` | Event Pulse liveness design, business sign-up field inventory, blue business console IA. | Jul 2026 (superseded by Plan v2) |
| Plan v2 Consolidated — `klimr-plan-v2-consolidated-2026-07.md` | The binding build plan: platform foundations, evidence-ledger liveness, verification state machines, sponsorship lifecycle, security contracts, phases, and confirmed decisions (18+, three strikes, milestone-bucket analytics, no payments v1). | Jul 2026 · Authoritative |
| Investor portal — `vision.klimr.com` | Code-gated portal with the interactive prototype; separate Cloudflare Worker deployment. Parity-updated Jul 2026. | Live |

## Category 3 — Internal & working

| Document | What it covers | Status |
|---|---|---|
| Design Decisions — `docs/DESIGN_DECISIONS.md` (in repo) | The running engineering log of every shipped decision, newest first — including the mistakes, which are the entries most worth keeping. | Living |
| Master Document Index — `klimr-document-index.md` | The machine-maintained catalog of all deliverables; the .docx mirrors it for the data room. | Living |
| Project Handoff Package — `Klimr_Project_Handoff.md` | Master context: decisions, product spec, brand, infra, conventions. | Living |
| Co-founder Outreach Playbook — `klimr-cofounder-outreach.md` | Strategy and templates for recruiting a technical co-founder / founding engineer. | Living |
| iPhone App Handoff — `klimr-iphone-app-handoff.md` | The iOS program kickoff: history-first operating rule, architecture options, auth-in-shell, native capability checklist, kickoff agenda. Program active (hybrid B, `klimr-ios` repo). | Aug 2026 · Active |
| Independent Audit Assessment — `Klimr_Independent_Assessment_and_Objection_Report_August_2026.md` | Validation of the 74-finding external audit: per-finding statuses, objections O-1–12, additional findings ADD-01–12, and founder decisions D1–D17. | Aug 5 2026 |
| Master Remediation Plan — `Klimr_Master_Remediation_Plan_August_2026.md` | The working engineering plan: phases K0–K4, full traceability to every audit finding and decision, exit gates, delivery status. Supersedes the external implementation plan. | Aug 5 2026 · Authoritative |
| **Klimr Codex Remediation Ledger** — `docs/AUDIT_REMEDIATION_STATUS.md` | The 68-finding security & reliability audit, per-finding: what was wrong, what was built, what remains. All 8 P0s closed. Moved into the repo Aug 10 — it had been living in a scratch workspace that resets. | **Aug 10 2026 · Complete** |
| **Audit Remediation Report** — `Klimr_Audit_Remediation_Report.md` | The evaluation-facing summary: all 68 findings by disposition, the 10 production defects the audit missed, owner decisions, recurring root causes, open questions. Written to be challenged. | **Aug 10 2026** |

### Repository control documents (`klimr-web`)

Each states rules the system must obey and is tied to code by an assertion in
`tests/doc-claims.test.ts` — a claim that drifts from the code fails the build.

| Document | States | Enforced by |
|---|---|---|
| `SECURITY.md` | The security posture and its known gaps | doc-claims tests |
| `docs/DATA-GOVERNANCE.md` | What personal data exists, who may read it, what an export contains | `/settings/export`, doc-claims |
| `docs/RESILIENCE.md` | Backup coverage and RPO/RTO targets — **marked UNVALIDATED until a drill runs** | `storage_manifest_*`, doc-claims |
| **`docs/RELATIONSHIP-PRIVACY-POLICY.md`** | Who may do what to whom, per relationship — the KCDX-032 matrix | `may_act_on()`, `may_see_connections()`, mute/restrict/block (0233/0234) |
| `docs/MIGRATIONS_LEDGER.md` | Every migration, what it changes, whether it is applied | reconciled through 0234 |

Non-asserted, carried forward: `SAFETY.md`, `CHAT.md`, `README.md`,
`docs/MINOR-SAFETY.md`, `docs/MODERATION-SLA.md`, `docs/RUNBOOKS.md`, `docs/METRICS.md`,
`docs/PERFORMANCE.md`, `docs/RANKING-POINTS.md`, `docs/FEED-ARCHITECTURE.md`,
`docs/SEARCH-RELEVANCE.md`, `docs/CLAIMS-REGISTER.md`, `docs/ADDING_A_SPORT.md`,
`docs/FEATURE-INTEGRATION-CHECKLIST.md`, `docs/FONTS.md`, `docs/MONETIZATION-READINESS.md`,
`docs/PLACES-COMPLIANCE-INVENTORY.md`, `docs/SPONSORSHIP-CATEGORIES.md`,
`docs/VENUE-PLAYBOOK.md`, `docs/Klimr_Product_Strategy_and_Page_Roadmap.md`.

### Operational tooling (new Aug 10 2026)

| Artifact | Purpose |
|---|---|
| `supabase/config.toml` | Supabase configuration as code — auth providers, redirect URLs, session timeboxes, SMTP. Secrets referenced by `env()`, never stored. `supabase config diff` reports drift. |
| `supabase/harness/storage-backup.sh` | Nightly Storage backup to two providers, tiered: member content plain, personal documents client-side encrypted, confirmed CSAM excluded under legal hold. |
| `supabase/harness/config-capture.sh` | Inventory of what a restore needs and cannot get from a database backup. Records secret **names**, never values. |
| `supabase/harness/concurrency.sh` | Five proven race conditions, re-run on every migration replay. |
| `.github/workflows/storage-backup.yml` | Schedules the backup on GitHub Actions, not Vercel cron — deliberately. |

## Category 4 — Planned / not yet built

| Document | What it would cover | Status |
|---|---|---|
| Pitch Deck (PPTX, ~10–12 slides) | The centerpiece presentation — everything above feeds into it, now with a shipped product to show. | Planned |
| Cap Table (spreadsheet) | Current ownership and the post-money SAFE structure. | Planned |
| Demo video / courtside reel | Short capture of the live queue and courtside display in the field — the wedge, visibly working. | Planned |
| Disaster-recovery drill record | A dated artifact proving a restore worked, with measured RPO/RTO. `docs/RESILIENCE.md` gives the procedure. | **Planned — the largest open risk before public launch** |

---

**How to read status:** Updated Aug 2026 = refreshed this cycle and current · Living = maintained
continuously · Planned = identified, not yet built · Authoritative = the binding version where
documents overlap.

**Provenance note.** The August 5 index file was not available when this was rebuilt on August 10.
Categories 1–2 and the first seven Category-3 rows were recovered from project history — the
verbatim Aug 5 table text, not a summary of it. One earlier reconstruction attempt (an $825K ask
with `*_2026-08.md` filenames) was rejected in favour of the surgical .docx refresh; that rejected
set is **not** the source here, and its figures do not appear.

*Document Index — Klimr, Inc. · Confidential · Updated August 10, 2026. Prepared for evaluation
purposes; figures reflect current third-party research and the company's bottom-up model, and are
not guarantees of future performance.*

---

## Addendum — August 17, 2026

**New documents this refresh:**

| Document | Location | What it is |
|---|---|---|
| **Klimr Market Gap Research (v1.2)** — *"What Recreational Players Cannot Find: Unmet Needs and White Space in Sports Social Networking"* | `docs/Klimr_Market_Gap_Research_2026-08.docx` (repo) + staged to outputs; 18 pp., 38 references | Rapid evidence review across market data (SFIA 2026, Playtomic/PwC), incumbent teardown, community-documented pain, and peer-reviewed literature (SDT, loneliness/connection, friendship formation). Eight ranked gaps, opportunity matrix, and the positioning reframe: **Klimr is a sports network, built as the trust and liquidity layer for recreational play** (category framing corrected twice by owner — final: sports network, launching in five sports, sport-agnostic architecture). Investor-conversation ready. |
| **Audit Status Baseline for External Review** | `docs/AUDIT_STATUS_FOR_EXTERNAL_REVIEW.md` | Auditor-facing distillation of the KRA register: all 42 findings with current status, the 15 owner-decided positions we will not re-litigate (with reasons), the tracked-open list, and everything changed since the audited zip (0263→0275). Feed this to the next ChatGPT/Codex audit so settled items are answered from record — serious security issues excepted, per owner. |

Also in this window: production advanced to migration **0275**; Batches A (match visibility + skill), B (rankings filters + full field), C (team joinability + challenge belts) shipped; CI readiness restored (0273); backup programme fully green dual-provider (B-01 closed); OpenAI moderation armed (D-36); category framing corrected platform-wide to **sports network**.

