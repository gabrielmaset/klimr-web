import { describe, it, expect } from "vitest";
import { projectQueueState } from "./queue-projection";
import type { QSessionState } from "./queue";

const state = {
  session: {
    id: "s1", eventId: null, tournamentId: null, teamNameMode: "letters",
    displayCode: "ABCD23", code: "WXYZ89", title: "Court night", sportKey: "pickleball",
    status: "live", winCap: 3, allowGuests: true, requireLocation: true, eventOnly: false,
    requireApproval: true, allowFullTeams: false, paused: false, pausedByName: null,
    centerLat: 34.001234, centerLng: -118.44321, radiusM: 250, organizerId: "org-uuid",
  },
  courts: [], pending: [
    { id: "p1", courtId: "c1", name: "Alice Example", isGuest: false },
    { id: "p2", courtId: "c1", name: "Walk-up Guest", isGuest: true },
  ],
  me: null, myPending: { id: "p1", courtId: "c1" },
} as unknown as QSessionState;

// Audit SEC-004 · decision D7: anonymous/player payloads carry no geofence
// centre, no organizer UUID, and no one else's pending requests.
describe("queue audience projection", () => {
  it("trims the public/player payload", () => {
    const out = projectQueueState(state, { isOrganizer: false, isAdmin: false });
    expect(out.session.centerLat).toBeNull();
    expect(out.session.centerLng).toBeNull();
    expect(out.session.radiusM).toBe(0);
    expect(out.session.organizerId).toBe("");
    expect(out.pending).toEqual([]);
    expect(JSON.stringify(out)).not.toContain("org-uuid");
    expect(JSON.stringify(out)).not.toContain("34.001234");
    expect(JSON.stringify(out)).not.toContain("Alice Example");
  });
  it("keeps the caller's own request via myPending", () => {
    const out = projectQueueState(state, { isOrganizer: false, isAdmin: false });
    expect(out.myPending).toEqual({ id: "p1", courtId: "c1" });
  });
  it("keeps the public join credential the courtside display renders", () => {
    const out = projectQueueState(state, { isOrganizer: false, isAdmin: false });
    expect(out.session.code).toBe("WXYZ89");
    expect(out.session.displayCode).toBe("ABCD23");
  });
  it("gives the organizer and admins the full state", () => {
    for (const viewer of [{ isOrganizer: true, isAdmin: false }, { isOrganizer: false, isAdmin: true }]) {
      const out = projectQueueState(state, viewer);
      expect(out.session.centerLat).toBe(34.001234);
      expect(out.session.organizerId).toBe("org-uuid");
      expect(out.pending).toHaveLength(2);
    }
  });
});
