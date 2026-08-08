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
 *  `code` stays: the join code is a PUBLIC credential by design — the courtside
 *  display renders it as the walk-up QR/URL (court-display.tsx), and remote
 *  joins are still gated server-side by the geofence and the approval flow.
 *
 *  `displayCode` does NOT stay (KCDX-008). Phase 0 recorded it as an acceptable
 *  public credential; the Codex audit is right that it is not one. It is the
 *  Courtside operator credential, and it now travels only to a caller that has
 *  proved it holds a device capability for this session. */
export function projectQueueState(
  state: QSessionState,
  viewer: { isOrganizer: boolean; isAdmin: boolean; isOperator?: boolean },
): QSessionState {
  if (viewer.isOrganizer || viewer.isAdmin) return state;

  // KCDX-008: `displayCode` is the Courtside operator credential, and it used to
  // ship to every viewer of every queue page. A registered display still needs
  // it — that is how it notices a code rotation and stops trusting itself — so
  // it survives for an audience that has proven it holds a device capability,
  // and for nobody else. The join code (`code`) is different: it is printed on
  // the poster and its whole purpose is to be read.
  const session = viewer.isOperator
    ? { ...state.session }
    : { ...state.session, displayCode: null };

  return {
    ...state,
    session: {
      ...session,
      centerLat: null,
      centerLng: null,
      radiusM: 0,
      organizerId: "",
    },
    pending: [],
  };
}
