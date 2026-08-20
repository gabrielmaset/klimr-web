import { describe, it, expect, beforeEach } from "vitest";
import { bucketAllow, _resetBuckets } from "./ratelimit-bucket";

// Audit SEC-007 · O-4: the in-process secondary limiter that engages when
// the DB limiter errors — cost-bearing endpoints stay bounded, never wide open.
describe("secondary rate bucket", () => {
  beforeEach(() => _resetBuckets());
  it("allows up to max inside the window, then blocks", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) expect(bucketAllow("k", 5, 60_000, t0 + i)).toBe(true);
    expect(bucketAllow("k", 5, 60_000, t0 + 10)).toBe(false);
  });
  it("slides: old hits fall out of the window", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) bucketAllow("k", 5, 60_000, t0 + i);
    expect(bucketAllow("k", 5, 60_000, t0 + 30_000)).toBe(false);
    expect(bucketAllow("k", 5, 60_000, t0 + 60_001)).toBe(true);
  });
  it("keys are independent", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) bucketAllow("a", 5, 60_000, t0 + i);
    expect(bucketAllow("a", 5, 60_000, t0 + 10)).toBe(false);
    expect(bucketAllow("b", 5, 60_000, t0 + 10)).toBe(true);
  });
  it("outage simulation: a flood is bounded to max per window per instance", () => {
    const t0 = 2_000_000;
    let allowed = 0;
    for (let i = 0; i < 200; i++) if (bucketAllow("flood", 12, 60_000, t0 + i)) allowed++;
    expect(allowed).toBe(12);
  });
});
