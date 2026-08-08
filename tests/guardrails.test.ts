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
    // 0187 replaced queue_version here with queue_poll_head, which returns the
    // version AND the organizer id so the ETag can be built before the load.
    expect(src).toContain('rpc("queue_poll_head"');
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
  it("surfaces on the dashboard, with the console on live queue metrics", () => {
    expect(read("app/admin/page.tsx")).toContain('rpc("courtside_fleet_status")');
    // The console moved to fleet_metrics in 0185 — queue counts, not a roster.
    expect(read("app/admin/devices/actions.ts")).toContain('rpc("fleet_metrics")');
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
  it("ending a session revokes the displays attached to it", () => {
    // Per-device retire went away with the roster (0185); revocation now rides
    // force-end, which is the action an operator actually reaches for.
    const sql = read("supabase/migrations/0185_fleet_realtime_metrics.sql");
    const fn = sql.slice(sql.indexOf("admin_force_end_session"));
    expect(fn).toContain("update public.courtside_devices");
    expect(fn).toContain("token_hash = null");
  });
  it("the SQL throttle bounds a chatty client without an extra query", () => {
    const sql = read("supabase/migrations/0184_courtside_device_auth.sql");
    expect(sql).toContain("last_seen_at < now() - interval '60 seconds'");
  });
});

describe("Tournament hosting gate (broken flow, Aug 2026)", () => {
  it("every gate uses the one shared predicate", () => {
    for (const p of ["app/tournaments/page.tsx", "app/tournaments/new/page.tsx"]) {
      const src = read(p);
      expect(src).toContain("canHostTournaments(");
      // The old inline check gated on a role no picker could ever offer.
      expect(src).not.toContain('includes("tournament_director")');
    }
  });
  it("no role is defined in a category the picker cannot render", () => {
    const roles = read("lib/professional-roles.ts");
    const form = read("components/professional-status-form.tsx");
    const rendered = /CATEGORY_ORDER: RoleCategory\[\] = \[([^\]]+)\]/.exec(form)?.[1] ?? "";
    const cats = [...roles.matchAll(/category: "(\w+)"/g)].map((m) => m[1]);
    for (const c of new Set(cats)) {
      // A role in an unrendered category is unrequestable and therefore dead —
      // exactly how "organizing" hid Event Organizer and Tournament Director.
      expect(rendered).toContain(`"${c}"`);
    }
  });
  it("legacy role keys still resolve to a readable label", () => {
    const roles = read("lib/professional-roles.ts");
    expect(roles).toContain("LEGACY_ROLE_LABEL");
    expect(roles).toContain('tournament_director: "Tournament Director"');
  });
});

describe("Live fleet console (founder spec, Aug 2026)", () => {
  it("reports queue counts, not a device roster", () => {
    const src = read("app/admin/devices/page.tsx") + read("app/admin/devices/fleet-console.tsx");
    expect(src).toContain("fetchFleetMetrics");
    expect(src).toContain("running_live_play");
    // the per-device list does not scale to thousands and is gone
    expect(src).not.toContain("Active fleet");
    expect(src).not.toContain("app_open");
  });
  it("polls fast enough to stay inside the 30s freshness target", () => {
    const src = read("app/admin/devices/fleet-console.tsx");
    expect(src).toContain("POLL_MS = 15_000");
    expect(read("components/queue/court-display.tsx")).toContain("20_000");
  });
  it("force-end clears play, revokes displays, and is audit-logged", () => {
    const sql = read("supabase/migrations/0185_fleet_realtime_metrics.sql");
    expect(sql).toContain("admin_force_end_session");
    expect(sql).toContain("revoked_at = now()");
    expect(sql).toContain("admin:force-end-session");
  });
  it("presence window is 45s, and the heartbeat throttle allows a 20s cadence", () => {
    const sql = read("supabase/migrations/0185_fleet_realtime_metrics.sql");
    expect(sql).toContain("interval '45 seconds'");
    expect(sql).toContain("interval '10 seconds'");
  });
  it("the courtside overlay scrolls on phones", () => {
    const src = read("components/queue/court-display.tsx");
    expect(src).toContain("overflow-y-auto overscroll-contain");
    expect(src).toContain("lg:overflow-hidden");
  });
});

describe("Tournament wizard is required-only (founder call, Aug 2026)", () => {
  it("collects only what is needed to create the event", () => {
    const src = read("components/tournament-setup-wizard.tsx");
    expect(src).toContain('const STEPS = ["Basics", "When & where", "Format", "Review"]');
    expect(src).not.toContain('"Registration", "Legal"');
  });
  it("still submits every field, so nothing is orphaned on create", () => {
    const src = read("components/tournament-setup-wizard.tsx");
    for (const f of ["registration_opens_at", "registration_deadline", "waiver_text", "rules_text"]) {
      expect(src).toContain(f);
    }
  });
  it("the settings page owns the deferred fields", () => {
    const src = read("components/tournament-settings-editor.tsx");
    for (const f of ["registration_opens_at", "registration_deadline", "waiver", "rules_text"]) {
      expect(src).toContain(f);
    }
  });
});

describe("Performance budgets are measured (K3-05)", () => {
  it("budgets live next to the measurement so they cannot drift", () => {
    const sql = read("supabase/migrations/0186_perf_samples.sql");
    expect(sql).toContain("'queue_snapshot',      300");
    expect(sql).toContain("'queue_action',        800");
    expect(sql).toContain("'court_search_stored', 1500");
  });
  it("an unmeasured budget is NULL, never passing", () => {
    const sql = read("supabase/migrations/0186_perf_samples.sql");
    expect(sql).toContain("when count(s.value_ms) = 0 then null");
  });
  it("the RUM beacon stores no identity and no raw URL", () => {
    const src = read("app/api/rum/route.ts");
    expect(src).toContain("routePattern");
    // Assert on the INSERT payload, not on prose — an explanatory comment
    // mentioning a field is not the same as storing it.
    const insert = src.slice(src.indexOf('from("perf_samples").insert'), src.indexOf("return new NextResponse(null, { status: 204 });", src.indexOf("insert")));
    expect(insert).not.toContain("user_id");
    expect(insert).not.toContain("referrer");
    expect(insert).not.toContain("href");
  });
  it("an unchanged poll returns 304 BEFORE loading the snapshot", () => {
    const src = read("app/api/queue/[id]/route.ts");
    const shortCircuit = src.indexOf("status: 304");
    const load = src.indexOf("await loadSessionState");
    const sample = src.indexOf('metric: "queue_snapshot"');
    expect(shortCircuit).toBeGreaterThan(-1);
    // The original K2-02 shipped these the other way round, so every "cheap"
    // poll still ran all five queries. Order is the whole fix.
    expect(shortCircuit).toBeLessThan(load);
    expect(sample).toBeGreaterThan(load);
  });
});

describe("CSP nonce migration (K3-06, report-only first)", () => {
  it("the strict policy drops unsafe-inline for scripts", () => {
    const src = read("lib/csp.ts");
    // Match the POLICY line, not the comment that explains it — a `.find()` on
    // "script-src" alone grabs the prose above it. (Third time this bit; see
    // DESIGN_DECISIONS "guards must assert on code, not prose".)
    const scriptLine = src.split("\n").find((l) => l.includes("script-src 'self'")) ?? "";
    expect(scriptLine).toContain("'nonce-");
    expect(scriptLine).toContain("'strict-dynamic'");
    expect(scriptLine).not.toContain("'unsafe-inline'");
  });
  it("ships REPORT-ONLY so nothing can break during the learning phase", () => {
    const mw = read("middleware.ts");
    expect(mw).toContain("Content-Security-Policy-Report-Only");
    // The enforced policy in next.config is untouched until reports are quiet.
    expect(read("next.config.ts")).toContain('key: "Content-Security-Policy"');
  });
  it("violation reports are deduped and store no page content", () => {
    const src = read("app/api/csp-report/route.ts");
    expect(src).toContain("csp:dupe:");
    expect(src).toContain('.split("?")[0]');
  });
});

describe("Search telemetry (K3-08 decision data)", () => {
  it("search records its OWN metrics, never the queue-action bucket", () => {
    const src = read("app/search/actions.ts");
    expect(src).toContain('"search_zero"');
    expect(src).toContain('"search_deterministic"');
    // Borrowing queue_action would corrupt a budget the audit set for the wedge.
    const block = src.slice(src.indexOf('reason: "search:telemetry"'));
    expect(block.slice(0, 600)).not.toContain('"queue_action"');
  });
  it("search telemetry stores no query text", () => {
    const src = read("app/search/actions.ts");
    const block = src.slice(src.indexOf('reason: "search:telemetry"'), src.indexOf("return results;"));
    expect(block).not.toContain("qRaw");
    expect(block).not.toContain("condensed");
  });
});

/* ── KCDX-001: the profile privacy boundary ──────────────────────────────────
 * The boundary itself is in the database: migration 0191 revokes table-level
 * SELECT on `profiles` and grants back a named public column list, so a member
 * asking PostgREST for someone else's phone number is refused by Postgres. This
 * test does not re-prove that — role tests do. What it guards is the code side:
 * a private column may only be read from `profiles` in a file that has a
 * privileged client, because those reads are server-side computation that never
 * returns the value. Anywhere else, the read would simply fail at runtime with
 * "permission denied", and failing in CI is cheaper than failing in production.
 *
 * Own-row reads go through the `profile_private` view, which filters to
 * auth.uid() in SQL.
 */
describe("KCDX-001 profile privacy boundary", () => {
  const PRIVATE = [
    "date_of_birth", "birth_year", "phone", "phone_country", "home_zip",
    "neighborhood", "availability", "account_status", "suspended_until",
    "archived_at", "onboarding_draft", "signup_code",
  ];
  const listFiles = (dir: string): string[] => {
    const out: string[] = [];
    for (const e of readdirSync(dir)) {
      const p = `${dir}/${e}`;
      if (statSync(p).isDirectory()) out.push(...listFiles(p));
      else if (/\.(ts|tsx)$/.test(p) && !p.endsWith("database.types.ts")) out.push(p);
    }
    return out;
  };
  const files = [...listFiles("app"), ...listFiles("components"), ...listFiles("lib")];

  /* This test was wrong in a way worth recording, because it shipped a live
   * regression. It asked whether a privileged client existed anywhere in the
   * FILE and skipped the whole file if so — and `app/profile/[id]/page.tsx` has
   * an admin client two hundred lines below a select that used the caller's own
   * session. So after 0191 revoked the private columns, every member profile
   * page 404'd, and this test stayed green.
   *
   * A file-level test cannot answer a statement-level question. It now captures
   * the client identifier of each `.from("profiles")` chain and judges THAT. */
  it("private columns are read from `profiles` only by the client making that call", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      const re = /(\w+)\s*\n?\s*\.from\(\s*"profiles"\s*\)([\s\S]{0,700}?);/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        const [, client, chain] = m;
        // No `s` flag: this project targets below es2018 and `\n?` already
        // covers the only newline that appears here.
        const sel = /\.select\(\s*\n?\s*"([^"]*)"/.exec(chain);
        if (!sel) continue;
        const bad = sel[1].split(",").map((c) => c.trim()).filter((c) => PRIVATE.includes(c) || c === "*");
        if (!bad.length) continue;
        if (/admin|privileged|service/i.test(client)) continue;
        const line = src.slice(0, m.index).split("\n").length;
        offenders.push(`${f}:${line} via ${client}: ${bad.join(", ")}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the public projection in SQL and the type stay in step", () => {
    const sql = readFileSync("supabase/migrations/0191_profile_private_boundary.sql", "utf8");
    // every column granted on the base table must appear in profiles_public,
    // and vice versa — a grant without a projection is an accident waiting.
    const granted = (sql.match(/grant select \(([\s\S]*?)\) on public\.profiles to authenticated/) ?? [])[1] ?? "";
    const grantedCols = granted.split(",").map((c) => c.trim()).filter(Boolean).sort();
    expect(grantedCols.length).toBeGreaterThan(20);
    for (const c of PRIVATE) expect(grantedCols).not.toContain(c);
  });
});

/* ── KCDX-054: the privilege layer ───────────────────────────────────────────
 * Two ratchets. The grandfather list may shrink and must never grow — that is
 * the only mechanism keeping 88 raw admin imports from becoming 89. And the
 * audit write must not go back to being a floating promise, which is the
 * durability bug this finding is about.
 */
describe("KCDX-054 privilege layer", () => {
  it("the admin grandfather list never grows", () => {
    const src = readFileSync("eslint-admin-grandfather.mjs", "utf8");
    const entries = src.match(/"[^"]+"/g) ?? [];
    // Ratchet: lower this number when files migrate. Never raise it. A new file
    // needing the raw client is a design decision, not a list edit.
    expect(entries.length).toBeLessThanOrEqual(87);
  });

  // Comments in this file quote the old pattern in order to explain it, so a
  // naive match flags the documentation rather than the code. Strip comments
  // first — a tripwire that fires on its own explanation is a tripwire people
  // learn to disable.
  const codeOnly = (path: string) =>
    readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("the audit write is not fire-and-forget", () => {
    const src = codeOnly("lib/privileged/index.ts");
    // The original bug: `void (async () => { ...insert... })()`. On serverless
    // the invocation can be reclaimed before that settles.
    expect(src).not.toMatch(/void\s*\(async\s*\(\)\s*=>/);
    expect(src).toContain("after(");
  });

  it("audit failures are logged rather than swallowed", () => {
    const src = codeOnly("lib/privileged/index.ts");
    expect(src).toContain("AUDIT WRITE FAILED");
    // an empty catch block is how the previous version lost them
    expect(src).not.toMatch(/catch\s*\{\s*\}/);
  });
});

/* ── KCDX-068: nothing reaches error_logs unscrubbed ─────────────────────────
 * Six writers were found and fixed. The seventh is the problem — a new route
 * that inserts a raw browser-supplied string is one PR away, and it would look
 * completely reasonable in review. */
describe("KCDX-068 log scrubbing", () => {
  it("every error_logs writer goes through the scrubber", () => {
    const listFiles = (dir: string): string[] => {
      const out: string[] = [];
      for (const e of readdirSync(dir)) {
        const p = `${dir}/${e}`;
        if (statSync(p).isDirectory()) out.push(...listFiles(p));
        else if (/\.(ts|tsx)$/.test(p)) out.push(p);
      }
      return out;
    };
    const files = [...listFiles("app"), ...listFiles("lib"), "instrumentation.ts"];
    const offenders = files.filter((f) => {
      const src = readFileSync(f, "utf8");
      const inserts = /\.from\(\s*"error_logs"\s*\)[\s\S]{0,80}?\.insert\(/.test(src);
      return inserts && !src.includes("scrubLogRow");
    });
    expect(offenders).toEqual([]);
  });
});

/* ── KCDX-056: no outbound call without a deadline ───────────────────────────
 * A third-party fetch with no timeout does not fail on a serverless platform —
 * it holds the invocation until the platform kills it, and a slow vendor becomes
 * an outage of something unrelated. Every outbound call must go through
 * callExternal (which requires a timeout) or carry its own AbortSignal. */
describe("KCDX-056 outbound calls", () => {
  it("no third-party fetch is issued without a deadline", () => {
    const listFiles = (dir: string): string[] => {
      const out: string[] = [];
      for (const e of readdirSync(dir)) {
        const p = `${dir}/${e}`;
        if (statSync(p).isDirectory()) out.push(...listFiles(p));
        else if (/\.(ts|tsx)$/.test(p) && !p.endsWith(".test.ts")) out.push(p);
      }
      return out;
    };
    const offenders: string[] = [];
    for (const f of [...listFiles("app"), ...listFiles("lib")]) {
      const src = readFileSync(f, "utf8");
      // absolute-URL fetches only: same-origin `/api/...` calls are ours.
      // The span is found by paren depth, not by a lazy regex — a lazy match
      // stops at the first `)`, which for a multi-line fetch is inside the
      // options object, so it never sees the `signal` further down and reports
      // every wrapped call as an offender. (Learned the hard way.)
      const re = /fetch\(\s*[`"']https?:\/\//g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        let i = m.index + "fetch(".length;
        let depth = 1;
        while (depth > 0 && i < src.length) {
          if (src[i] === "(") depth++;
          else if (src[i] === ")") depth--;
          i++;
        }
        const call = src.slice(m.index, i);
        if (!/signal/.test(call)) {
          const line = src.slice(0, m.index).split("\n").length;
          offenders.push(`${f}:${line}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

/* ── KCDX-047: format_config changes only via the patch API ──────────────────
 * 0179 built the locking merge and two call sites used it while a dozen
 * read-spread-write siblings stayed. That is how a lost-update fix ends up not
 * fixing anything: the easy path is still the broken one. This makes the broken
 * path fail the build. */
describe("KCDX-047 tournament config patches", () => {
  it("nothing writes format_config outside merge_format_config", () => {
    const listFiles = (dir: string): string[] => {
      const out: string[] = [];
      for (const e of readdirSync(dir)) {
        const p = `${dir}/${e}`;
        if (statSync(p).isDirectory()) out.push(...listFiles(p));
        else if (/\.(ts|tsx)$/.test(p) && !p.endsWith(".test.ts")) out.push(p);
      }
      return out;
    };
    const offenders: string[] = [];
    for (const f of [...listFiles("app"), ...listFiles("lib")]) {
      const src = readFileSync(f, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
      // an UPDATE naming format_config is the write we are banning; reads are fine.
      // `[^}\n]` not `[^}]`: an unbounded span crosses statement boundaries and
      // matches an innocent `.update({...})` that merely has a `format_config`
      // somewhere below it — three false positives before this was tightened.
      const re = /\.update\(\s*\{[^}\n]*\bformat_config\b/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        offenders.push(`${f}:${src.slice(0, m.index).split("\n").length}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
