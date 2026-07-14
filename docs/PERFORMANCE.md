# Klimr Performance Playbook

*Diagnosis + fixes from the 2026-07-14 responsiveness pass. Metric of record:
INP (Interaction to Next Paint) — the time between a click and the next visual
change. Klimr's symptoms ("click, nothing, click again" + seconds-long silent
waits) were perceived-responsiveness gaps, not server slowness.*

## The diagnosis
1. **Zero `loading.tsx` files** existed → every navigation rendered NOTHING
   until the server finished. Segment-scoped loading UI paints instantly and
   keeps the shell interactive; full-silence (like full-page blockers) hurts
   perceived performance even when actual load times are fine.
2. **No pending feedback on most actions** → the double-click symptom: the
   canonical fix is the useFormStatus/useActionState pending pattern — button
   disables and shows progress the moment it's pressed. INP guidance is
   explicit: update the UI first, then do the work.

## Shipped in this pass
- `components/page-skeleton.tsx` + `loading.tsx` in nine segments (feed,
  events, tournaments, marketplace, health, play, network, classes, teams):
  clicks on the rail now answer within a frame, always.
- Create-match submit: flame gradient + pending copy via useActionState
  (already wired); FeedComposer/DM room/post hearts already carry transitions.
- Verified both remaining `<a href>` internals are legitimate (file download,
  map popup) — all navigation goes through `<Link>` prefetch.

## Standing rules (adopt in every new feature)
- Every new route segment ships a `loading.tsx` (reuse PageSkeleton).
- Every server-action button shows pending state (useActionState /
  useFormStatus / useTransition) and disables while in flight.
- Optimistic UI where reversal is trivial (hearts, toggles); never for money
  or seats.
- Keep client event handlers under ~50 ms; move heavy work server-side or
  defer with startTransition.

## Next measurements (follow-ups)
- Enable **Vercel Speed Insights** (dashboard toggle) to get field INP/LCP.
- Optional: `web-vitals` reporting into the diagnostics seam.
- Audit largest client bundles (top-bar realtime subscriptions are fine;
  events-map/mapbox loads lazily already).
