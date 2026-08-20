import { describe, it, expect } from "vitest";
import { isLocked, nextFailureRow, LOCKOUT_MAX_FAILURES } from "./mfa-lockout-rules";

// Audit SEC-006 · D6 amended: 0055's policy, byte-for-byte, at the app layer —
// 5 wrong codes inside 15 minutes → locked 15 minutes; window lapse resets.
describe("TOTP lockout window math", () => {
  const t0 = Date.parse("2026-08-05T12:00:00Z");
  it("counts failures inside the window and locks on the 5th", () => {
    let row = null as ReturnType<typeof nextFailureRow> | null;
    for (let i = 0; i < LOCKOUT_MAX_FAILURES - 1; i++) {
      row = nextFailureRow(row, t0 + i * 1000);
      expect(row.locked_until).toBeNull();
    }
    row = nextFailureRow(row, t0 + 5000);
    expect(row.failed_count).toBe(5);
    expect(row.locked_until).not.toBeNull();
    expect(isLocked(row, t0 + 6000)).toBeGreaterThan(14 * 60);
  });
  it("a lapsed window resets the count to 1", () => {
    let row = nextFailureRow(null, t0);
    row = nextFailureRow(row, t0 + 1000);
    expect(row.failed_count).toBe(2);
    row = nextFailureRow(row, t0 + 16 * 60_000);
    expect(row.failed_count).toBe(1);
    expect(row.locked_until).toBeNull();
  });
  it("expired locks read as unlocked", () => {
    const row = { failed_count: 5, last_failed_at: new Date(t0).toISOString(), locked_until: new Date(t0 + 15 * 60_000).toISOString() };
    expect(isLocked(row, t0 + 1)).toBeGreaterThan(0);
    expect(isLocked(row, t0 + 15 * 60_000 + 1)).toBe(0);
    expect(isLocked(null, t0)).toBe(0);
  });
});
