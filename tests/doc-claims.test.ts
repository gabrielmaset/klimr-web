import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";

/* KCDX-058 — control documents that contradict the source.
 *
 * SECURITY.md said "no dangerouslySetInnerHTML" while ten sinks existed.
 * RESILIENCE.md said Storage was covered by the project backup when no Storage
 * backup exists at all. README said `/` and `/login` work without keys when the
 * middleware constructs a Supabase client on every request and 500s without them.
 *
 * None of those were lies. They were true when written and quietly stopped being
 * true, which is what documentation does. The fix that lasts is not better prose —
 * it is making the countable claims fail the build when they drift, so the doc
 * cannot silently disagree with the code for six months.
 *
 * A claim is tagged in the doc as `<!-- claim:name=value -->` and asserted here.
 * If you change the code, this test tells you which sentence to update. */

const listFiles = (dir: string): string[] => {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = `${dir}/${e}`;
    if (statSync(p).isDirectory()) out.push(...listFiles(p));
    else if (/\.(ts|tsx)$/.test(p) && !p.endsWith(".test.ts")) out.push(p);
  }
  return out;
};

const claim = (file: string, name: string): string => {
  const src = readFileSync(file, "utf8");
  const m = src.match(new RegExp(`<!--\\s*claim:${name}=([^\\s>]+)\\s*-->`));
  if (!m) throw new Error(`${file} no longer carries the claim tag "${name}" — was the sentence deleted rather than updated?`);
  return m[1];
};

describe("KCDX-058 documentation claims match the source", () => {
  it("SECURITY.md states the true number of dangerouslySetInnerHTML sinks", () => {
    const actual = [...listFiles("app"), ...listFiles("components"), ...listFiles("lib")]
      .reduce((n, f) => n + (readFileSync(f, "utf8").match(/dangerouslySetInnerHTML/g)?.length ?? 0), 0);
    const stated = Number(claim("SECURITY.md", "xss-sinks"));
    expect(
      actual,
      `SECURITY.md says ${stated} dangerouslySetInnerHTML sinks; the code has ${actual}. ` +
        `If you added one, confirm it renders sanitised or server-generated HTML, then update the count.`,
    ).toBe(stated);
  });

  it("RESILIENCE.md does not claim Storage is backed up, because it is not", () => {
    expect(claim("docs/RESILIENCE.md", "storage-backup")).toBe("none");
    const src = readFileSync("docs/RESILIENCE.md", "utf8");
    // The specific false sentence, and any revival of it.
    expect(src).not.toMatch(/Storage[^|\n]*covered by the project backup/i);
  });

  it("README does not claim pages render without Supabase keys", () => {
    expect(claim("README.md", "keyless-pages")).toBe("false");
    const mw = readFileSync("lib/supabase/middleware.ts", "utf8");
    // The reason the claim is false: the client is constructed unconditionally.
    expect(mw).toContain("createServerClient");
    expect(readFileSync("README.md", "utf8")).not.toMatch(/work without keys/i);
  });

  it("SECURITY.md's video claim matches the migration that enforces it", () => {
    expect(claim("SECURITY.md", "video-disabled")).toBe("true");
    const mig = readFileSync("supabase/migrations/0195_video_disabled.sql", "utf8");
    expect(mig).toContain("posts_reject_video");
    expect(mig).toMatch(/allowed_mime_types\s*=\s*array\['image\//);
  });

  it("DATA-GOVERNANCE describes the profile read split that 0191 actually created", () => {
    expect(claim("docs/DATA-GOVERNANCE.md", "profile-readers")).toBe("split");
    const mig = readFileSync("supabase/migrations/0191_profile_private_boundary.sql", "utf8");
    expect(mig).toContain("profile_private");
    expect(mig).toContain("profiles_public");
    expect(mig).toMatch(/revoke select on public\.profiles from anon, authenticated/);
  });

  it("0200's rolling-window constants match lib/ranking.ts", () => {
    const ts = readFileSync("lib/ranking.ts", "utf8");
    const weeks = Number(ts.match(/ROLLING_WEEKS\s*=\s*(\d+)/)?.[1]);
    const best = Number(ts.match(/ROLLING_BEST\s*=\s*(\d+)/)?.[1]);
    const sql = readFileSync("supabase/migrations/0200_recompute_points.sql", "utf8");
    // Duplicated constants drift. The SQL mirrors these two numbers because the
    // computation moved into the database; this is the thing that notices.
    expect(sql, `ROLLING_WEEKS is ${weeks} in TypeScript`).toContain(`interval '${weeks} weeks'`);
    expect(sql, `ROLLING_BEST is ${best} in TypeScript`).toMatch(new RegExp(`limit ${best}\\b`));
  });

  it("DATA-GOVERNANCE's export claim matches what the route actually returns", () => {
    expect(claim("docs/DATA-GOVERNANCE.md", "export-coverage")).toBe("partial-with-index");
    const route = readFileSync("app/settings/export/route.ts", "utf8");
    // the nine documented categories, and the honesty index that makes the
    // partial coverage legible to the person reading the file
    for (const key of ["identity", "social", "content", "play", "teams",
                       "commerce", "communications", "safety", "devices"]) {
      expect(route, `export omits the ${key} category`).toContain(key);
    }
    expect(route).toContain("coverage");
    expect(route).toContain("excluded");
    expect(route).toContain("format_version: 2");
  });

  it("every control document names an owner and a reconciliation date", () => {
    const missing = ["SECURITY.md"].filter((f) => {
      const src = readFileSync(f, "utf8");
      return !/\*\*Owner:\*\*/.test(src) || !/Last reconciled against source:/.test(src);
    });
    expect(missing).toEqual([]);
  });
});
