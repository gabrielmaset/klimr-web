import { describe, it, expect, vi } from "vitest";

/* KFU-022 — the overall signal reaches the hops.
 * Before the fix, resolveMapsShortLink's own AbortController was passed to
 * NOTHING: its 6.5 s "overall" ceiling was decorative and the worst case was
 * six hops at 6.5 s each. This proves an external abort stops the walk. */
const calls: { n: number } = { n: 0 };
vi.mock("@/lib/egress", () => ({
  safeGet: vi.fn(async (_url: string, opts?: { signal?: AbortSignal }) => {
    calls.n++;
    if (opts?.signal?.aborted) throw new Error("egress: aborted");
    return {
      status: 302,
      headers: { get: (n: string) => (n === "location" ? "https://maps.app.goo.gl/hop" + calls.n : null) },
      text: async () => "",
    };
  }),
}));

import { resolveMapsShortLink } from "./maps-url";

describe("KFU-022: external abort stops the redirect walk", () => {
  it("aborting after the first hop ends the walk instead of running all six", async () => {
    const ext = new AbortController();
    // Abort as soon as the first hop resolves: the walk must not start hop 3.
    const p = resolveMapsShortLink("https://maps.app.goo.gl/x1", undefined, ext.signal);
    ext.abort();
    const out = await p;
    expect(out).toBeNull();
    expect(calls.n).toBeLessThanOrEqual(2);
  });
});
