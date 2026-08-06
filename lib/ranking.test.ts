import { describe, it, expect } from "vitest";
import { pickupMatchPoints, champBase, placementPoints, bracketPlaces, type PlaceMatch } from "./ranking";

// K1-07 minimum safety suite: ranking-points math is money — a silent change
// here rewrites every leaderboard. These lock the current formulas.
describe("ranking points", () => {
  it("pickup wins beat losses, both positive", () => {
    expect(pickupMatchPoints(true)).toBe(12);
    expect(pickupMatchPoints(false)).toBe(4);
  });
  it("champion base scales with field size", () => {
    expect(champBase(1)).toBe(75);
    expect(champBase(8)).toBe(250);
    expect(champBase(0)).toBe(champBase(1)); // guards the min-1 clamp
  });
  it("placement decreases monotonically by finishing place", () => {
    const field = 16;
    const pts = [1, 2, 3, 5, 9].map((p) => placementPoints(p, field));
    for (let i = 1; i < pts.length; i++) expect(pts[i]).toBeLessThanOrEqual(pts[i - 1]);
    expect(placementPoints(1, field)).toBe(champBase(field)); // champion earns the full base
  });
  it("everyone with a result clears the participation floor", () => {
    const field = 32;
    const floor = Math.round(champBase(field) * 0.05);
    expect(placementPoints(999, field)).toBeGreaterThanOrEqual(floor);
  });
});

describe("bracket placement", () => {
  it("derives places from a completed 4-team single-elim bracket", () => {
    // semis (round 1): A beats B, C beats D; final (round 2): A beats C
    const matches: PlaceMatch[] = [
      { round: 1, entryA: "A", entryB: "B", winnerId: "A", status: "completed" },
      { round: 1, entryA: "C", entryB: "D", winnerId: "C", status: "completed" },
      { round: 2, entryA: "A", entryB: "C", winnerId: "A", status: "completed" },
    ];
    const places = bracketPlaces(matches);
    expect(places.get("A")).toBe(1);
    expect(places.get("C")).toBe(2); // lost the final
    expect(places.get("B")).toBe(3); // lost a semi (round 1)
    expect(places.get("D")).toBe(3);
  });
  it("leaves still-alive teams unplaced and ignores byes", () => {
    const matches: PlaceMatch[] = [
      { round: 1, entryA: "A", entryB: null, winnerId: null, status: "pending" },
      { round: 1, entryA: "C", entryB: "D", winnerId: "C", status: "completed" },
    ];
    const places = bracketPlaces(matches);
    expect(places.has("A")).toBe(false);
    expect(places.get("D")).toBe(2);
  });
  it("empty bracket yields no placements", () => {
    expect(bracketPlaces([]).size).toBe(0);
  });
});
