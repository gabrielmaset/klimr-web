import { describe, it, expect } from "vitest";
import { mapFriendshipRow, buildContextChips, pymkReason, requestResultMessage, type RelationshipContext, type PymkRow } from "@/lib/social";

const ME = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

describe("mapFriendshipRow", () => {
  it("maps absence to none", () => {
    expect(mapFriendshipRow(ME, null)).toBe("none");
    expect(mapFriendshipRow(ME, undefined)).toBe("none");
  });
  it("maps accepted to friends regardless of direction", () => {
    expect(mapFriendshipRow(ME, { requester_id: ME, status: "accepted" })).toBe("friends");
    expect(mapFriendshipRow(ME, { requester_id: OTHER, status: "accepted" })).toBe("friends");
  });
  it("maps pending by direction", () => {
    expect(mapFriendshipRow(ME, { requester_id: ME, status: "pending" })).toBe("requested");
    expect(mapFriendshipRow(ME, { requester_id: OTHER, status: "pending" })).toBe("incoming");
  });
  it("treats unknown statuses as none (defensive)", () => {
    expect(mapFriendshipRow(ME, { requester_id: ME, status: "declined" })).toBe("none");
  });
});

const baseCtx: RelationshipContext = {
  mutual_count: 0,
  shared_sports: [],
  same_city: false,
  same_neighborhood: false,
  played_together: 0,
  shared_team: null,
  co_tournaments: 0,
};

describe("buildContextChips", () => {
  it("returns nothing for an empty overlap", () => {
    expect(buildContextChips(baseCtx)).toEqual([]);
  });
  it("orders the strongest signals first and respects max", () => {
    const chips = buildContextChips(
      { ...baseCtx, mutual_count: 3, shared_team: "Westside Smash", played_together: 2, shared_sports: ["tennis"], co_tournaments: 1 },
      { max: 3 },
    );
    expect(chips).toHaveLength(3);
    expect(chips[0]).toBe("3 mutual connections");
    expect(chips[1]).toBe("Both on Westside Smash");
    expect(chips[2]).toBe("Played together 2×");
  });
  it("singularizes correctly", () => {
    expect(buildContextChips({ ...baseCtx, mutual_count: 1 })[0]).toBe("1 mutual connection");
    expect(buildContextChips({ ...baseCtx, played_together: 1 })[0]).toBe("Played together once");
  });
  it("only shows area when a label is available", () => {
    expect(buildContextChips({ ...baseCtx, same_city: true })).toEqual([]);
    expect(buildContextChips({ ...baseCtx, same_city: true }, { areaLabel: "Mar Vista" })).toEqual(["Both in Mar Vista"]);
  });
});

const basePymk: PymkRow = {
  user_id: OTHER,
  display_name: "Alex",
  avatar_hue: 200,
  avatar_path: null,
  verification_status: "verified",
  city: "Los Angeles",
  neighborhood: "Mar Vista",
  primary_sport: "tennis",
  score: 0,
  mutual_count: 0,
  shared_sports: [],
  played_together: 0,
  shared_team: false,
  same_area: null,
};

describe("pymkReason", () => {
  it("prefers mutuals, then team, then play history, then sport, then area", () => {
    expect(pymkReason({ ...basePymk, mutual_count: 2 })).toBe("2 mutual connections");
    expect(pymkReason({ ...basePymk, shared_team: true })).toBe("You share a team");
    expect(pymkReason({ ...basePymk, played_together: 3 })).toBe("Played together 3×");
    expect(pymkReason({ ...basePymk, shared_sports: ["padel"] })).toBe("Also plays padel");
    expect(pymkReason({ ...basePymk, same_area: "zip" })).toBe("In Mar Vista");
    expect(pymkReason({ ...basePymk, same_area: "city" })).toBe("In Los Angeles");
    expect(pymkReason(basePymk)).toBe("Active near you");
  });
});

describe("requestResultMessage", () => {
  it("treats success-like results as ok with no message", () => {
    for (const r of ["requested", "accepted", "already_connected", "already_requested"]) {
      expect(requestResultMessage(r)).toEqual({ ok: true, message: null });
    }
  });
  it("explains cooldowns and rate limits without leaking blocks", () => {
    expect(requestResultMessage("cooldown").ok).toBe(false);
    expect(requestResultMessage("rate_limited").ok).toBe(false);
    const unavailable = requestResultMessage("unavailable");
    expect(unavailable.ok).toBe(false);
    expect(unavailable.message).not.toMatch(/block/i);
  });
  it("fails closed on unknown results", () => {
    expect(requestResultMessage("garbage").ok).toBe(false);
  });
});
