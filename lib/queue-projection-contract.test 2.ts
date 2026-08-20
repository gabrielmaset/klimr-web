import { describe, it, expect } from "vitest";
import { projectQueueState } from "./queue-projection";
import type { QSessionState } from "./queue";

// K1-07 contract snapshot: the PUBLIC shape of /api/queue/[id] for a
// non-organizer. If a future change adds a field to the payload, this test
// forces a conscious decision about whether it's safe to expose.
const full = {
  session: {
    id: "s1", eventId: "e1", tournamentId: null, teamNameMode: "letters",
    displayCode: "AB23CD", code: "WXYZ89", title: "Court night", sportKey: "pickleball",
    status: "live", winCap: 3, allowGuests: true, requireLocation: true, eventOnly: false,
    requireApproval: true, allowFullTeams: false, paused: false, pausedByName: null,
    centerLat: 34.0, centerLng: -118.4, radiusM: 250, organizerId: "org-uuid",
  },
  courts: [], pending: [{ id: "p1", courtId: "c1", name: "Someone", isGuest: false }],
  me: null, myPending: null,
} as unknown as QSessionState;

describe("queue public contract", () => {
  it("exposes exactly the allow-listed session fields to non-organizers", () => {
    const pub = projectQueueState(full, { isOrganizer: false, isAdmin: false });
    // Frozen public session key set — adding a key here must be deliberate.
    expect(Object.keys(pub.session).sort()).toEqual(
      [
        "allowFullTeams", "allowGuests", "centerLat", "centerLng", "code", "displayCode",
        "eventId", "eventOnly", "id", "organizerId", "paused", "pausedByName", "radiusM",
        "requireApproval", "requireLocation", "sportKey", "status", "teamNameMode",
        "title", "tournamentId", "winCap",
      ].sort(),
    );
    // Sensitive values are neutralized, not merely absent from the type.
    expect(pub.session.centerLat).toBeNull();
    expect(pub.session.centerLng).toBeNull();
    expect(pub.session.radiusM).toBe(0);
    expect(pub.session.organizerId).toBe("");
    expect(pub.pending).toEqual([]);
  });
});
