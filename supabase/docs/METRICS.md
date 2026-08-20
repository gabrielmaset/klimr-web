# Klimr Metric Dictionary

**Status:** Active · Updated August 2026 · K1-09 (audit DATA-001/PROD-004)

Precise, auditable definitions for every metric Klimr reports to investors,
uses internally, or shows in Admin → Insights. A metric is only quotable if it
appears here with a definition and a source. "Illustrative" figures in the
financial model are **not** metrics and are labeled as such there.

## Activation & membership
| Metric | Definition | Source |
|---|---|---|
| **Activated player** | A verified account that has completed ≥1 real action tying them to play — joined a live queue session, registered for an event/tournament, or logged a match — not merely signed up. | `profiles` + participation tables |
| **Verified account** | An account whose `verification_status = verified` (manual review today; automated checks in preview). | `profiles.verification_status` |
| **Repeat organizer** | An account that has run ≥2 distinct live-queue sessions or events across ≥2 calendar weeks. | `court_sessions` / events by `organizer_id` |
| **Paid account** | An organizer or venue on an active paid tier (Organizer Pro or Venue). Zero until monetization switches on. | Billing (post-launch) |

## Venue & queue (the wedge)
| Metric | Definition | Source |
|---|---|---|
| **Queue session** | One live-play session from turn-on to off, at one venue, for one sport. | `court_sessions` row |
| **Live venue (weekly active)** | A venue with ≥1 queue session in the trailing 7 days. | `court_sessions` joined to venue |
| **Weekly active venue** | Same as live venue, reported on a rolling weekly basis. | as above |
| **QR conversion** | Of players who scan the courtside walk-up QR, the share who complete a join in that session. Scan and join are both instrumented. | queue join events |
| **Verified attendance** | A court-verified participation record from the live queue (a player actually took a spot), distinct from an RSVP. | `queue_teams` / match records |

## Retention (by venue cohort)
| Metric | Definition | Source |
|---|---|---|
| **D1 / D7 / D30 retention** | Of players activated in a venue cohort during a period, the share who return and take a play action 1 / 7 / 30 days later. Reported **per venue cohort**, never blended across venues without labeling. | participation tables, cohorted by first-venue |
| **Cohort** | The set of players whose first activation happened at a given venue in a given week. | derived |

## Monetization & support
| Metric | Definition | Source |
|---|---|---|
| **Support incident** | One reported safety/abuse/help case from any intake channel, from open to resolution. | `admin_actions` + support inbox |
| **Median first-response time** | Median time from report intake to first human triage action, per the moderation SLA. | support records |
| **Venue uptime** | Of scheduled/expected queue-running windows for a partner venue, the share the queue was actually live and reachable. | `court_sessions` vs schedule |

## Rules
- **Cohort honesty:** retention is always reported with its cohort basis
  (which venues, which week). No metric blends venues silently.
- **Verified ≠ RSVP:** attendance metrics come from court-verified queue
  participation, not sign-ups — that distinction is the data moat and must not
  be blurred in any claim.
- **Pre-revenue by design:** paid/ARR metrics are zero until the payments phase;
  the model's revenue figures are illustrative unit economics, labeled as such.
