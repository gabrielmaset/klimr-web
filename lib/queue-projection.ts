import type { QSessionState } from "@/lib/queue";

/** Audience projection for /api/queue/[id] (Aug 2026, audit SEC-004 · D7).
 *
 *  The organizer (and admins) get the full state — their console approves
 *  join requests through this same poller. Everyone else (players, guests,
 *  the anonymous courtside display) gets a trimmed copy:
 *
 *   · geofence centre + radius removed — no client ever uses them; the
 *     distance check runs server-side in validateJoin (app/queue/actions.ts)
 *   · organizerId blanked — clients learn organizer powers via the
 *     server-computed `isOrganizer` page prop, never by comparing ids
 *   · other people's pending join requests removed — the caller's own
 *     request already arrives separately as `myPending`
 *
 *  `code` and `displayCode` stay: the join code is a PUBLIC credential by
 *  design — the courtside display renders it as the walk-up QR/URL
 *  (court-display.tsx), and remote joins are still gated server-side by the
 *  geofence and the approval flow. Type shape is unchanged so every existing
 *  client keeps compiling and polling. */
export function projectQueueState(
  state: QSessionState,
  viewer: { isOrganizer: boolean; isAdmin: boolean },
): QSessionState {
  if (viewer.isOrganizer || viewer.isAdmin) return state;
  return {
    ...state,
    session: {
      ...state.session,
      centerLat: null,
      centerLng: null,
      radiusM: 0,
      organizerId: "",
    },
    pending: [],
  };
}
