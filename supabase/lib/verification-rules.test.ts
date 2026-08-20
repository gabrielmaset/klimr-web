import { describe, it, expect } from "vitest";
import { nextStatusForMemberRequest } from "./verification-rules";

// Audit SEC-001/ID-001: the only member-reachable transition is unverified → pending.
describe("verification member transitions", () => {
  it("allows unverified → pending", () => {
    expect(nextStatusForMemberRequest("unverified")).toBe("pending");
    expect(nextStatusForMemberRequest(null)).toBe("pending");
    expect(nextStatusForMemberRequest(undefined)).toBe("pending");
  });
  it("never verifies, never re-files, never downgrades", () => {
    expect(nextStatusForMemberRequest("pending")).toBeNull();
    expect(nextStatusForMemberRequest("verified")).toBeNull();
    expect(nextStatusForMemberRequest("anything-else")).toBeNull();
  });
});
