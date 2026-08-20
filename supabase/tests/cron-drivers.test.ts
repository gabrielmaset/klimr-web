import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * WP-G guardrail (born from KFU-002): every cron route under app/api/cron must
 * have a declared pg_cron driver in some migration, and no two routes may be
 * driven by the same job name. 0232 orphaned a route by reusing a job name;
 * this test makes that class of regression fail the build instead of going
 * silently dark in production.
 */
describe("cron routes have declared, uniquely-named drivers", () => {
  const cronDir = join(process.cwd(), "app/api/cron");
  const migDir = join(process.cwd(), "supabase/migrations");
  const migrations = existsSync(migDir)
    ? readdirSync(migDir).filter((f) => f.endsWith(".sql")).map((f) => readFileSync(join(migDir, f), "utf8")).join("\n")
    : "";

  const routes = existsSync(cronDir)
    ? readdirSync(cronDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
    : [];

  it("finds at least the known cron routes", () => {
    expect(routes).toContain("worker-heartbeat");
    expect(routes).toContain("waitlist-sweep");
  });

  for (const route of routes) {
    it(`route ${route} is referenced by a cron.schedule or vercel.json`, () => {
      const inMigration = migrations.includes(`/api/cron/${route}`);
      const vercelPath = join(process.cwd(), "vercel.json");
      const vercel = existsSync(vercelPath) ? readFileSync(vercelPath, "utf8") : "";
      const inVercel = vercel.includes(`/api/cron/${route}`);
      expect(inMigration || inVercel).toBe(true);
    });
  }

  it("no pg_cron job name drives more than one distinct cron route", () => {
    // Extract cron.schedule('<name>', ...) blocks and the /api/cron/<route> each targets.
    const jobToRoutes = new Map<string, Set<string>>();
    const scheduleRe = /cron\.schedule\(\s*'([^']+)'[\s\S]*?(?=cron\.schedule\(|$)/g;
    let m: RegExpExecArray | null;
    while ((m = scheduleRe.exec(migrations)) !== null) {
      const job = m[1];
      const block = m[0];
      const routeRe = /\/api\/cron\/([a-z0-9-]+)/g;
      let r: RegExpExecArray | null;
      while ((r = routeRe.exec(block)) !== null) {
        if (!jobToRoutes.has(job)) jobToRoutes.set(job, new Set());
        jobToRoutes.get(job)!.add(r[1]);
      }
    }
    for (const [job, rs] of jobToRoutes) {
      expect(rs.size, `job '${job}' drives multiple routes: ${[...rs].join(", ")}`).toBeLessThanOrEqual(1);
    }
  });
});
