import { describe, it, expect } from "vitest";
import { queueEtag, canServe304 } from "./queue-etag";

describe("queue ETag (K2-02)", () => {
  const S = "sess-1";
  it("changes when the session version changes", () => {
    expect(queueEtag(S, 1, "public", null)).not.toBe(queueEtag(S, 2, "public", null));
  });
  it("NEVER collides across audiences — organizer and public must not share a cache entry", () => {
    const org = queueEtag(S, 7, "org", "u1");
    const player = queueEtag(S, 7, "player", "u1");
    const pub = queueEtag(S, 7, "public", null);
    expect(new Set([org, player, pub]).size).toBe(3);
  });
  it("separates viewers so myPending can't cross users", () => {
    expect(queueEtag(S, 7, "player", "u1")).not.toBe(queueEtag(S, 7, "player", "u2"));
  });
  it("is stable for identical inputs", () => {
    expect(queueEtag(S, 7, "org", "u1")).toBe(queueEtag(S, 7, "org", "u1"));
  });
  it("refuses to 304 on an unknown version, even with a matching tag", () => {
    const tag = queueEtag(S, 0, "public", null);
    expect(canServe304(0, tag, tag)).toBe(false);
    expect(canServe304(3, tag, tag)).toBe(true);
  });
  it("refuses to 304 on a mismatched or absent tag", () => {
    const tag = queueEtag(S, 3, "public", null);
    expect(canServe304(3, null, tag)).toBe(false);
    expect(canServe304(3, queueEtag(S, 2, "public", null), tag)).toBe(false);
  });
});
