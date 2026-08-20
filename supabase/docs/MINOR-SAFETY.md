# Klimr Minor-Safety Policy & 18+ Enforcement (Operational)

**Status:** Active · Owner: Gabriel Duran · Updated August 2026 · K1-08 (audit PRIV-004)

Klimr is an **18-and-over** service. This document is the operational procedure
for enforcing that — detection, reporting, removal, and age-dispute handling —
across **every shipped surface** (events, tournaments, teams, the live queue,
social feed, marketplace, classes/coaching, and health). It complements the
policy statement in the product terms and the data rules in
`DATA-GOVERNANCE.md`.

## 1. Why 18+
The network is built around **verified real-world identity**, in-person play at
physical venues, and adult-to-adult contact (organizers, coaches, venue staff).
An under-18 population would demand a categorically different safety, consent,
and moderation regime (COPPA, guardian consent, minor-contact controls) that
Klimr does not operate. The floor is a deliberate scope boundary, not a UX
default.

## 2. Gate at entry
- **Attestation at signup.** Account creation requires an 18+ affirmation; the
  terms state the minimum age plainly.
- **Invite-gated pre-launch.** During the pilot, access is invite-code gated,
  so every early member is reachable and accountable.
- **Verified identity.** The verification path (manual review today; automated
  checks in preview) is where an obviously-underage identity is caught before a
  member gains verified status.

## 3. Detection signals (ongoing)
Staff and automated moderation watch for, on any surface:
- Self-reported age or school/grade indicating under-18 (profile, posts,
  comments, support messages, class/coaching intake).
- Imagery or content in the feed or a listing that indicates a minor.
- Third-party reports (the report control on posts, profiles, listings, and
  events; or `hello@klimr.com`).
- Organizer/venue/coach flags raised through support.

## 4. Response procedure
When a member is suspected to be under 18:
1. **Restrict fast.** The account is **archived** (sign-in blocked, content
   removed from public view) pending review — reversible, per the lifecycle in
   `DATA-GOVERNANCE.md §2`. Speed favors the minor's safety over convenience.
2. **Review.** Gabriel (safety contact, D17) reviews the signal within the
   moderation SLA (`MODERATION-SLA.md`, ~24 h triage).
3. **Confirmed under-18 → remove.** The account is purged on the standard
   path; personal rows cascade; the ledger records the action
   (`DATA-GOVERNANCE.md §2`). Any coach/organizer relationship is severed.
4. **Document.** An `admin_actions` audit row is written (actor, reason,
   target, timestamp) — append-only.

## 5. Age disputes (false positives)
A member who was restricted but **is** 18+ can appeal via `hello@klimr.com`.
- Review is prompt and documented.
- Reasonable proof of age (the same identity-verification path) restores the
  account from **archived** with no data loss, since restriction precedes
  purge by the grace window.
- The bias is protective: restrict on suspicion, restore on evidence — never
  the reverse.

## 6. Adult–minor contact
Because the service is 18+, there is no sanctioned minor presence to contact.
Any content that sexualizes a minor, facilitates grooming, or attempts to
isolate a minor is an **immediate removal + report** matter, outside the normal
grace window, and is escalated to the appropriate authorities. Klimr does not
provide advice or tooling that could aid such conduct under any framing.

## 7. Records
Every enforcement action leaves an append-only `admin_actions` row. Aggregate
counts (restrictions, confirmations, appeals, reinstatements) feed the support
metrics in the metric dictionary (`METRICS.md`).
