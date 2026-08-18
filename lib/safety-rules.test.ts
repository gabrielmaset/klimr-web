import { describe, it, expect } from "vitest";
import {
  mayDestroyOriginal,
  preservationHoldReason,
  requiresCsaeEscalation,
  type EscalationResult,
} from "./safety-rules";

const result = (over: Partial<EscalationResult> = {}): EscalationResult => ({
  preserved: true,
  incidentId: "inc-1",
  alerted: true,
  errors: [],
  ...over,
});

describe("KFU-007: the original is destroyed only after durable preservation", () => {
  it("allows destruction when both the copy and the incident are durable", () => {
    expect(mayDestroyOriginal(result())).toBe(true);
    expect(preservationHoldReason(result())).toBeNull();
  });

  it("REFUSES destruction when the quarantine copy failed", () => {
    const r = result({ preserved: false, errors: ["quarantine upload failed"] });
    expect(mayDestroyOriginal(r)).toBe(false);
    expect(preservationHoldReason(r)).toContain("only copy");
  });

  it("REFUSES destruction when the incident record failed", () => {
    const r = result({ incidentId: null, errors: ["incident insert failed"] });
    expect(mayDestroyOriginal(r)).toBe(false);
    expect(preservationHoldReason(r)).toContain("incident");
  });

  it("REFUSES destruction when both failed, and says so", () => {
    const r = result({ preserved: false, incidentId: null });
    expect(mayDestroyOriginal(r)).toBe(false);
    expect(preservationHoldReason(r)).toContain("both failed");
  });

  it("does not treat a failed alert as a reason to keep the original", () => {
    // Notifying the safety contact is important but it is not preservation:
    // conflating them would retain objects for the wrong reason.
    expect(mayDestroyOriginal(result({ alerted: false }))).toBe(true);
  });
});

describe("KFU-029: an AI verdict naming a minors category escalates, not merely refuses", () => {
  it("routes the OpenAI minors category", () => {
    expect(requiresCsaeEscalation(["sexual/minors"])).toBe(true);
  });

  it("routes hash-match and generic CSAE labels", () => {
    expect(requiresCsaeEscalation(["csam_hash_match"])).toBe(true);
    expect(requiresCsaeEscalation(["child_exploitation"])).toBe(true);
    expect(requiresCsaeEscalation(["CSAE"])).toBe(true);
  });

  it("is not fooled by case or padding from a vendor", () => {
    expect(requiresCsaeEscalation([" Sexual/Minors "])).toBe(true);
  });

  it("does not escalate ordinary refusals", () => {
    expect(requiresCsaeEscalation(["sexual"])).toBe(false);
    expect(requiresCsaeEscalation(["violence", "self_harm"])).toBe(false);
  });

  it("treats an empty or missing verdict as no escalation, not as a match", () => {
    expect(requiresCsaeEscalation([])).toBe(false);
    expect(requiresCsaeEscalation(null)).toBe(false);
    expect(requiresCsaeEscalation(undefined)).toBe(false);
  });
});
