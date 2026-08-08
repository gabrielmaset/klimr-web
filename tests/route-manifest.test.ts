import { describe, it, expect } from "vitest";
import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { classifyPath, mayRedirectToLogin } from "../lib/route-manifest";

/* KCDX-039 — the route semantic manifest.
 *
 * The original bug was invisible in every way that matters: the crons were
 * scheduled, the handlers were correct and fail-closed, the deploy was green,
 * and Vercel's scheduler happily followed a 307 to a login page and recorded a
 * 200. Nothing looked broken. `finalize-tournaments` simply never ran.
 *
 * So the test that matters is not "does the manifest parse" — it is "does every
 * route that actually exists on disk have the class it needs", checked against
 * the filesystem rather than against a list someone remembered to update. */

const apiRoutes = (): string[] => {
  const out: string[] = [];
  const walk = (dir: string, prefix: string) => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir)) {
      const p = `${dir}/${e}`;
      if (statSync(p).isDirectory()) walk(p, `${prefix}/${e}`);
      else if (e === "route.ts") out.push(prefix);
    }
  };
  walk("app/api", "/api");
  return out;
};

describe("KCDX-039 route classification", () => {
  it("every machine route reaches its handler instead of a login page", () => {
    // Each of these was receiving a 307 to /login. The crons had therefore never
    // executed, and Courtside could not register a device — which after 0192 is
    // the only way a display can record a match result.
    for (const p of [
      "/api/cron/finalize-tournaments",
      "/api/cron/waitlist-sweep",
      "/api/courtside/register",
      "/api/courtside/heartbeat",
      "/api/csp-report",
      "/api/rum",
      "/api/app-diagnostics",
      "/api/queue/abc123",
      "/api/q/validate",
    ]) {
      expect(classifyPath(p), `${p} must be a machine route`).toBe("machine");
    }
  });

  it("human API routes stay human", () => {
    expect(classifyPath("/api/support-chat")).toBe("human");
    expect(classifyPath("/api/courts/search")).toBe("human");
  });

  it("no /api path may ever be answered with an HTML redirect", () => {
    for (const p of [...apiRoutes(), "/api/anything-new", "/api/support-chat"]) {
      expect(mayRedirectToLogin(p), `${p} must not redirect`).toBe(false);
    }
    // …while human pages still should.
    expect(mayRedirectToLogin("/settings")).toBe(true);
    expect(mayRedirectToLogin("/feed")).toBe(true);
  });

  it("every API route on disk is classified machine or human, never left public by accident", () => {
    for (const p of apiRoutes()) {
      const cls = classifyPath(p);
      expect(["machine", "human"], `${p} is classified ${cls}`).toContain(cls);
    }
  });

  it("an unlisted API route fails closed rather than falling through", () => {
    // "human" for an /api path means: 401 JSON when signed out, because
    // mayRedirectToLogin is false. That is the fail-closed default.
    expect(classifyPath("/api/some-future-route")).toBe("human");
    expect(mayRedirectToLogin("/api/some-future-route")).toBe(false);
  });

  it("public human pages are still reachable signed out", () => {
    for (const p of ["/", "/login", "/signup", "/auth/callback", "/gate/ABCD-EFGH-IJKL", "/q/XK4M2P", "/e/SOMECODE"]) {
      expect(classifyPath(p), `${p} must be public`).toBe("public");
    }
  });

  it("the cron paths in vercel.json are all declared machine routes", () => {
    if (!existsSync("vercel.json")) return;
    const cfg = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons?: { path: string }[] };
    for (const c of cfg.crons ?? []) {
      expect(classifyPath(c.path), `${c.path} is scheduled but not a machine route`).toBe("machine");
    }
  });
});
