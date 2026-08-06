import { describe, it, expect } from "vitest";
import { isAuthorizedCron } from "./cron-auth";

const h = (map: Record<string, string>) => ({ get: (k: string) => map[k.toLowerCase()] ?? null });

// Audit SEC-003: cron routes must FAIL CLOSED when the secret is unset.
describe("cron guard", () => {
  it("denies everything when the secret is missing", () => {
    expect(isAuthorizedCron(h({ authorization: "Bearer x" }), undefined)).toBe(false);
    expect(isAuthorizedCron(h({ "x-cron-secret": "x" }), "")).toBe(false);
  });
  it("denies wrong or absent credentials", () => {
    expect(isAuthorizedCron(h({}), "s3cret")).toBe(false);
    expect(isAuthorizedCron(h({ authorization: "Bearer nope" }), "s3cret")).toBe(false);
    expect(isAuthorizedCron(h({ "x-cron-secret": "nope" }), "s3cret")).toBe(false);
    expect(isAuthorizedCron(h({ authorization: "s3cret" }), "s3cret")).toBe(false); // must be Bearer-prefixed
  });
  it("accepts either transport with the right secret", () => {
    expect(isAuthorizedCron(h({ authorization: "Bearer s3cret" }), "s3cret")).toBe(true); // Vercel cron
    expect(isAuthorizedCron(h({ "x-cron-secret": "s3cret" }), "s3cret")).toBe(true); // pg_cron (0173)
  });
});
