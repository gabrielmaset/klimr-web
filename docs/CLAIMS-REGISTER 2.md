# Klimr Claims-to-Evidence Register

**Status:** Active · Updated August 2026 · K1-09 (audit DATA-001/PROD-003/ID-002)

Every material claim Klimr makes in investor materials, marketing, or the
product is listed here with the evidence that backs it and its current status.
A claim without an entry is not cleared for external use. This register is the
counterpart to `METRICS.md` (which defines the numbers) and governs the
**wording** of public statements.

Status key: **Backed** (evidence on file) · **Qualified** (true with a stated
caveat — use the exact phrasing) · **Forward-looking** (a plan/target, must be
framed as such) · **Retired** (no longer claimed).

## Identity & trust
| Claim (as used) | Status | Evidence / required phrasing |
|---|---|---|
| "Verified social network for players" | **Qualified** | Verification exists; today it is **manual review**, with **automated checks in preview**. Required phrasing wherever the claim appears: *"identity review (manual today, automated checks in preview)."* Do **not** state or imply automated identity verification is live. |
| "Every player is verified" | **Retired** | Replaced everywhere by the qualified phrasing above (Exec Summary + strategy docs swept, K0/K1). Verification is the trust floor and required for verified status, but "every player is verified" overstates the current pilot state. |
| "Court-verified attendance data no RSVP competitor has" | **Backed** | Live queue records actual participation (`queue_teams` / matches); this is structurally different from RSVPs. See `METRICS.md` → verified attendance. |

## Product & scope
| Claim | Status | Evidence / required phrasing |
|---|---|---|
| "Five launch sports: tennis, pickleball, padel, racquetball, beach volleyball" | **Backed** | Implemented across the platform; landing page and Exec Summary corrected to name all five (K0-11). |
| "Production platform live at klimr.com" | **Backed** | Live web app: identity review, events, tournaments, teams, social graph, rankings, AI court discovery, waitlists, live queue/courtside. |
| "iPhone app in development" | **Forward-looking** | In development on a hybrid shell with a structural path to native (`klimr-iphone-app-handoff.md`). Frame as in-progress, not shipped. |
| "AI-verified court discovery with quoted evidence" | **Backed** | `court_sport_intel` stores source-checked verdicts; 0175 adds `source_url` + longer excerpt for the "see source" surface. |
| "No payments flow through Klimr in v1" | **Backed** | Deliberate design decision; sponsorship recorded on-platform, money moves off-platform until the payments phase. |

## Market (third-party sourced)
| Claim | Status | Evidence / required phrasing |
|---|---|---|
| US pickleball / tennis participation figures | **Backed** | Attributed to **SFIA 2026 Topline Participation Report** and **USTA** in the Market Analysis and Exec Summary; keep the source and year on the figure. |
| Competitor positioning (Playtomic, Pickleheads, DUPR, PaddleStack-class) | **Qualified** | Use **dated, partial-capability** language in the competitive matrix (K1-09), with the sources appendix — not absolute "no one does X" claims. |
| "Largest participation surge in modern US history" (racquet/court sports) | **Qualified** | Supported by SFIA trend data; keep it tied to the cited report rather than stated as a bare superlative. |

## The ask (financial)
| Claim | Status | Evidence / required phrasing |
|---|---|---|
| "$900,000 pre-seed raise" | **Backed** | Bottom-up model rebuilt Aug 2026: base $762,500 → capital required $879,750 → $900,000 (CEILING $25K). See `klimr-financial-model-aug2026.xlsx` and its Repair Notes. |
| Revenue / ARR figures | **Forward-looking** | The model's revenue numbers are **illustrative unit economics**, labeled as such; Klimr is pre-revenue by design. Never present illustrative neighborhood economics as forecast ARR. |

## Rules
- The **required phrasing** column is binding: where it gives exact wording,
  use it verbatim.
- When a claim's status is **Qualified** or **Forward-looking**, the caveat
  travels with the claim in every medium (deck, one-pager, site, verbal).
- Updating a claim's status here is the trigger to sweep the wording across all
  investor-facing materials.
