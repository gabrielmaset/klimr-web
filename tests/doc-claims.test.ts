import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";

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
    // KFU-030 (0285) took the archive to version 4: coverage_status is measured
    // against the database's versioned data inventory, separately from
    // query_integrity. The doc and the route must still agree — that is what this
    // test is for; only the version they agree ON has moved.
    expect(route).toContain("format_version: 4");
    expect(readFileSync("docs/DATA-GOVERNANCE.md", "utf8")).toContain("format_version: 4");
    expect(route).toContain("coverage_status");
    expect(route).toContain("query_integrity");
  });

  it("0218's pickup points match lib/ranking.ts", () => {
    const ts = readFileSync("lib/ranking.ts", "utf8");
    const win = Number(ts.match(/PICKUP_WIN_POINTS\s*=\s*(\d+)/)?.[1]);
    const loss = Number(ts.match(/PICKUP_LOSS_POINTS\s*=\s*(\d+)/)?.[1]);
    const sql = readFileSync("supabase/migrations/0218_queue_finish_match.sql", "utf8");
    // The award moved into SQL, so the two copies of these numbers must agree.
    // This is the third duplicated-constant pair in the schema; each one gets a
    // test rather than a comment asking people to remember.
    expect(sql, `PICKUP_WIN_POINTS is ${win}`).toContain(`then ${win} else ${loss} end`);
  });

  it("klimr_ready's expected check count matches the checks that exist", () => {
    const names = new Set<string>();
    for (const f of readdirSync("supabase/migrations")) {
      if (!f.endsWith(".sql")) continue;
      const src = readFileSync(`supabase/migrations/${f}`, "utf8");
      for (const m of src.matchAll(/create or replace function public\.(\w+_intact)\s*\(\s*\)/g)) {
        names.add(m[1]);
      }
    }
    // 0223 introduced the floor, but a later migration may raise it when it adds a
    // check — and 0223 is applied in production, so it is never edited. The
    // EFFECTIVE default is the one in the highest-numbered migration that
    // redefines klimr_ready; resolve that rather than trusting one filename.
    const readinessFiles = readdirSync("supabase/migrations")
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .filter((f) =>
        /create or replace function public\.klimr_ready\s*\(\s*p_min_checks/.test(
          readFileSync(`supabase/migrations/${f}`, "utf8"),
        ),
      );
    expect(readinessFiles.length, "no migration defines klimr_ready").toBeGreaterThan(0);
    const effective = readFileSync(`supabase/migrations/${readinessFiles[readinessFiles.length - 1]}`, "utf8");
    const expected = Number(effective.match(/p_min_checks integer default (\d+)/)?.[1]);
    // A dropped check does not FAIL readiness — it vanishes from the list, and a
    // list with nothing in it has nothing failing in it. So the count is part of
    // the contract, and this is what stops it drifting: add a check, bump the
    // number, or the build tells you.
    expect(names.size, `${names.size} *_intact() functions defined; klimr_ready expects ${expected}`).toBe(expected);
  });

  it("the Node version is one number in three places", () => {
    const stated = claim("README.md", "node-version");
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { engines?: { node?: string } };
    const nvmrc = readFileSync(".nvmrc", "utf8").trim();
    const ci = readFileSync(".github/workflows/ci.yml", "utf8");
    expect(pkg.engines?.node, "package.json engines.node").toBe(`${stated}.x`);
    expect(nvmrc, ".nvmrc").toBe(stated);
    expect(ci, "CI node-version").toContain(`node-version: ${stated}`);
  });

  it("RESILIENCE does not claim a drill has been run until one has", () => {
    // The targets are inferences from the backup schedule, not measurements. If
    // someone marks them validated, they must also record a drill — this is what
    // stops "≤ 4 hours" quietly becoming a commitment nobody tested.
    expect(claim("docs/RESILIENCE.md", "drill-run")).toBe("never");
    const src = readFileSync("docs/RESILIENCE.md", "utf8");
    expect(src).toContain("UNVALIDATED");
    expect(src).toContain("storage_manifest_take");
  });

  it("the relationship policy document matches the migrations that enforce it", () => {
    expect(claim("docs/RELATIONSHIP-PRIVACY-POLICY.md", "policy-source")).toBe("0233,0234");
    const doc = readFileSync("docs/RELATIONSHIP-PRIVACY-POLICY.md", "utf8");
    const m0233 = readFileSync("supabase/migrations/0233_privacy_policy.sql", "utf8");
    const m0234 = readFileSync("supabase/migrations/0234_mute_and_restrict.sql", "utf8");

    // Every default the document states must be the default the schema sets.
    // A policy document that drifts from the code is worse than none: it is
    // consulted, believed, and wrong — which is the condition KCDX-032 recorded.
    for (const [setting, level] of [
      ["who_can_request", "everyone"],
      ["who_can_invite", "everyone"],
      ["who_can_comment", "everyone"],
      ["who_can_message", "network"],
      ["who_can_tag", "following"],
    ] as const) {
      // Match on the pair, tolerant of the column alignment padding in the DDL.
      const declared = new RegExp(`${setting}\\s+public\\.audience_level[^,]*default '${level}'`);
      expect(m0233, `${setting} must default to ${level}`).toMatch(declared);
      expect(doc, `${setting} documented`).toContain(setting);
      expect(doc, `${level} documented for ${setting}`).toContain(`\`${level}\``);
    }
    // The functions the document names as enforcement must exist in the source.
    for (const fn of ["may_act_on", "may_see_connections", "may_see_schedule"]) {
      expect(m0233, `${fn} defined`).toContain(`function public.${fn}(`);
      expect(doc, `${fn} referenced`).toContain(fn);
    }
    for (const fn of ["is_muted_by", "is_restricted_by", "comment_visible_to"]) {
      expect(m0234, `${fn} defined`).toContain(`function public.${fn}(`);
      expect(doc, `${fn} referenced`).toContain(fn);
    }
  });

  it("the document index does not list repo files that no longer exist", () => {
    const idx = readFileSync("docs/klimr-document-index.md", "utf8");
    // Every `docs/...md` or root .md the index names must actually be there.
    // The .docx mirror of this index went stale at July while the index moved on;
    // an index that names missing files rots the same way, just less visibly.
    const named = [...idx.matchAll(/`((?:docs\/)?[A-Za-z0-9_.-]+\.md)`/g)].map((m) => m[1]);
    const missing = [...new Set(named)].filter((f) => !existsSync(f) && !f.startsWith("Klimr_") && !f.startsWith("klimr-"));
    expect(missing, `index names files that do not exist: ${missing.join(", ")}`).toEqual([]);
  });

  it("the decisions register and the contract point at each other", () => {
    const reg = readFileSync("docs/DECISIONS_REGISTER.md", "utf8");
    const contract = readFileSync("CLAUDE.md", "utf8");
    // A continuity rule nobody can find is not a continuity rule.
    expect(contract, "CLAUDE.md must point at the register").toContain("DECISIONS_REGISTER.md");
    expect(reg, "register must carry the superseded $825K figure so it is searchable").toContain("825");
    expect(reg).toContain("$900,000");
    // Every decision row is numbered so it can be cited in a later session.
    const rows = reg.match(/^\| D-\d+ \|/gm) ?? [];
    expect(rows.length, "register must hold decisions").toBeGreaterThanOrEqual(20);
  });

  it("every control document names an owner and a reconciliation date", () => {
    const missing = ["SECURITY.md", "docs/RELATIONSHIP-PRIVACY-POLICY.md"].filter((f) => {
      const src = readFileSync(f, "utf8");
      return !/\*\*Owner:\*\*/.test(src) || !/Last reconciled against source:/.test(src);
    });
    expect(missing).toEqual([]);
  });
});
