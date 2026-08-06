import { describe, it, expect } from "vitest";
import { offerWindowMinutes } from "./waitlist-window";

// K1-07: waitlist confirmation windows key off how soon the match starts.
// The cascade's fairness depends on these exact thresholds (audit — waitlist).
describe("waitlist offer window", () => {
  const now = Date.parse("2026-08-05T12:00:00Z");
  const inHours = (h: number) => new Date(now + h * 3_600_000).toISOString();
  it("anytime matches get the generous 240-minute window", () => {
    expect(offerWindowMinutes(null, now)).toBe(240);
  });
  it("≤4h out → 20 minutes", () => {
    expect(offerWindowMinutes(inHours(1), now)).toBe(20);
    expect(offerWindowMinutes(inHours(4), now)).toBe(20);
  });
  it("≤24h out → 60 minutes", () => {
    expect(offerWindowMinutes(inHours(5), now)).toBe(60);
    expect(offerWindowMinutes(inHours(24), now)).toBe(60);
  });
  it(">24h out → 240 minutes", () => {
    expect(offerWindowMinutes(inHours(48), now)).toBe(240);
  });
  it("a match already in the past still yields the tightest window", () => {
    expect(offerWindowMinutes(inHours(-3), now)).toBe(20);
  });
});
