# Klimr — document index

_Regenerated 2026-08-10 from the repository. This is the authoritative catalog of Klimr's in-repo control and reference documents; investor and business documents (Word/Excel) are tracked separately in Drive._

Documents marked **Owner: yes** carry a named owner and a reconciliation date, and are asserted by `tests/doc-claims.test.ts` — a claim in one of those files that drifts from the code fails the build rather than quietly misleading the next reader.

| Document | Lines | Owner | What it covers |
|---|---:|---|---|
| `CHAT.md` | 90 | — | One end-to-end encrypted group chat per match, ephemeral (closes **24h after the |
| `README.md` | 100 | — | Per-sport rankings from your ZIP to the world, verified players, real match results. Built on Ne |
| `SAFETY.md` | 177 | — | This document is a **launch prerequisite**, not optional polish. Klimr is an all-ages |
| `SECURITY.md` | 206 | yes | _Last reviewed: 2026-06-17 · Internal code + schema audit (not a third-party penetration test)._ |
| `docs/ADDING_A_SPORT.md` | 97 | — | Every sport on Klimr is defined **once**, in a small set of registries, and |
| `docs/CLAIMS-REGISTER.md` | 51 | — | **Status:** Active · Updated August 2026 · K1-09 (audit DATA-001/PROD-003/ID-002) |
| `docs/DATA-GOVERNANCE.md` | 216 | — | The operating rules for user identification, account deletion, and what Klimr |
| `docs/DESIGN_DECISIONS.md` | 7407 | — | The single source of truth for how Klimr looks and behaves. Read this before adding |
| `docs/FEATURE-INTEGRATION-CHECKLIST.md` | 83 | — | Every new feature (and every substantial change) gets walked through this list |
| `docs/FEED-ARCHITECTURE.md` | 123 | — | *Status: designed 2026-07-13 · Phase 1 ready to build · depends on migration 0111 (drafted below |
| `docs/FONTS.md` | 25 | — | One source of truth for every typeface in the product. If a font isn't in |
| `docs/Klimr_Product_Strategy_and_Page_Roadmap.md` | 172 | — | *Prepared to decide (a) how wide pages should be, (b) what the "hero" band at the top of every p |
| `docs/METRICS.md` | 48 | — | **Status:** Active · Updated August 2026 · K1-09 (audit DATA-001/PROD-004) |
| `docs/MIGRATIONS_LEDGER.md` | 92 | — | **This file is the single source of truth for what has been applied to the |
| `docs/MINOR-SAFETY.md` | 71 | — | **Status:** Active · Owner: Gabriel Duran · Updated August 2026 · K1-08 (audit PRIV-004) |
| `docs/MODERATION-SLA.md` | 62 | — | **Status:** Active · Safety contact: **Gabriel Duran** (D17) · Updated August 2026 · K1-08 (audi |
| `docs/MONETIZATION-READINESS.md` | 117 | — | **Status:** Prerequisites specified · **Build deliberately not started** · August 2026 · K4 (aud |
| `docs/PERFORMANCE.md` | 41 | — | *Diagnosis + fixes from the 2026-07-14 responsiveness pass. Metric of record: |
| `docs/PLACES-COMPLIANCE-INVENTORY.md` | 126 | — | **Status:** Engineering inventory complete · **Awaiting counsel** · August 2026 · K3-07 (audit C |
| `docs/RANKING-POINTS.md` | 267 | — | *Version 1.2 · July 14, 2026 · Canonical spec + member training doc.* |
| `docs/RELATIONSHIP-PRIVACY-POLICY.md` | 219 | yes | **Last reconciled against source:** 2026-08-10 (migrations 0233, 0234) |
| `docs/RESILIENCE.md` | 171 | — | **Status:** Active · Owner: Gabriel Duran · Updated August 2026 · K2-06 (audit DEP-004 · D6) |
| `docs/RUNBOOKS.md` | 132 | — | **Status:** Active · Owner: Gabriel Duran · Updated August 2026 · K2-03 (audit DEP-005) |
| `docs/SEARCH-RELEVANCE.md` | 94 | — | **Status:** Instrumented, awaiting data · August 2026 · K3-08 (audit SRCH-004) |
| `docs/SPONSORSHIP-CATEGORIES.md` | 42 | — | Resolved 2026-07-21 (plan open decision #7). Industry-standard (IAB-aligned) exclusion |
| `docs/VENUE-PLAYBOOK.md` | 108 | — | **Status:** Active · Owner: Gabriel Duran · Updated August 2026 · K2-05 (audit PROD-005) |

## The control documents

These four state rules the system is expected to obey, and each is tied to code
by an assertion:

| Document | States | Enforced by |
|---|---|---|
| `SECURITY.md` | The security posture and its known gaps | doc-claims tests |
| `docs/DATA-GOVERNANCE.md` | What personal data exists, who may read it, what an export contains | `/settings/export`, doc-claims |
| `docs/RESILIENCE.md` | Backup coverage, RPO/RTO targets (marked UNVALIDATED until a drill runs) | `storage_manifest_*`, doc-claims |
| `docs/RELATIONSHIP-PRIVACY-POLICY.md` | Who may do what to whom, per relationship | `may_act_on()`, `may_see_connections()`, the three lists (0233/0234) |

`docs/DESIGN_DECISIONS.md` is the running record of why things are the way they
are — including the mistakes, which are the entries most worth keeping.

`docs/MIGRATIONS_LEDGER.md` records every migration, what it changes, and whether
it has been applied to production.

