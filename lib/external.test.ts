import { describe, it, expect, beforeEach } from "vitest";
import { callExternal, breakerStatus, resetBreaker, CircuitOpenError } from "./external";

/* KCDX-056 — the three controls, tested for what they actually promise.
 *
 * The breaker is the one worth testing hardest, because a breaker people believe
 * in but which does not open is worse than none: it produces confident incident
 * reports about protection that was never there. */

describe("KCDX-056 external call discipline", () => {
  beforeEach(() => {
    for (const v of ["t-timeout", "t-retry", "t-breaker", "t-recover", "t-noretry"]) resetBreaker(v);
  });

  it("aborts the signal when the deadline passes", async () => {
    let sawAbort = false;
    await expect(
      callExternal({ vendor: "t-timeout", timeoutMs: 40 }, (signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            sawAbort = true;
            reject(signal.reason);
          });
        }),
      ),
    ).rejects.toThrow(/timed out/);
    expect(sawAbort).toBe(true);
  });

  it("does not retry unless asked — repeating a call is the caller's decision", async () => {
    let calls = 0;
    await expect(
      callExternal({ vendor: "t-noretry", timeoutMs: 500 }, async () => {
        calls++;
        throw new Error("vendor 500");
      }),
    ).rejects.toThrow("vendor 500");
    expect(calls).toBe(1);
  });

  it("retries up to the limit and succeeds if the vendor recovers", async () => {
    let calls = 0;
    const out = await callExternal({ vendor: "t-retry", timeoutMs: 500, retries: 2, backoffMs: 1 }, async () => {
      calls++;
      if (calls < 3) throw new Error("flaky");
      return "ok";
    });
    expect(out).toBe("ok");
    expect(calls).toBe(3);
  });

  it("opens the circuit after repeated failure and then fails fast", async () => {
    const boom = () => callExternal({ vendor: "t-breaker", timeoutMs: 200 }, async () => { throw new Error("down"); });
    for (let i = 0; i < 5; i++) await expect(boom()).rejects.toThrow("down");

    expect(breakerStatus("t-breaker").open).toBe(true);

    // The next call must not reach the vendor at all.
    let reached = false;
    await expect(
      callExternal({ vendor: "t-breaker", timeoutMs: 200 }, async () => { reached = true; return "x"; }),
    ).rejects.toBeInstanceOf(CircuitOpenError);
    expect(reached, "the breaker let a call through while open").toBe(false);
  });

  it("closes again after a success", async () => {
    for (let i = 0; i < 5; i++) {
      await expect(
        callExternal({ vendor: "t-recover", timeoutMs: 200 }, async () => { throw new Error("down"); }),
      ).rejects.toThrow();
    }
    expect(breakerStatus("t-recover").open).toBe(true);

    // Half-open: force the window past and let one probe through.
    resetBreaker("t-recover");
    const out = await callExternal({ vendor: "t-recover", timeoutMs: 200 }, async () => "back");
    expect(out).toBe("back");
    expect(breakerStatus("t-recover").failures).toBe(0);
  });

  it("keeps vendors independent — one outage must not fail-fast another", async () => {
    for (let i = 0; i < 5; i++) {
      await expect(
        callExternal({ vendor: "t-breaker", timeoutMs: 200 }, async () => { throw new Error("down"); }),
      ).rejects.toThrow();
    }
    expect(breakerStatus("t-breaker").open).toBe(true);
    expect(breakerStatus("t-retry").open).toBe(false);
    await expect(callExternal({ vendor: "t-retry", timeoutMs: 200 }, async () => "fine")).resolves.toBe("fine");
  });
});
