import { describe, it, expect } from "vitest";
import { stepUpDecision } from "./step-up-rules";

// Audit SEC-006 · D8: fail-closed AAL2 assertion matrix.
describe("step-up decision", () => {
  it("passes a healthy AAL2 session", () => {
    expect(stepUpDecision("aal2", "aal2")).toBe("ok");
  });
  it("challenges an enrolled account riding an AAL1 session", () => {
    expect(stepUpDecision("aal1", "aal2")).toBe("challenge");
    expect(stepUpDecision(null, "aal2")).toBe("challenge");
  });
  it("fails closed when no verified factor exists", () => {
    expect(stepUpDecision("aal1", "aal1")).toBe("enroll_required");
    expect(stepUpDecision(null, null)).toBe("enroll_required");
    expect(stepUpDecision("aal2", undefined)).toBe("enroll_required");
  });
});
