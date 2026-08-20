# Monetization Readiness — Phase 4 Prerequisites

**Status:** Prerequisites specified · **Build deliberately not started** · August 2026 · K4 (audit FIN-004 + monetization scope)

Phase 4 is Organizer Pro, the Venue tier, and eventually sponsorship payments.
The plan gates it on density and retention signals from the LA pilot, and this
document exists to keep that gate honest — and to make sure that when the gate
opens, the work is a build rather than a research project.

---

## 1. Why nothing is being built yet

**The gate is not bureaucracy; it is the whole thesis.** Klimr's case to
investors is that court-verified retention at real venues is the asset. Billing
built before that asset exists proves nothing, and billing is the single most
expensive thing to get wrong — refunds, chargebacks, tax, and dunning are all
harder to retrofit than to design.

Three things would be true if we shipped billing now, none of them good:
- **No one to charge.** Zero paying accounts today; the model is illustrative by
  design (see `CLAIMS-REGISTER.md` — revenue figures are labelled forward-looking).
- **No price signal.** The $20 Organizer Pro / $99 Venue figures in the model are
  placeholders. Charging before talking to organizers sets an anchor by accident.
- **Entitlement state you cannot change cheaply.** Once real subscriptions exist,
  the state machine is load-bearing and migrations get expensive.

**Open the gate when** (from the plan and `METRICS.md`):
- ≥ 5 venues with a live queue in the same week, and
- D30 retention ≥ 25% for at least one venue cohort with 60 days of history, and
- ≥ 2 organizers who have asked, unprompted, to pay for something specific.

The third is the one that matters most and is the easiest to skip.

---

## 2. Entitlement state machine — designed, not built

Recording the design now costs nothing and prevents the shape being invented
under deadline later.

**States:** `none → trialing → active → past_due → canceled → none`
plus `active → paused` (venue off-season, a real case for seasonal sports).

**Rules worth fixing in advance:**
- **Entitlement is derived, never stored as a boolean on the user.** A
  `subscriptions` row with `status` + `current_period_end` is the truth; every
  feature check reads a single predicate (`canUseOrganizerPro(userId)`), the same
  discipline that fixed the tournament-hosting gate.
- **Downgrade is non-destructive.** Losing Organizer Pro must never delete a
  tournament, a queue session, or historical data — it removes the ability to
  create new ones. Data loss on downgrade is how a lapsed customer becomes a
  public complaint.
- **`past_due` keeps access** for a defined grace window (14 days suggested)
  because a failed card at a venue mid-season is an operational emergency, not
  a decision to stop paying.
- **Cancellation is effective at period end**, never immediately, and the UI must
  say the exact date.
- **Every transition writes an audit row**, reusing `admin_actions`.

**Not decided yet, deliberately:** processor (Stripe is the obvious default),
proration policy, and whether the Venue tier is per-venue or per-organization.
Those need the pricing conversation first.

---

## 3. Sponsorship payments — the specification that must exist first

The plan is explicit: **no sponsorship payment movement until charge/liability,
refunds, disclosure and terms are specified and reviewed.** Today sponsorship is
recorded on-platform while money moves off-platform, and that is a deliberate,
defensible v1 position (`CLAIMS-REGISTER.md`).

Questions that must be answered — by counsel, not by engineering — before a
single cent moves through Klimr:

1. **Who is the merchant of record** when a business sponsors an event? Klimr, or
   the organizer? This determines liability, tax, and whether Klimr needs money
   transmission analysis.
2. **What happens when an event is cancelled** after sponsorship is paid? Refund
   policy, who bears the processor fee, and the window.
3. **Disclosure.** Sponsored content in the feed and on event pages — what
   labelling is required, and does it differ by state?
4. **Terms.** Sponsor agreement, organizer agreement, and how a dispute between
   them is handled when Klimr held the funds.
5. **Minors.** The service is 18+, but a sponsored youth-adjacent event raises
   questions worth asking once rather than discovering later.

**Engineering's part is ready:** the sponsorship lifecycle already exists
on-platform, and adding a payment step is a processor integration plus the
entitlement machine above — not an architectural change.

---

## 4. FIN-004 — venue-cohort unit economics

The skeleton shipped in K2-06 (`klimr-financial-model-aug2026.xlsx` →
*Venue Unit Economics*). It is honest about being a skeleton: the one-time costs
are real and founder-quoted; the cohort and revenue rows are labelled
illustrative placeholders.

**To complete it, replace rows 19–26 with measured values** once three venues
have 60 days of history. `METRICS.md` defines every term it needs — activated
player, cohort, D30 retention, venue uptime. At that point the tab stops being a
skeleton and becomes the venue-economics story for the Seed round, which is the
actual purpose of the exercise.

---

## 5. Standing post-launch item

**Stepped-up coach IDV** — Persona or Stripe Identity for document verification,
plus Checkr or Yardstik for background checks on verified coaches. Deferred by
decision; professional-status requests are reviewed manually against issuing-body
registries until then (`MINOR-SAFETY.md`, `MODERATION-SLA.md`). This becomes
urgent the moment coaching moves from listing to booking.
