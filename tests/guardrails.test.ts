import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";

// Source-level tripwires: these fail the suite if a security fix regresses.
const read = (p: string) => readFileSync(p, "utf8");

describe("Phase 0 guardrails", () => {
  it("SEC-001: the self-approve verification stub stays deleted", () => {
    for (const p of ["app/account/actions.ts", "app/account/page.tsx", "app/settings/verification/page.tsx"]) {
      expect(read(p)).not.toContain("approveVerification");
    }
  });
  it("TOUR-001: tournament codes use crypto randomness", () => {
    const src = read("app/tournaments/actions.ts");
    const fn = src.slice(src.indexOf("function makeCode"), src.indexOf("function makeCode") + 400);
    expect(fn).toContain("randomInt");
    expect(fn).not.toMatch(/Math\.random\(/);
  });
  it("SEC-005: breadcrumbs serialize JSON-LD through the safe serializer", () => {
    const src = read("components/breadcrumbs.tsx");
    expect(src).toContain("safeJsonLd");
    expect(src).not.toMatch(/__html:\s*JSON\.stringify/);
  });
  it("SEC-003/ADD-06: both cron routes use the shared fail-closed guard", () => {
    expect(read("app/api/cron/finalize-tournaments/route.ts")).toContain("isAuthorizedCron");
    expect(read("app/api/cron/waitlist-sweep/route.ts")).toContain("isAuthorizedCron");
  });
  it("QUEUE-002: the schema-tolerance shims stay deleted", () => {
    const src = read("lib/queue-state.ts");
    expect(src).not.toContain("Retrying without");
    expect(src).not.toContain("display_code missing");
  });
});

describe("Phase 1 guardrails (K1-01/02/03)", () => {
  it("SEC-006: requireAdmin asserts step-up; D8 mutations carry it", () => {
    expect(read("lib/admin.ts")).toContain("getStepUpDecision");
    expect(read("app/settings/actions.ts")).toContain("getStepUpDecision");
    expect(read("app/teams/actions.ts")).toContain("getStepUpDecision");
  });
  it("SEC-006: browser never calls mfa.verify — the server action fronts it", () => {
    const src = read("components/mfa-flow.tsx");
    expect(src).toContain("verifyTotpAction");
    expect(src).not.toContain("supabase.auth.mfa.verify");
  });
  it("SEC-007: classified endpoints use the fail-closed limiter", () => {
    for (const p of ["app/search/ai-actions.ts", "app/gate/actions.ts", "app/api/q/validate/route.ts", "app/api/app-diagnostics/route.ts"]) {
      expect(read(p)).toContain("rateLimitStrict");
    }
  });
  it("SEC-008: diagnostics carries dedupe and the daily cap", () => {
    const src = read("app/api/app-diagnostics/route.ts");
    expect(src).toContain("diag:dupe:");
    expect(src).toContain(">= 500");
  });
});

describe("Phase 1 guardrails (K1-04/05/07)", () => {
  it("SRCH-004: deterministic interpretation is extracted and importable", () => {
    expect(read("app/search/actions.ts")).toContain("interpretQuery");
    // conjunctions the golden corpus caught must stay stopped
    expect(read("lib/search-query.ts")).toContain('"and"');
  });
  it("COURT-007/ADD-01: the self-invalidation fall-through is gone", () => {
    const src = read("app/courts/search-actions.ts");
    expect(src).not.toContain("Newer intel exists → fall through");
    expect(src).toContain("SELF-INVALIDATION"); // the documented fix marker
  });
  it("COURT-006: intel-only fallback exists for judge-down / key-missing", () => {
    expect(read("app/courts/search-actions.ts")).toContain("intelOnlyResults");
  });
  it("K1-04: AI search has a kill switch and a total deadline", () => {
    const src = read("lib/ai-search.ts");
    expect(src).toContain("AI_SEARCH_DISABLED");
    expect(src).toContain("AI_TOTAL_DEADLINE_MS");
  });
  it("K1-01: the privilege layer and its grandfather list are wired", () => {
    expect(read("eslint.config.mjs")).toContain("adminGrandfather");
    expect(read("lib/privileged/index.ts")).toContain("getPrivilegedClient");
  });
});

describe("Phase 2 guardrails (K2-01)", () => {
  it("QUEUE-001: placement goes through the atomic RPC, not read-then-write", () => {
    const src = read("app/queue/actions.ts");
    expect(src).toContain('rpc("place_on_team"');
    // the racy pattern: selecting forming teams then inserting one in app code
    expect(src).not.toMatch(/status:\s*"forming"\s*\}\)\s*\.select\("id"\)/);
  });
  it("QUEUE-004: the migration serializes on the key before reading the log", () => {
    const sql = read("supabase/migrations/0176_queue_place_atomic.sql");
    const keyLock = sql.indexOf("qcmd:");
    const logRead = sql.indexOf("from public.queue_command_log");
    expect(keyLock).toBeGreaterThan(-1);
    expect(keyLock).toBeLessThan(logRead); // lock ordering is the whole fix
  });
});

describe("Phase 2 guardrails (K2-02)", () => {
  it("QUEUE-003: the poll route is version-first and can 304", () => {
    const src = read("app/api/queue/[id]/route.ts");
    expect(src).toContain('rpc("queue_version"');
    expect(src).toContain("canServe304");
    expect(src).toContain("status: 304");
  });
  it("QUEUE-003: the ETag carries the audience (no cross-audience cache reuse)", () => {
    const src = read("app/api/queue/[id]/route.ts");
    expect(src).toContain("queueEtag(id, version, audience, meId)");
  });
  it("QUEUE-003: the poller sends If-None-Match and honours 304", () => {
    const src = read("components/queue/use-queue-state.ts");
    expect(src).toContain("If-None-Match");
    expect(src).toContain("r.status === 304");
  });
});

describe("Phase 2 guardrails (K2-03)", () => {
  it("DEP-005: courts verification is enqueued durably, not only fire-and-forget", () => {
    const src = read("app/courts/search-actions.ts");
    expect(src).toContain('kind: "verify_venue"');
    expect(src).toContain("dedupeKey:");
  });
  it("DEP-005: the minute cron drains the jobs queue", () => {
    expect(read("app/api/cron/waitlist-sweep/route.ts")).toContain("runJobs(");
  });
  it("DEP-005: claim uses SKIP LOCKED and reclaims expired leases", () => {
    const sql = read("supabase/migrations/0178_jobs.sql");
    expect(sql).toContain("for update skip locked");
    expect(sql).toContain("c.leased_until < now()");
  });
  it("DEP-005: failures back off and dead-letter rather than loop", () => {
    const sql = read("supabase/migrations/0178_jobs.sql");
    expect(sql).toContain("'dead'");
    expect(sql).toMatch(/least\(10 \* power\(2/);
  });
  it("DEP-005: the operator console can replay dead jobs", () => {
    expect(read("app/admin/jobs/actions.ts")).toContain('rpc("replay_job"');
  });
});

describe("Phase 2 guardrails (K2-04)", () => {
  it("TOUR-003: format_config merges in the DB, not in app memory", () => {
    const src = read("app/tournaments/actions.ts");
    expect(src).toContain('rpc("merge_format_config"');
    // the lost-update pattern: select format_config then spread it into the update
    expect(src).not.toMatch(/select\("format_config"\)[\s\S]{0,400}\.\.\.base/);
  });
  it("TOUR-003: a stale precondition surfaces as a conflict, not an overwrite", () => {
    const src = read("app/tournaments/actions.ts");
    expect(src).toContain("40001");
    expect(src).toContain("Someone else changed these settings");
  });
  it("TOUR-003: the merge holds a row lock and compares at ms precision", () => {
    const sql = read("supabase/migrations/0179_tournament_config_merge.sql");
    expect(sql).toContain("for update");
    expect(sql).toContain("date_trunc('milliseconds'");
  });
});

describe("Phase 2 guardrails (K2-05)", () => {
  it("PROD-005: heartbeat reflects nothing back to the caller", () => {
    const src = read("app/api/courtside/heartbeat/route.ts");
    // Superseded by 0184: authenticity is the token, not a spoofable header.
    expect(src).not.toContain("NextResponse.json({ ok: true");
    expect(src).toContain("status: 204");
  });
  it("SEC-008: the install id is stored, but IP only as a truncated hash", () => {
    const src = read("app/api/courtside/heartbeat/route.ts");
    expect(src).toContain('createHash("sha256")');
    expect(src).toContain("slice(0, 12)");
  });
  it("PROD-005: heartbeats never wipe operator-owned naming", () => {
    const sql = read("supabase/migrations/0180_courtside_devices.sql");
    // label / venue_name / notes are absent from the upsert's DO UPDATE set
    const doUpdate = sql.slice(sql.indexOf("do update"), sql.indexOf("end; $$"));
    expect(doUpdate).not.toContain("label");
    expect(doUpdate).not.toContain("venue_name");
    expect(doUpdate).not.toContain("notes");
  });
});

describe("Phase 2 guardrails (K2-06)", () => {
  it("DATA-003: data-quality scorecards are computed, not asserted", () => {
    const src = read("app/admin/data-quality/page.tsx");
    expect(src).toContain('rpc("court_data_quality"');
    expect(src).toContain('rpc("ranking_data_quality"');
  });
  it("DATA-003: disagreement rate is derived from evidence, not self-reported", () => {
    const sql = read("supabase/migrations/0181_court_evidence_and_quality.sql");
    expect(sql).toContain("count(distinct supports_verdict) > 1");
  });
  it("PERF-002: CI publishes a per-route bundle report", () => {
    const ci = read(".github/workflows/ci.yml");
    expect(ci).toContain("GITHUB_STEP_SUMMARY");
    expect(ci).toContain("Route (app)");
  });
});

describe("Courtside fleet counter (founder request)", () => {
  it("distinguishes app-open from actually running live play", () => {
    const sql = read("supabase/migrations/0182_courtside_fleet_status.sql");
    expect(sql).toContain("app_open");
    expect(sql).toContain("in_active_play");
    expect(sql).toContain("on_live_session");
  });
  it("in_active_play requires real play, not a version bump", () => {
    const sql = read("supabase/migrations/0182_courtside_fleet_status.sql");
    // A session-level edit bumps the version counter, so it must NOT be the
    // activity signal — creating an empty session would read as active play.
    const fn = sql.slice(sql.indexOf("courtside_fleet_status"), sql.indexOf("courtside_device_tiers"));
    expect(fn).not.toContain("queue_session_version");
    expect(fn).toContain("queue_teams");
    expect(fn).toContain("queue_matches");
  });
  it("surfaces on both the dashboard and the devices console", () => {
    expect(read("app/admin/page.tsx")).toContain('rpc("courtside_fleet_status")');
    expect(read("app/admin/devices/page.tsx")).toContain('rpc("courtside_fleet_status")');
  });
  it("excludes retired units from every tier", () => {
    const sql = read("supabase/migrations/0182_courtside_fleet_status.sql");
    expect(sql.match(/retired_at is null/g)?.length).toBeGreaterThanOrEqual(2);
  });
});

describe("Phase 3 guardrails (K3-01)", () => {
  it("UX-001 / D4: the desktop root-font downscale is gone", () => {
    const css = read("app/globals.css");
    // Match the DECLARATION, not the comment that documents why it went away.
    expect(css).not.toMatch(/font-size:\s*clamp\(0\.8rem/);
    expect(css).toContain("--text-floor");
    expect(css).toContain("--text-micro");
  });
  it("UX-003: no text renders below the 11px floor", () => {
    const glob = ["app", "components"];
    // Sub-floor Tailwind arbitrary sizes must not reappear.
    for (const dir of glob) {
      const out = walk(dir);
      for (const bad of ["text-[8px]", "text-[8.5px]", "text-[9px]", "text-[9.5px]"]) {
        expect(out).not.toContain(bad);
      }
    }
  });
  it("UX-002: the shared Button defaults to a non-submitting type", () => {
    expect(read("components/button.tsx")).toContain('type = "button"');
  });
});

// Cheap recursive read for the tripwire above.
function walk(dir: string): string {
  let out = "";
  for (const e of readdirSync(dir)) {
    const p = `${dir}/${e}`;
    if (statSync(p).isDirectory()) out += walk(p);
    else if (p.endsWith(".tsx")) out += read(p);
  }
  return out;
}

describe("Courts finder — search affordances tell the truth (bug fix Aug 2026)", () => {
  const src = () => read("app/courts/courts-finder.tsx");
  it("the Find-courts button is driven by the live search, not the URL transition", () => {
    const file = src();
    // Anchor on the handler and take a forward window — "Find courts" also
    // appears in a comment above and in an empty-state hint below.
    const at = file.indexOf("onClick={findCourts}");
    expect(at).toBeGreaterThan(-1);
    const btn = file.slice(at, at + 700);
    // `pending` is the router.push transition and fires on every radius change;
    // keying the spinner or disabled state off it faked a search that never ran.
    expect(btn).toContain("disabled={liveBusy}");
    expect(btn).toContain("{liveBusy ? <Loader2");
    expect(btn).not.toContain("disabled={pending}");
    expect(btn).not.toContain("{pending ? <Loader2");
  });
  it("a directory reload is labelled as an update, not a search", () => {
    const file = src();
    // The only "SEARCHING" wording left belongs to the actual live search.
    expect(file).toContain("UPDATING");
    expect(file).not.toMatch(/\{pending \? \([\s\S]{0,400}SEARCHING</);
  });
  it("radius is part of the search key, so changing it re-arms the button", () => {
    expect(src()).toContain("x.radius");
  });
});

describe("Courtside QA fixes (Gabriel, Aug 2026)", () => {
  it("two-column rosters size to their content, not 50/50", () => {
    const src = read("components/queue/court-display.tsx");
    const split = src.slice(src.indexOf('context === "match" && n >= 4'), src.indexOf('context === "match" && n >= 4') + 900);
    // flex-1 (basis 0) gave a short-name column as much width as a long one.
    expect(split).toContain('flex-auto');
    expect(split).not.toMatch(/rows\(team\.members\.slice\(0, half\)\)/);
  });
  it("the walk-up join status shares one fixed-height slot so nothing shifts", () => {
    const src = read("components/queue/guest-join.tsx");
    expect(src).toContain("min-h-[3.4rem]");
    expect(src).toContain('aria-live="polite"');
    // the confirmation names the player who just joined
    expect(src).toContain("confirmName");
  });
});

describe("Courtside heartbeat is actually SENT (bug: counter stuck at 0)", () => {
  it("the display posts heartbeats — the endpoint had no caller at all", () => {
    const src = read("components/queue/court-display.tsx");
    expect(src).toContain("/api/courtside/heartbeat");
    expect(src).toContain("getInstallId()");
  });
  it("BOTH clients report — gating on isApp is what left /admin/devices at 0", () => {
    const src = read("components/queue/court-display.tsx");
    const beat = src.slice(src.indexOf("Courtside fleet heartbeat"), src.indexOf("const exitToSetup"));
    expect(beat).not.toMatch(/if \(!isApp\) return/);
    expect(beat).toContain("ensureDeviceToken");
  });
});

describe("Courtside heartbeat authenticity (0184)", () => {
  it("heartbeats are token-authenticated, not header/IP-gated", () => {
    const src = read("app/api/courtside/heartbeat/route.ts");
    expect(src).toContain("p_token_hash");
    expect(src).toContain('createHash("sha256")');
    // rate limiting is a capacity control, never an authenticity control
    expect(src).not.toContain("rateLimitStrict");
  });
  it("the token is server-minted and stored only as a hash", () => {
    const src = read("app/api/courtside/register/route.ts");
    expect(src).toContain("randomBytes(32)");
    expect(src).toContain('createHash("sha256").update(token)');
    // registration keeps a strict limit because it is the guessable surface
    expect(src).toContain("rateLimitStrict");
  });
  it("retiring a device revokes its token", () => {
    expect(read("app/admin/devices/actions.ts")).toContain('rpc("courtside_revoke"');
  });
  it("the SQL throttle bounds a chatty client without an extra query", () => {
    const sql = read("supabase/migrations/0184_courtside_device_auth.sql");
    expect(sql).toContain("last_seen_at < now() - interval '60 seconds'");
  });
});
