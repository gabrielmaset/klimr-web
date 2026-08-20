# Klimr Moderation & Safety-Response SLA

**Status:** Active · Safety contact: **Gabriel Duran** (D17) · Updated August 2026 · K1-08 (audit PRIV-004)

The commitment for how fast Klimr responds to safety and abuse reports, and who
owns each step. Scope is **every shipped surface** — events, tournaments,
teams, the live queue, social feed, marketplace, classes/coaching, and health
(D3 revised: no module is exempt because none is hidden).

## Who
- **Single accountable owner:** Gabriel Duran, until a dedicated trust & safety
  hire. All escalations route to `hello@klimr.com` and the safety alert webhook.
- Automated moderation (content classifiers) is the first pass on user-generated
  content; a human makes every removal/restriction decision.

## Intake channels
- In-product **report** controls on posts, comments, profiles, listings,
  classes, and events.
- `hello@klimr.com` for anything without a report button (venue/organizer
  conduct, off-platform concerns, age disputes).
- Automated safety signals (moderation classifier hits, the CSAM-scan hook,
  diagnostics anomalies) into the alert webhook.

## Triage SLA
| Severity | Examples | First response | Action target |
|---|---|---|---|
| **Critical** | Suspected minor; sexual content involving a minor; credible threat of harm; doxxing | **ASAP, same day** | Immediate restrict + report; outside any grace window |
| **High** | Harassment, hate, targeted abuse; account takeover; scam listing | **~24 h** | Restrict/remove on confirmation |
| **Normal** | Spam, off-topic, low-grade rule-breaking, disputed content | **~2–3 business days** | Remove or warn |
| **Appeal** | "You restricted me and I'm 18+ / this was wrong" | **~2–3 business days** | Restore on evidence (no data loss inside grace window) |

"First response" = a human has triaged and taken an interim action (e.g.
archive pending review), not necessarily final resolution.

## Action ladder
1. **Interim restrict** — archive the account/content (reversible; see
   `DATA-GOVERNANCE.md §2`). Used whenever safety is plausibly at stake.
2. **Remove** — delete the offending content; warn or restrict the actor.
3. **Purge** — for confirmed severe violations, the account is purged on the
   standard path; the ledger records it.
4. **Report** — for CSAM or credible threats, escalate to the appropriate
   authorities via the mandated-report path.

Every step writes an append-only `admin_actions` audit row (actor, action,
target, reason, timestamp).

## Surface-specific notes
- **Live queue / courtside:** organizer is the on-site first responder; Klimr
  handles account-level actions. Guest (non-account) entries carry only a
  display name and are cleared on session reset.
- **Marketplace & classes/coaching:** provider conduct and listing safety are
  in scope from day one; the same intake and ladder apply. (Provider payment
  handling is out of scope pre-launch — no payments flow in v1.)
- **Health:** content is treated like any other feed/profile surface for
  moderation; no clinical claims are hosted.

## Records & review
Aggregate moderation metrics (reports received, median first-response time,
restrictions, confirmations, appeals, reinstatements) are defined in
`METRICS.md` and reviewed as pilot volume grows. This SLA is revisited when the
trust & safety function is staffed.
