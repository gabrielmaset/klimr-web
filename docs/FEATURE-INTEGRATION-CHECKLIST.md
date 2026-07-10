# Feature Integration Checklist

Every new feature (and every substantial change) gets walked through this list
before it ships. This is the answer to "how does this feature interact with
everything else on Klimr" — evaluate each line, act where it applies, and note
"n/a" consciously rather than by omission.

## 1. Notifications
- Map every party affected by each mutation: who *isn't* in the room when this
  happens and deserves to hear about it?
- All emissions go through **`createNotification` in `lib/notify.ts` — the one
  seam**. Never insert into `notifications` directly. The seam is where mobile
  push (APNs/FCM), web push, and email digests attach later (`deliverPush`),
  so anything routed through it is automatically future-channel-ready.
- E2E-encrypted content: notify *that* something happened, never *what* (see
  `notifyThreadMessage` / `notifyMatchThreadMessage`).
- High-frequency events need spam guards (read-recently + already-pinged
  windows, as in chat replies).
- Time-based notifications (expiry, reminders) are **set-based SQL on pg_cron**
  (see migration 0104), never app-side loops.
- Reserved kinds awaiting their write-paths: `sponsorship` (when sponsor-offer
  creation UI ships), `region_challenge` (when challenges gain actions),
  `ranking` (when the ranking job gains milestone hooks), event
  cancellation/updates (when organizer edit actions ship).

## 2. Error capture & diagnostics
- User-visible failure states call `reportClientError` **with `userMessage`**
  (the exact on-screen copy). Server paths are covered globally by
  `instrumentation.ts`; boundaries self-report.

## 3. Support & integration seam
- Anything a user reports/escalates flows through `lib/support-events`
  (ticket + inbox email + webhook + admin fan-out). Never scatter vendor calls.

## 4. Realtime & liveness
- Lists that change underneath the user get a live layer (refresh on
  mount/focus + realtime subscription → server recompute; see
  `ChatsLiveRefresher`). New realtime tables must be added to the
  `supabase_realtime` publication by migration.

## 5. Discoverability & navigation
- New destinations register in **all four surfaces**: side-nav, mobile menu,
  the search PAGES index (`top-search.tsx`), and — if primary — the bottom nav
  discussion. A page that exists but can't be found doesn't exist.

## 6. Mobile pass
- Walk the feature at phone width before calling it done: no blur on hot
  surfaces, breakpoint behavior at `md`, tap targets, anchor offsets.

## 7. Data layer
- RLS policies **with explicit table GRANTs** (privileges evaluate first).
- No O(users) scans on hot paths; indexed lookups, set-based SQL, triggers.
- Migrations numbered sequentially, idempotent where practical, handed to
  Gabriel as copy-paste with the `-- NNNN_name.sql — description` header.

## 8. Geography & policy
- Any address/location input passes the US-only gate (`zip_regions` +
  `lookupZip` fallback) with the standard message. Location stays
  neighborhood-level unless the feature explicitly requires more.

## 9. Ship hygiene
- Green full `eslint` + `build`; docs entry in `DESIGN_DECISIONS.md`; rebuild
  messages list **GitHub deletions** whenever files were removed; new env vars
  and migrations called out explicitly for deploy.

## 10. Authorization — guard AND hide
Every capability has exactly one required pattern: **a server-side guard** (owner-only via
`ownedReg`-style checks, staff via owner-or-manager, admin via role) **AND a conditional
render** — controls the viewer cannot use must not exist in their UI. Rendering a button that
returns "Not authorized" is a bug even though it's safe. When building or touching a feature:
(1) name the minimum role for each action; (2) enforce it in the action; (3) compute the
viewer's role where the control renders (`isOwner`, `role`, etc.) and gate the element; (4) if
a whole section is role-bound, gate the section/slot so its nav entry disappears too (the
danger-zone pattern). Current map: entry moderation + division reassignment + danger zone =
owner-only (guarded + hidden); payments review/refunds, gallery, announcements, schedule =
staff (owner or manager); Klimr admin surfaces = platform admins.
