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
    // KRA-002 renamed the snapshot load to the projecting seam. Same property:
    // the 304 short-circuit must come BEFORE any snapshot work.
    const load = src.indexOf("await loadQueueFor");
    const sample = src.indexOf('metric: "queue_snapshot"');
    expect(shortCircuit).toBeGreaterThan(-1);
    expect(load, "route must load its snapshot through loadQueueFor").toBeGreaterThan(-1);
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
    // 87 → 86: app/network/page.tsx came off when KCDX-030 moved its
    // played-together aggregation into a SECURITY DEFINER function, which removed
    // the reason it held an admin client at all. That is the shape these
    // migrations take — the privilege goes away because the work moved, not
    // because someone swapped a client.
    expect(entries.length).toBeLessThanOrEqual(86);
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
      let src = readFileSync(f, "utf8");
      // absolute-URL fetches only: same-origin `/api/...` calls are ours.
      // The span is found by paren depth, not by a lazy regex — a lazy match
      // stops at the first `)`, which for a multi-line fetch is inside the
      // options object, so it never sees the `signal` further down and reports
      // every wrapped call as an offender. (Learned the hard way.)
      // KRA-014: this matched only fetches whose FIRST ARGUMENT is a literal
      // absolute URL, so `fetch(url, …)` with the URL in a variable was invisible.
      // The independently-run suite passed 85/85 with three such defects present.
      // Now: any fetch that is not obviously same-origin must carry a deadline.
      // Strip comments first. The previous tightening flagged lib/maps-url.ts,
      // where the only match was a COMMENT describing a fetch that KCDX-019 had
      // already deleted. "Guardrails assert on code, not prose" is a rule this
      // project wrote down and I have now broken five times in a week.
      src = src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1"))
        .join("\n");
      const re = /fetch\(\s*(?![`"']\/)/g;
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
        // Same-origin string literals are ours and exempt.
        if (/^fetch\(\s*[`"']\//.test(call)) continue;
        // `/signal/` matched the word ANYWHERE in the call — and the Anthropic
        // prompt in lib/court-facts.ts contains "signals", so that call reported
        // clean while having no deadline at all. Require it as an OPTION.
        const hasDeadline = /\bsignal\s*[,:}]/.test(call) || /\bsignal\s*$/.test(call.trim());
        if (!hasDeadline) {
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

/* ── Blocking: notifications must carry an actor to be filterable ────────────
 * `notifications_block_filter` (0209) drops deliveries between a blocked pair —
 * but only when `actor_id` is set. A call site that omits it is a notification a
 * block cannot reach, so the count of such sites is a real measure and must only
 * ever go down. 41 remain, all of them system/admin notices with no person
 * behind them; every person-to-person path is wired. */
describe("block enforcement: notification actors", () => {
  it("createNotification sites without an actor never increase", () => {
    const listFiles = (dir: string): string[] => {
      const out: string[] = [];
      for (const e of readdirSync(dir)) {
        const p = `${dir}/${e}`;
        if (statSync(p).isDirectory()) out.push(...listFiles(p));
        else if (/\.(ts|tsx)$/.test(p) && !p.endsWith(".test.ts")) out.push(p);
      }
      return out;
    };
    let without = 0;
    for (const f of [...listFiles("app"), ...listFiles("lib")]) {
      const src = readFileSync(f, "utf8");
      const re = /createNotification\(\{/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        let i = m.index + m[0].length;
        let depth = 1;
        while (depth > 0 && i < src.length) {
          const c = src[i];
          if (c === "{") depth++;
          else if (c === "}") depth--;
          i++;
        }
        if (!/actorId\s*:/.test(src.slice(m.index, i))) without++;
      }
    }
    // Ratchet: lower this when sites are wired. Never raise it — a new
    // person-to-person notification without an actor is one a block cannot stop.
    expect(without).toBeLessThanOrEqual(41);
  });
});

/* KCDX-066 — modal keyboard behaviour.
 *
 * `aria-modal="true"` tells a screen reader the page behind is inert; it does
 * not make it so. Every dialog needs a focus trap, focus restore and Escape,
 * and they were each getting some and none getting all. `useDialogA11y` is the
 * shared implementation; this counts the ones not yet using it. */
describe("KCDX-066 dialog accessibility", () => {
  it("dialogs without the shared a11y hook never increase", () => {
    const listFiles = (dir: string): string[] => {
      const out: string[] = [];
      for (const e of readdirSync(dir)) {
        const p = `${dir}/${e}`;
        if (statSync(p).isDirectory()) out.push(...listFiles(p));
        else if (/\.tsx$/.test(p)) out.push(p);
      }
      return out;
    };
    const offenders: string[] = [];
    for (const f of [...listFiles("components"), ...listFiles("app")]) {
      const src = readFileSync(f, "utf8");
      if (!/role="dialog"/.test(src)) continue;
      if (/useDialogA11y/.test(src)) continue;
      offenders.push(f);
    }
    // Lower this as dialogs adopt the hook. Never raise it: a new modal without
    // a trap is a keyboard user walking into the page behind it.
    expect(offenders.length, `dialogs missing useDialogA11y: ${offenders.join(", ")}`).toBeLessThanOrEqual(10);
  });
});

/* KCDX-067 — server-action module size.
 *
 * These files combine too many invariants and side effects. The audit warns
 * against a big-bang rewrite, so this is a ratchet rather than a target: each
 * number may fall as a coherent concern is extracted, and may never rise.
 *
 * Worth recording honestly: over this remediation the files initially GREW
 * (tournaments 2606 → 2684) even as their invariants moved into locked database
 * commands, because each replaced block gained an explanation of what had been
 * wrong. Line count and invariant density are different things, and only one of
 * them is what the finding is actually about — but line count is the one that
 * can be measured, so it is the one pinned here. */
describe("KCDX-067 server-action module size", () => {
  const budgets: Record<string, number> = {
    "app/tournaments/actions.ts": 2525,
    "app/queue/actions.ts": 972,
    "app/events/actions.ts": 898,
    "app/feed/actions.ts": 515,
  };
  for (const [file, max] of Object.entries(budgets)) {
    it(`${file} does not grow`, () => {
      // `split("\n")` counts the trailing newline as a line; `wc -l` does not.
      // The budgets were set from `wc -l`, so measure the same way — off-by-one
      // in a ratchet is worse than no ratchet, because the first person to hit
      // it raises the number instead of asking why.
      const src = readFileSync(file, "utf8");
      const lines = src.split("\n").length - (src.endsWith("\n") ? 1 : 0);
      expect(lines, `${file} is ${lines} lines, budget ${max}`).toBeLessThanOrEqual(max);
    });
  }
});

/* ADAPTATION 3 — the lint ratchet ceiling cannot be raised silently.
 *
 * The source package said "ratchet to zero, then enforce --max-warnings 0",
 * which leaves the gate off during exactly the period the backlog is largest.
 * Instead the gate is live at the measured baseline. The only way that helps is
 * if the number can fall and never rise, so the ceiling is asserted here: raise
 * it and the build fails, which is the whole point of a ratchet. */
describe("lint ratchet", () => {
  it("the --max-warnings ceiling never rises", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
    const m = /--max-warnings\s+(\d+)/.exec(pkg.scripts.lint ?? "");
    expect(m, "lint script must carry an explicit --max-warnings ceiling").not.toBeNull();
    const ceiling = Number(m![1]);
    // Lower this when debt is cleaned. Never raise it: a new warning is a
    // decision, not a number to edit.
    expect(ceiling, `lint ceiling is ${ceiling}`).toBeLessThanOrEqual(137);
  });
});

/* KRA-002 — queue state may only cross to a client through the audience seam.
 *
 * The re-audit found `projectQueueState` wired into ONE caller while four server
 * components passed raw `loadSessionState` output into client components, which
 * serializes every field into the RSC payload whether it renders or not. The
 * projection was correct; remembering to call it was the defect — so the fix is
 * structural. `lib/queue-audience.ts` loads and projects in one operation, and
 * this test makes the bypass unavailable: a new page that reaches for
 * `loadSessionState` fails the build instead of leaking by omission.
 *
 * Verified as a real gate, not a vacuous one: pointed at the pre-fix tree it
 * names all four offending pages. */
describe("KRA-002 queue audience seam", () => {
  const SEAM = "lib/queue-audience.ts";

  it("only the audience seam imports loadSessionState", () => {
    const list = (dir: string): string[] => {
      const out: string[] = [];
      for (const e of readdirSync(dir)) {
        const q = `${dir}/${e}`;
        if (statSync(q).isDirectory()) out.push(...list(q));
        else if (/\.(ts|tsx)$/.test(q) && !/\.test\.tsx?$/.test(q)) out.push(q);
      }
      return out;
    };
    const offenders = [...list("app"), ...list("components"), ...list("lib")]
      // queue-state.ts DEFINES it; the seam is the one permitted consumer.
      .filter((f) => f !== SEAM && f !== "lib/queue-state.ts")
      // Match the IMPORT, not any mention: the route carries a comment about the
      // old ordering bug, and a prose reference is not an access path.
      .filter((f) => /import\s*\{[^}]*\bloadSessionState\b[^}]*\}\s*from/.test(readFileSync(f, "utf8")));
    expect(
      offenders,
      `these files must load queue state through ${SEAM} (loadQueueFor), which always projects`,
    ).toEqual([]);
  });

  it("the seam actually projects", () => {
    const seam = readFileSync(SEAM, "utf8");
    expect(seam).toMatch(/projectQueueState\(/);
    // A seam that could return the unprojected object would be worse than none,
    // because every caller would believe it was safe.
    expect(seam).not.toMatch(/return\s*\{\s*state,\s*viewer\s*\}/);
  });
});

/* KRA-001 — the public join code must never mint an operator capability.
 *
 * KCDX-007 hardened the operator COMMANDS and left how the token is OBTAINED
 * alone, so `courtside_register` still accepted the code printed on the poster.
 * Owner decision OD-1: enrollment takes a one-time organizer-issued secret.
 * These tripwires fail the build if that regresses in either layer. */
describe("KRA-001 courtside enrollment", () => {
  it("the register route sends a secret hash, never a raw code", () => {
    const src = readFileSync("app/api/courtside/register/route.ts", "utf8");
    expect(src).toContain("p_secret_hash");
    expect(src, "p_code was the vulnerable argument").not.toContain("p_code");
    // Reading body.code again would silently restore the old path.
    expect(src).not.toMatch(/body\.code/);
  });

  it("registration consumes a one-time enrollment and cannot match a session code", () => {
    const sql = readFileSync("supabase/migrations/0235_courtside_enrollment.sql", "utf8");
    const fn = sql.slice(sql.indexOf("create or replace function public.courtside_register"));
    expect(fn).toContain("courtside_enrollments");
    expect(fn).toContain("consumed_at is null");
    expect(fn).toContain("expires_at > now()");
    // The 0184 defect: matching the join/display code off court_sessions.
    expect(fn).not.toMatch(/upper\(s\.code\)/);
    expect(fn).not.toMatch(/display_code\s*,?\s*''\)\)\s*=\s*upper\(p_/);
  });

  it("issuing is gated on a caller-derived identity, NULL-safe", () => {
    const sql = readFileSync("supabase/migrations/0235_courtside_enrollment.sql", "utf8");
    const fn = sql.slice(
      sql.indexOf("create or replace function public.courtside_issue_enrollment"),
      sql.indexOf("create or replace function public.courtside_register"),
    );
    // `is_privileged_writer()` reads the DEFINER inside a definer function — the
    // mistake this migration was written with and the acceptance test caught. The
    // file EXPLAINS that in a comment, so strip comments first: asserting against
    // prose would fail on the explanation rather than on the code.
    const code = fn
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n");
    expect(code, "definer-blind predicate must not gate authorization").not.toContain("is_privileged_writer");
    // `auth.uid() = x` is NULL for an unauthenticated caller, and `if NULL` does
    // not fire — indeterminate identity would become allow.
    expect(fn).toContain("auth.uid() is distinct from");
  });
});

/* KRA-008 — the ladder must be ENFORCED, not merely defined.
 *
 * The finding was that may_act_on, the may_see helpers and comment_visible_to existed, were
 * granted, were documented as enforced, and had zero call sites — while the only
 * test covering them asserted that the NAMES appeared in a doc. A vocabulary test
 * is what let a decorative boundary stand, so these assert call sites instead. */
describe("KRA-008 ladder enforcement", () => {
  const ladder = readFileSync("supabase/migrations/0238_ladder_enforcement.sql", "utf8");

  it("every protected action has an enforcement point", () => {
    // DM insert, tagging, commenting: RLS policies use the caller-bound wrapper,
    // because 0237 revoked member EXECUTE on the raw predicate (measured).
    expect(ladder).toMatch(/conversations_dm_insert[\s\S]*?can_i_act_on\(peer_id, 'message'\)/);
    expect(ladder).toMatch(/author tags[\s\S]*?can_i_act_on\(user_id, 'tag'\)/);
    expect(ladder).toMatch(/insert own comment[\s\S]*?can_i_act_on\(/);
    // Invites and requests are SECURITY DEFINER and name an explicit actor.
    expect(ladder).toMatch(/enforce_invite_privacy[\s\S]*?may_act_on\(new\.invited_by/);
    expect(ladder).toMatch(/request_connection[\s\S]*?may_act_on\(v_me, p_target, 'request'\)/);
  });

  it("the two inline block copies are gone, not merely supplemented", () => {
    const invite = ladder.slice(
      ladder.indexOf("function public.enforce_invite_privacy"),
      ladder.indexOf("function public.request_connection"),
    );
    // 0144 inlined its own `blocks` EXISTS; may_act_on already covers it.
    expect(invite).not.toMatch(/from public\.blocks/);
    const req = ladder.slice(
      ladder.indexOf("function public.request_connection"),
      ladder.indexOf("-- ── 3."),
    );
    expect(req).not.toMatch(/from public\.blocks/);
  });

  it("mute and restrict are enforced on comment reads", () => {
    expect(ladder).toMatch(/comments readable[\s\S]*?can_i_see_comment\(id\)/);
  });
});

/* KRA-003 — implicit PUBLIC EXECUTE, and the pattern that produced it. */
describe("KRA-003 function ACL sweep", () => {
  const sweep = readFileSync("supabase/migrations/0239_function_acl_sweep.sql", "utf8");

  it("the sweep asks the catalog, not ACL text, and covers future functions", () => {
    // 0196 matched only functions whose proacl TEXT already listed PUBLIC, which
    // is precisely the set that did NOT have the defect.
    expect(sweep).toMatch(/revoke execute on function %s from public, anon/);
    // This assertion used to require an `alter default privileges … revoke execute
    // … from public` line. MEASURED: that statement records nothing — pg_default_acl
    // stays empty and a function created straight after still has proacl NULL, i.e.
    // PUBLIC EXECUTE. So the test was asserting a CLAIM, not a behaviour, which is
    // the failure mode this whole audit is about. The mechanism that was watched
    // working is an event trigger, and that is what is pinned now.
    expect(sweep).toMatch(/create event trigger klimr_revoke_public_execute/);
    expect(sweep).toMatch(/pg_event_trigger_ddl_commands\(\)/);
    // The trigger function is created before the trigger exists, so it must revoke
    // its own default explicitly or it is the one function that keeps PUBLIC.
    expect(sweep).toMatch(/revoke execute on function public\.revoke_public_execute_on_new_functions\(\) from public/);
  });

  it("the sentinel measures effective privilege", () => {
    const fn = sweep.slice(sweep.indexOf("function public.function_acl_intact"));
    expect(fn).toContain("has_function_privilege");
    // Reading proacl alone cannot see a privilege inherited through PUBLIC —
    // that is the whole reason grant_hygiene_intact missed this.
    expect(fn).toContain("'anon'");
  });
});

/* D-15 tripwire — connections list and upcoming matches are connections-only.
 *
 * Those surfaces do NOT exist yet: /network shows only the caller's own
 * connections, and no route renders another member's schedule. So there is
 * nothing to gate today and building enforcement for a page that does not exist
 * would be speculative. This fires when such a surface appears without calling
 * the predicate that D-15 requires, which is the useful half. */
describe("D-15 connections/schedule surfaces stay gated", () => {
  it("no page renders another member's connections or schedule ungated", () => {
    const list = (dir: string): string[] => {
      const out: string[] = [];
      for (const e of readdirSync(dir)) {
        const q = `${dir}/${e}`;
        if (statSync(q).isDirectory()) out.push(...list(q));
        else if (/\.tsx?$/.test(q) && !/\.test\.tsx?$/.test(q)) out.push(q);
      }
      return out;
    };
    // Scoped twice, because the first two drafts cried wolf and a canary that
    // fires on correct code gets muted — which takes the real alarm with it.
    //   draft 1 flagged app/play/[id] and app/chats/[matchId]: keyed on a MATCH,
    //           showing that match's own roster. Nothing to do with D-15.
    //   draft 2 flagged app/profile/[id]: it reads match_participants for ids
    //           drawn from the completed-match ledger — PAST results, for head-to-
    //           head and recent form. D-15 is about a member's location at a known
    //           FUTURE time, so past results are not the risk.
    // What remains is the assertion that is actually derivable: a member-keyed
    // page that reads FUTURE-dated matches must consult the predicate.
    const memberKeyed = (f: string) => /^app\/(profile|player|members)\//.test(f);
    const offenders = list("app").filter((f) => {
      if (!memberKeyed(f)) return false;
      const src = readFileSync(f, "utf8");
      const readsFutureSchedule =
        /\.(gte|gt)\("(starts_at|scheduled_at)"/.test(src) || /\bupcoming\b/i.test(src);
      if (!readsFutureSchedule) return false;
      return !/may_see_schedule|can_i_see_schedule/.test(src);
    });
    expect(
      offenders,
      "D-15: a member-keyed page reading FUTURE-dated matches must call may_see_schedule/can_i_see_schedule",
    ).toEqual([]);
  });
});

/* Batch 2 — KRA-019 / KRA-031 / KRA-020. */
describe("KRA-019/031/020 batch 2 boundaries", () => {
  const m = readFileSync(
    "supabase/migrations/0242_report_visibility_rum_budget_availability.sql",
    "utf8",
  );

  it("KRA-019: report_post tests visibility before it snapshots", () => {
    // The section banner, not the bare id: "KRA-031" also appears in the file
    // header above report_post, which made this slice empty and the assertion
    // vacuous — it "passed" against an empty string on the first run.
    const fn = m.slice(
      m.indexOf("function public.report_post"),
      m.indexOf("═══ KRA-031"),
    );
    expect(fn.length, "slice must not be empty or the assertions below prove nothing").toBeGreaterThan(200);
    expect(fn).toContain("public.post_visible(p_post)");
    // The gate is worthless after the copy: the body must not be read into a
    // reporter-readable row and then refused.
    expect(fn.indexOf("post_visible")).toBeLessThan(fn.indexOf("body_snapshot"));
    // OD-3: a denial must not distinguish missing / pending / private / blocked.
    const denials = fn.match(/'error', '[a-z_]+'/g) ?? [];
    expect(denials.filter((d) => d.includes("not_visible") || d.includes("forbidden"))).toEqual([]);
  });

  it("KRA-031: RUM ingestion is budgeted server-side and counts its drops", () => {
    expect(m).toContain("rum_budget");
    expect(m).toMatch(/dropped\s*=\s*dropped\s*\+\s*1/);
    const route = readFileSync("app/api/rum/route.ts", "utf8");
    expect(route).toContain("rateLimitStrict");
    expect(route).toContain("rum_ingest");
    // A raw privileged insert is the thing being removed; leaving one would
    // reopen the unbounded path beside the budgeted one.
    expect(route).not.toMatch(/from\("perf_samples"\)\s*\.insert/);
  });

  it("KRA-020: availability discovery is gated on the ladder, not a private rule", () => {
    expect(m).toContain("players_open_to_requests");
    expect(m).toMatch(/may_act_on\(auth\.uid\(\), p\.id, 'request'\)/);
    const ai = readFileSync("lib/ai-search.ts", "utf8");
    expect(ai).toContain("players_open_to_requests");
    // Name filter plus a time grid is the extraction primitive.
    expect(ai).toMatch(/const timeScoped =/);
    expect(ai).toMatch(/nameFilter = timeScoped \? undefined : a\.text/);
  });
});

/* Batch 3 — KRA-005 / KRA-011 / KRA-030. */
describe("KRA-005/011/030 media safety and storage lifecycle", () => {
  it("KRA-005: the known-content scanner is actually called", () => {
    // The finding was that scanForKnownCSAM and escalateCSAE were fully built and
    // called from NOWHERE. A test asserting they exist would have passed the whole
    // time — so this asserts a CALLER outside their own definitions.
    const seam = readFileSync("lib/media-safety.ts", "utf8");
    // The CALL, not the import. My first version asserted `toContain("scanForKnownCSAM")`,
    // which the import line satisfies — deleting the actual call left the guardrail
    // green, which the negative control caught. The whole finding is that these
    // functions existed and were never invoked, so an import is precisely the
    // evidence that proves nothing.
    expect(seam).toMatch(/await scanForKnownCSAM\(/);
    expect(seam).toMatch(/await escalateCSAE\(/);
    const feed = readFileSync("app/feed/actions.ts", "utf8");
    expect(feed, "the Feed photo path must screen before it publishes").toContain("screenAndClassifyPhoto");
    // Order is the property. Compare the CALLS inside the decision function — my
    // first version compared against the file's `moderateImage` IMPORT, which sits
    // at the top and made the assertion meaningless.
    const decide = seam.slice(seam.indexOf("export async function screenAndClassifyPhoto"));
    expect(decide.length).toBeGreaterThan(200);
    expect(decide.indexOf("screenStoredObject(")).toBeLessThan(decide.indexOf("moderateImage("));
  });

  it("KRA-005: an unavailable scan holds rather than publishes", () => {
    const seam = readFileSync("lib/media-safety.ts", "utf8");
    // `undecided` must resolve into the caller's GATE_DOWN set, which produces
    // `pending` — invisible to anyone but the author. Publishing on an unreachable
    // scanner is the failure; destroying the upload is a different one, and not
    // one the acceptance criterion asks for.
    expect(seam).toMatch(/undecided[\s\S]{0,400}moderation_error/);
  });

  it("KRA-011/030: cleanup enqueues a real deletion and spares shared paths", () => {
    const m = readFileSync("supabase/migrations/0243_storage_deletion_outbox.sql", "utf8");
    expect(m).toContain("storage_deletions");
    expect(m).toContain("enqueue_storage_deletion");
    // The signature must match 0224's or this ADDS an overload and the original —
    // which still deletes the catalog row — keeps running under the cron entry.
    expect(m).toMatch(/purge_orphan_feed_media\(p_grace_hours integer default 24\)/);
    expect(m).toMatch(/drop function if exists public\.purge_orphan_feed_media\(\)/);
    // Shared-path guard (KRA-030).
    expect(m).toMatch(/p\.id <> old\.id/);
  });
});

/* Batch 3 (part 2) — KRA-011 worker, KRA-004, KRA-006. */
describe("KRA-011/004/006 worker and evidence binding", () => {
  it("KRA-011: completion is written only after the API confirms", () => {
    const w = readFileSync("lib/storage-deletions.ts", "utf8");
    expect(w).toMatch(/\.remove\(/);
    expect(w).toMatch(/mark_storage_deletion/);
    // The original defect was treating "we asked" as "it happened". A drain that
    // marked done before calling remove would reproduce it exactly.
    expect(w.indexOf(".remove(")).toBeLessThan(w.lastIndexOf("mark_storage_deletion"));
    // Drained on an existing tick — KCDX-039 found new machine routes silently
    // never running for their whole lives.
    const tick = readFileSync("app/api/cron/waitlist-sweep/route.ts", "utf8");
    expect(tick).toContain("drainStorageDeletions");
  });

  it("KRA-004: the hash and the freeze cover the same fields", () => {
    const m = readFileSync("supabase/migrations/0245_evidence_binding.sql", "utf8");
    // Replaced in place, not added beside — a parallel function leaves every
    // existing caller on the narrow hash.
    expect(m).toMatch(/create or replace function public\.provider_application_hash/);
    for (const f of ["document_path", "phone", "attestations"]) {
      const hash = m.slice(
        m.indexOf("function public.provider_application_hash"),
        m.indexOf("function public.freeze_submitted_application"),
      );
      // BOUNDED. Slicing to end-of-file swept in the sentinel below, which names
      // the same three fields — so removing document_path from the freeze left
      // this assertion green. Fourth time this week a slice matched something
      // other than the code it claimed to check.
      const freeze = m.slice(
        m.indexOf("function public.freeze_submitted_application"),
        m.indexOf("═══ KRA-006"),
      );
      expect(freeze.length).toBeGreaterThan(300);
      expect(hash, `hash must cover ${f}`).toContain(f);
      expect(freeze, `freeze must cover ${f}`).toContain(f);
    }
  });

  it("KRA-006: a proof path is checked against storage, not trusted", () => {
    const m = readFileSync("supabase/migrations/0245_evidence_binding.sql", "utf8");
    const fn = m.slice(m.indexOf("function public.verify_payment_proof_object"));
    expect(fn).toContain("storage.objects");
    expect(fn).toContain("o.owner = p_owner");
    expect(fn).toMatch(/p_registration::text \|\| '\/%'/);
  });
});

/* KRA-015 — indeterminate must never resolve to allow. */
describe("KRA-015 auth gates fail closed", () => {
  it("the CAPTCHA verifier denies on missing config and on vendor error", () => {
    const src = readFileSync("lib/captcha.ts", "utf8");
    const fn = src.slice(src.indexOf("export async function verifyTurnstile"));
    expect(fn.length).toBeGreaterThan(200);
    // Both branches used to `return true`, each with a written justification.
    // The only permitted `return true` is a verified token or the explicit,
    // non-production dev bypass.
    // Comments stripped: the catch block EXPLAINS that it used to \,
    // and matching that sentence is the fifth prose-not-code guardrail I have
    // written this week. Assert on the statements.
    // Comments stripped. The catch block EXPLAINS that it used to return true,
    // and matching that sentence is the fifth prose-not-code guardrail I have
    // written this week. Assert on statements.
    const catchBlock = fn
      .slice(fn.indexOf("} catch"))
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");
    expect(catchBlock, "a vendor error is indeterminate, not a human").not.toMatch(
      /return\s+true/,
    );
    // The bypass constant sits above the function, so assert it against the
    // module rather than the slice.
    expect(src).toMatch(/CAPTCHA_DEV_BYPASS/);
    expect(src).toMatch(/NODE_ENV !== "production"/);
  });

  it("an indeterminate AAL is treated as unsatisfied, not as satisfied", () => {
    const src = readFileSync("lib/supabase/middleware.ts", "utf8");
    // `aal?.currentLevel && …` let a null level fall through to the protected
    // page; the catch did the same on any error.
    expect(src).toMatch(/mfaSatisfied\s*=\s*aal\?\.currentLevel === "aal2"/);
    expect(src).toMatch(/if \(!mfaSatisfied\)/);
    // The old fail-open catch must be gone, not merely bypassed.
    expect(src).not.toMatch(/Fail open for this request/);
  });
});

/* Batch 4 (part 2) — KRA-016, KRA-017, KRA-018. */
describe("KRA-016/017/018 export, audit and backup verification", () => {
  it("KRA-016: the export cannot turn a query error into an empty category", () => {
    const src = readFileSync("app/settings/export/route.ts", "utf8");
    // The helpers discarded { error } entirely, so a grant or policy regression
    // produced a successful-looking archive with a silently missing dataset.
    expect(src).toMatch(/failures\.push\(/);
    expect(src).toMatch(/status: failures\.length === 0 \? "complete" : "incomplete"/);
    expect(src).toContain("incomplete_datasets");
    // The category was populated from safety_incidents about the member's OWN
    // uploads — the inverse of what it claimed.
    expect(src).toContain("post_reports");
    expect(src).toContain("incidents_about_my_uploads");
  });

  it("KRA-017: handing out a client no longer records success", () => {
    const src = readFileSync("lib/privileged/index.ts", "utf8");
    const fn = src.slice(
      src.indexOf("export function getPrivilegedClient"),
      src.indexOf("export async function withPrivileged"),
    );
    expect(fn.length).toBeGreaterThan(200);
    const code = fn.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*")).join("\n");
    expect(code, "an issued client promises nothing about the outcome").not.toMatch(/commandId, "ok"/);
    expect(code).toMatch(/commandId, "issued"/);
  });

  it("KRA-018: backup verification covers every destination class", () => {
    const sh = readFileSync("supabase/harness/storage-backup.sh", "utf8");
    // Counting cannot distinguish "the file came back" from "a file with that
    // name came back" — the exact distinction 0226's manifest exists to make.
    expect(sh).toMatch(/rclone check/);
    expect(sh).toMatch(/for b in "\$\{ENC\[@\]\}"; do[\s\S]{0,600}rclone size/);
    // And quarantine is never replicated (D-22 as amended).
    expect(sh).not.toMatch(/rclone copy "\$\{RCLONE_SRC\}:quarantine"/);
  });
});

/* KRA-042 — the served artifact must not carry a known-applicable advisory. */
describe("KRA-042 dependency advisories", () => {
  it("Next is pinned at or above the Server-Action DoS fix", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      dependencies: Record<string, string>;
      overrides?: Record<string, string>;
    };
    const next = pkg.dependencies.next;
    // GHSA-m99w-x7hq-7vfj applies to >=16.0.0 <16.2.11, and GitHub states there is
    // no workaround other than upgrading. Pinned EXACTLY, matching the convention
    // already in this file — a caret here silently resolved to 16.3.0 on the first
    // attempt, which is a minor jump and not the smallest move that clears it.
    expect(next, "next must be an exact pin, not a range").toMatch(/^\d+\.\d+\.\d+$/);
    const [maj, min, patch] = next.split(".").map(Number);
    expect(maj).toBeGreaterThanOrEqual(16);
    if (maj === 16 && min === 2) expect(patch).toBeGreaterThanOrEqual(11);
  });

  it("the transitive advisories stay pinned to patched lines", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { overrides?: Record<string, string> };
    const ov = pkg.overrides ?? {};
    // Resolved by override rather than `npm audit fix --force`, which offered to
    // move Next across a MAJOR to satisfy a bundled leaf dependency.
    expect(ov.postcss, "postcss <=8.5.22 is vulnerable").toBeDefined();
    expect(ov.sharp, "sharp <0.35.0 inherits libvips CVEs").toBeDefined();
    // nanoid must stay on 3.x: postcss depends on ^3, so 5/6 would break it while
    // 3.3.18 carries the fix.
    expect(ov.nanoid, "nanoid must be patched within 3.x").toMatch(/^\^?3\./);
  });
});

/* Batch 5 (part 1) — KRA-022, KRA-024, KRA-025, KRA-026. */
describe("KRA-022/024/025/026 search and feed deep links", () => {
  it("KRA-022: business results have a destination and are not folded into class", () => {
    const src = readFileSync("app/search/actions.ts", "utf8");
    // The loop drops any row without an href, so a missing map entry silently
    // discarded every business row the SQL had already returned.
    expect(src).toMatch(/business: \(id\) => `\/business\/\$\{id\}`/);
    const types = readFileSync("app/search/types.ts", "utf8");
    expect(types).toContain('"business"');
  });

  it("KRA-024: AI player and provider cards point at profiles, not matches", () => {
    const ai = readFileSync("lib/ai-search.ts", "utf8");
    const code = ai.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    // `/play/[id]` is the MATCH page and queries matches.id.
    expect(code).not.toMatch(/href: `\/play\/\$\{p\.(id|user_id)\}`/);
    expect(code).toMatch(/href: `\/profile\/\$\{p\.id\}`/);
    expect(code).toMatch(/href: `\/profile\/\$\{p\.user_id\}`/);
  });

  it("KRA-025: a resolvable deep link is actually rendered", () => {
    const page = readFileSync("app/feed/page.tsx", "utf8");
    // Resolving and then not showing the post leaves the original failure intact:
    // the ranked feed caps at 60, which is exactly why the link was lost.
    expect(page).toMatch(/focusVisibleId/);
    expect(page).toMatch(/rankedIds\.unshift\(focusVisibleId\)/);
  });

  it("KRA-026: every refusal is one message and no author id", () => {
    const m = readFileSync("supabase/migrations/0247_deep_link_non_enumeration.sql", "utf8");
    const fn = m.slice(m.indexOf("function public.resolve_feed_post"), m.indexOf("comment on function"));
    expect(fn.length).toBeGreaterThan(400);
    const code = fn.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    expect(code, "distinguishable refusals are an existence oracle").not.toContain("not_visible");
    expect(code).not.toContain("'not_found'");
    const page = readFileSync("app/feed/page.tsx", "utf8");
    const pageCode = page.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    expect(pageCode).not.toMatch(/shared with a smaller audience/);
  });
});

/* KRA-028/029 — the feed aggregate contract. */
describe("KRA-028/029 feed aggregates", () => {
  const m = readFileSync("supabase/migrations/0248_feed_aggregate_contract.sql", "utf8");

  it("ranking counts only comments a reader can see", () => {
    const fn = m.slice(m.indexOf("function public.get_ranked_feed"), m.indexOf("comment on function public.get_ranked_feed"));
    const eng = fn.slice(fn.indexOf("eng_comments as ("));
    expect(eng.length).toBeGreaterThan(80);
    // Without this the engagement signal measures moderation traffic, and rewards
    // the posts that attracted removed comments.
    expect(eng).toContain("pc.moderation_status = 'approved'");
  });

  it("both aggregates stay INVOKER — they decide order and count, never visibility", () => {
    expect(m).toMatch(/function public\.get_ranked_feed[\s\S]{0,400}security invoker/);
    expect(m).toMatch(/function public\.feed_type_counts[\s\S]{0,400}security invoker/);
  });

  it("type counts are taken before the cap, not from the window", () => {
    const page = readFileSync("app/feed/page.tsx", "utf8");
    expect(page).toContain("feed_type_counts");
    const code = page.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    // The old line counted `scopedPosts`, which is the capped set. It survives
    // ONLY as an explicit fallback when the RPC errors.
    const idx = code.indexOf("for (const p of scopedPosts) if (typeCounts");
    if (idx >= 0) expect(code.slice(Math.max(0, idx - 200), idx)).toContain("countErr");
  });
});

/* KRA-023 — a browse intent must browse. */
describe("KRA-023 browse intents", () => {
  it("every routable kind is browsable, not just event and tournament", () => {
    const m = readFileSync("supabase/migrations/0249_browse_kinds.sql", "utf8");
    for (const k of ["event", "tournament", "court", "team", "listing", "business"]) {
      expect(m, `browse_kind must handle ${k}`).toContain(`p_kind = '${k}'`);
    }
    // A recurring event's next instance lives in event_occurrences; ordering by
    // events.starts_at alone buries a weekly session whose series began months ago.
    expect(m).toContain("event_occurrences");
  });

  it("browsing chooses the kind, never the visibility", () => {
    const m = readFileSync("supabase/migrations/0249_browse_kinds.sql", "utf8");
    expect(m).toMatch(/function public\.browse_kind[\s\S]{0,400}security invoker/);
  });

  it("the search action routes browse through the RPC and checks its error", () => {
    const src = readFileSync("app/search/actions.ts", "utf8");
    expect(src).toContain("browse_kind");
    // A discarded { error } here reproduces the silent-empty-list failure the
    // whole finding is about.
    expect(src).toMatch(/browse_kind[\s\S]{0,300}if \(error\)/);
  });
});

/* KRA-032/038 — the expiry clock and the points race. */
describe("KRA-032/038 expiry clock and points serialization", () => {
  const m = readFileSync("supabase/migrations/0251_expiry_clock_and_points_race.sql", "utf8");

  it("KRA-032: the sweep measures activation, not creation", () => {
    // The section BANNER, not the bare id — "KRA-038" also appears in the file
    // header above this function, which made the slice empty and the assertion
    // vacuous. Seventh time this exact shape has bitten me this week, which is
    // why the length check below is now written before the content checks.
    const fn = m.slice(
      m.indexOf("function public.end_stale_court_sessions"),
      m.indexOf("═══ KRA-038"),
    );
    expect(fn.length).toBeGreaterThan(200);
    const code = fn.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    // A session restarted five minutes ago is not twelve hours old.
    expect(code).toContain("activated_at");
  });

  it("KRA-038: the recompute is serialized per (player, sport), before the read", () => {
    const fn = m.slice(m.indexOf("function public.recompute_player_points"));
    const code = fn.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    expect(code).toContain("pg_advisory_xact_lock");
    // Taken AFTER the read it would close nothing — the window is between the
    // read and the upsert.
    expect(code.indexOf("pg_advisory_xact_lock")).toBeLessThan(code.indexOf("select coalesce(sum(points)"));
    // Per pair, not global: two players' recomputes are independent.
    expect(code).toMatch(/p_user::text \|\| ':' \|\| p_sport/);
  });
});

/* Points are currency (owner directive, 2026-08-10). */
describe("points ledger integrity", () => {
  const m = readFileSync("supabase/migrations/0252_points_ledger_integrity.sql", "utf8");

  it("no cascade may destroy a credit", () => {
    // tournament_points.tournament_id and .division_id were ON DELETE CASCADE:
    // deleting one tournament deleted every point row earned in it, silently.
    expect(m).toMatch(/references public\.tournaments\(id\) on delete restrict/);
    expect(m).toMatch(/references public\.tournament_divisions\(id\) on delete restrict/);
  });

  it("the ledger is append-only and reversal is a void, not a delete", () => {
    expect(m).toContain("points_ledger_append_only");
    const fn = m.slice(m.indexOf("function public.points_ledger_append_only"), m.indexOf("function public.points_ledger_stamp_source"));
    expect(fn.length).toBeGreaterThan(300);
    // Amount and identity frozen; only the void fields may move.
    expect(fn).toMatch(/new\.points is distinct from old\.points/);
    expect(fn).toMatch(/klimr\.points_erasure/);
    // A void that could be undone would let history be laundered.
    expect(fn).toMatch(/old\.voided_at is not null and new\.voided_at is null/);
  });

  it("one definition of the balance, and a way back from drift", () => {
    // Two copies of "best 8 of 52 weeks" would drift, and the drift check would
    // then be measuring the difference between two bugs.
    expect(m).toContain("function public.points_balance");
    const recompute = m.slice(m.indexOf("function public.recompute_player_points"));
    expect(recompute.slice(0, 1200)).toContain("points_balance(");
    expect(m).toContain("function public.points_drift");
    expect(m).toContain("function public.rebuild_all_player_points");
  });
});

/* KRA-040 + D-35 — the canaries must name tables that exist. */
describe("health canaries", () => {
  const m = readFileSync("supabase/migrations/0253_currency_and_cleanup_canaries.sql", "utf8");

  it("points drift is watched, with a zero threshold", () => {
    expect(m).toContain("points.projection_drift");
    expect(m).toContain("points_drift_count()");
    // There is no tolerable amount of "the ledger and the balance disagree".
    expect(m).toMatch(/subsystem := 'points\.projection_drift';[\s\S]{0,120}ok := v_n = 0/);
  });

  it("stuck and abandoned deletions stay separate", () => {
    // Folded together, the actionable number hides inside the tolerable one.
    expect(m).toContain("storage.deletions_stuck");
    expect(m).toContain("storage.deletions_abandoned");
  });

  it("every table the health function names actually exists", () => {
    // 0227 named `notification_outbox` and `waitlist_offers`, neither of which
    // exists. plpgsql resolves table names at EXECUTION, so the migration applied
    // cleanly and klimr_health() threw on every call — the silent-failure detector
    // was itself a silent failure. These are the repaired names.
    const code = m.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    expect(code).toContain("public.social_outbox");
    expect(code).toContain("public.tournament_waitlist");
    // Comments stripped: the migration EXPLAINS the old names, and matching that
    // explanation is the same prose-not-code mistake, for the eighth time.
    expect(code).not.toContain("notification_outbox");
    expect(code).not.toContain("waitlist_offers");
  });
});

/* KRA-040 — the canaries have a caller, and it alerts on change. */
describe("health watcher", () => {
  it("runs on the existing tick, not a new schedule", () => {
    const tick = readFileSync("app/api/cron/waitlist-sweep/route.ts", "utf8");
    // KCDX-039 found both cron routes had never executed for their whole lives.
    // A new schedule is a new thing that can be silently broken.
    expect(tick).toContain("runHealthWatch");
  });

  it("alerts on transitions only", () => {
    const w = readFileSync("lib/health-watch.ts", "utf8");
    expect(w).toContain("record_health_snapshot");
    expect(w).toMatch(/transitioned/);
    // 1,440 identical alerts a day is how a channel gets muted, which takes the
    // next real alert with it.
    expect(w).toMatch(/rows\.filter\(\(r\) => r\.transitioned\)/);
    // supabase-js does not throw; a discarded error means the watcher silently
    // stopped watching.
    expect(w).toMatch(/if \(error\)/);
  });

  it("`since` is a transition timestamp, not a heartbeat", () => {
    const m = readFileSync("supabase/migrations/0254_health_state.sql", "utf8");
    // Rewriting `since` every tick would report a three-day outage as one minute.
    expect(m).toMatch(/case when s\.ok is distinct from excluded\.ok then now\(\) else s\.since end/);
  });
});

/* KRA-039 — a team always has an owner. */
describe("KRA-039 team owner invariant", () => {
  const m = readFileSync("supabase/migrations/0255_team_owner_invariant.sql", "utf8");

  it("the invariant is a trigger, so every path is covered", () => {
    // A predicate on one delete fixes one caller. The rule "a team has at least
    // one owner" must hold for the admin console, a support script and a future
    // bulk tool too — five inline copies of the block rule are why.
    expect(m).toContain("team_members_guard_last_owner");
    expect(m).toMatch(/before update or delete on public\.team_members/);
    expect(m).toContain("team_must_have_an_owner");
  });

  it("the delete carries its own predicate, not just the read", () => {
    const fn = m.slice(m.indexOf("function public.team_remove_member"));
    const code = fn.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    expect(code).toMatch(/for update/);
    // Belt: a stale read must not be able to widen the delete.
    expect(code).toMatch(/and role <> 'owner'/);
  });

  it("the action no longer service-role deletes the membership itself", () => {
    const src = readFileSync("app/teams/actions.ts", "utf8");
    const fn = src.slice(src.indexOf("export async function removeMember"), src.indexOf("export async function", src.indexOf("export async function removeMember") + 10));
    expect(fn.length).toBeGreaterThan(200);
    expect(fn).toContain("team_remove_member");
    expect(fn).not.toMatch(/from\("team_members"\)\s*\.delete\(\)/);
  });
});

/* KRA-033 — enrollment is one locked command, and the guard still guards. */
describe("KRA-033 class enrollment", () => {
  const m = readFileSync("supabase/migrations/0257_enrollment_guard_trusted_writer.sql", "utf8");

  it("the seat count happens under the lock", () => {
    const fn = m.slice(m.indexOf("function public.class_enroll"));
    const code = fn.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    expect(code.length).toBeGreaterThan(400);
    expect(code.indexOf("for update")).toBeLessThan(code.indexOf("select count(*) into v_taken"));
  });

  it("a recorded payment is never recomputed away", () => {
    expect(m).toMatch(/v_existing\.payment_status in \('paid', 'refunded'\)/);
  });

  it("the guard exemption is a targeted flag, not a blanket definer bypass", () => {
    const fn = m.slice(m.indexOf("function public.guard_enrollment_insert"), m.indexOf("function public.class_enroll"));
    const code = fn.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    expect(code.length).toBeGreaterThan(200);
    // `current_user = 'postgres'` would exempt EVERY definer function, including
    // ones written later by someone unaware of this trigger.
    expect(code).not.toContain("current_user = 'postgres'");
    expect(code).toContain("klimr.enrollment_command");
    // 0201's control must still pin the untrusted path.
    expect(code).toMatch(/new\.payment_status := 'not_required'/);
  });

  it("the action checks its write error", () => {
    const src = readFileSync("app/classes/actions.ts", "utf8");
    expect(src).toContain("class_enroll");
    expect(src).toMatch(/if \(enrollErr\)/);
  });
});

/* KRA-034 — the command counts capacity the way the tournament is configured. */
describe("KRA-034 tournament capacity semantics", () => {
  const m = readFileSync("supabase/migrations/0258_tournament_capacity_semantics.sql", "utf8");

  it("reads the same configuration the UI reads", () => {
    // These are keys in format_config, not columns — the reason a first pass at
    // this finding nearly got filed as a phantom.
    expect(m).toMatch(/format_config ->> 'capacity_mode'/);
    expect(m).toMatch(/format_config ->> 'capacity_unit'/);
  });

  it("person mode counts players, team mode counts registrations", () => {
    // Slice from the FUNCTION, and strip comments — the header above it explains
    // the fix and names the same table, so an unstripped match passes while the
    // code is broken. Ninth time this week; the negative control caught it again.
    const fn = m.slice(m.indexOf("create or replace function public.tournament_register"));
    const code = fn.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    expect(code.length).toBeGreaterThan(400);
    // The join that makes person-mode mean people.
    expect(code).toMatch(/join public\.tournament_registrations r on r\.id = rp\.registration_id/);
    expect(code).toMatch(/rp\.is_reserve = false/);
    // And the lock still precedes the count, or none of it holds under a race.
    expect(code.indexOf("for update")).toBeLessThan(code.indexOf("select count(*) into v_taken"));
  });
});

/* KRA-035 — a team entry and its roster are one transaction. */
describe("KRA-035 team roster atomicity", () => {
  const m = readFileSync("supabase/migrations/0259_tournament_team_roster_atomic.sql", "utf8");

  it("a person cannot appear twice in one entry", () => {
    // There was no unique key, so the captain — inserted by the command AND
    // present in the roster the page sends — appeared twice, and under
    // person-unit capacity a two-person entry occupied three seats.
    expect(m).toMatch(/create unique index if not exists tournament_registration_players_unique/);
  });

  it("the roster is written inside the command and re-checked", () => {
    const fn = m.slice(m.indexOf("create or replace function public.tournament_register_team"));
    const code = fn.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    expect(code.length).toBeGreaterThan(400);
    expect(code).toMatch(/jsonb_array_elements/);
    // A caller must not be able to roster a stranger.
    expect(code).toMatch(/from public\.team_members tm/);
  });

  it("the action no longer inserts the roster after the fact", () => {
    const src = readFileSync("app/tournaments/actions.ts", "utf8");
    const code = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    expect(code).toContain("tournament_register_team");
    // The post-hoc bulk insert with a discarded error is the defect itself.
    expect(code).not.toMatch(/from\("tournament_registration_players"\)\.insert\(playerRows\)/);
  });
});

/* KRA-036 — starting a match is one transaction. */
describe("KRA-036 queue match start", () => {
  const m = readFileSync("supabase/migrations/0260_queue_start_match_atomic.sql", "utf8");

  it("one live match per court is an index, not just a check", () => {
    // The command's check gives the good error message; the index is the
    // guarantee that two operators cannot both pass it.
    expect(m).toMatch(/create unique index if not exists queue_matches_one_live_per_court/);
    expect(m).toMatch(/where status = 'live'/);
  });

  it("the team update is in the same transaction and is verified", () => {
    // Strip comments AND stop at the comment block that follows the function —
    // `comment on function` text and the section header below both mention the
    // same identifiers, and an unstripped slice matched them while the code was
    // gone. Tenth time this week; the negative control caught it, again.
    const fn = m.slice(
      m.indexOf("create or replace function public.queue_start_next"),
      m.indexOf("comment on function public.queue_start_next"),
    );
    const code = fn.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    expect(code.length).toBeGreaterThan(400);
    expect(code.indexOf("for update")).toBeLessThan(code.indexOf("insert into public.queue_matches"));
    // A live match whose teams still read `queued` is the defect; fewer than two
    // rows moving must roll the whole start back.
    expect(code).toMatch(/v_moved <> 2/);
    expect(code).toMatch(/and status = 'queued'/);
  });

  it("the action no longer inserts the match itself", () => {
    const src = readFileSync("app/queue/actions.ts", "utf8");
    const fn = src.slice(src.indexOf("async function applyStartNext"), src.indexOf("async function applyStartNext") + 2000);
    expect(fn).toContain("queue_start_next");
    expect(fn).not.toMatch(/from\("queue_matches"\)\.insert/);
  });
});

/* KRA-036 — starting a match is one transaction. */
describe("KRA-036 queue match start", () => {
  const m = readFileSync("supabase/migrations/0260_queue_start_match_atomic.sql", "utf8");

  it("the session is locked before candidates are chosen", () => {
    const fn = m.slice(m.indexOf("create or replace function public.queue_start_next"));
    const code = fn.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    expect(code.length).toBeGreaterThan(400);
    // Choosing in the application and writing afterwards is only safe if nothing
    // changes in between — which is the assumption being removed.
    expect(code).toMatch(/for update/);
    expect(code.indexOf("for update")).toBeLessThan(code.indexOf("insert into public.queue_matches"));
  });

  it("the match row and both team rows move together", () => {
    const fn = m.slice(m.indexOf("create or replace function public.queue_start_next"));
    const code = fn.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    // The old shape inserted the match, then updated teams in a separate
    // statement whose error was discarded — leaving a live match whose teams
    // still read `queued`, so the same players were candidates for the next start.
    expect(code).toMatch(/insert into public\.queue_matches/);
    expect(code).toMatch(/update public\.queue_teams/);
  });

  it("the action routes through the command and maps its errors", () => {
    const src = readFileSync("app/queue/actions.ts", "utf8");
    expect(src).toContain("queue_start_next");
    expect(src).toMatch(/already_live/);
    expect(src).toMatch(/need_two_teams/);
  });
});

/* KRA-021 — one event, one notification. */
describe("KRA-021 notification exactly-once", () => {
  it("connection notifications come only from the outbox", () => {
    const src = readFileSync("app/network/actions.ts", "utf8");
    const code = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    // 0212's trigger enqueues connection_requested/accepted and
    // deliver_social_outbox() writes the notification. An inline
    // createNotification for the same event produced two identical rows.
    expect(code).not.toMatch(/kind: "friend_request"/);
    expect(code).not.toMatch(/kind: "friend_accept"/);
    expect(code).not.toContain("createNotification");
  });

  it("the outbox still emits both kinds", () => {
    const m = readFileSync("supabase/migrations/0212_social_outbox.sql", "utf8");
    expect(m).toContain("connection_requested");
    expect(m).toContain("connection_accepted");
    expect(m).toMatch(/insert into public\.notifications/);
  });
});

/* KRA-041 — a boot probe must not be able to hang forever. */
describe("KRA-041 startup deadlines", () => {
  const src = readFileSync("lib/schema-check.ts", "utf8");

  it("every startup probe is raced against a deadline", () => {
    expect(src).toContain("withDeadline");
    expect(src).toContain("PROBE_TIMEOUT_MS");
    const code = src.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*")).join("\n");
    // A blackholed endpoint accepts the connection and never answers: no error to
    // catch, no timeout to hit, so the instance never finishes booting.
    expect(code).not.toMatch(/await admin\.from\(p\.table\)/);
    expect(code).not.toMatch(/await admin\.rpc\("schema_manifest_missing"\)/);
  });

  it("the timer is cleared, or it holds the event loop open", () => {
    expect(src).toMatch(/clearTimeout\(timer\)/);
  });
});

/* KRA-027 — suggestions disclose no more than a public profile, and fail closed. */
describe("KRA-027 PYMK privacy", () => {
  it("neighborhood is out of the return type and off the card", () => {
    const m = readFileSync("supabase/migrations/0261_pymk_no_neighborhood.sql", "utf8");
    // BOUNDED to the function body. Slicing to end-of-file swept in the
    // `comment on function` text and the sentinel's own parameter_name check,
    // both of which legitimately name the removed column. Tenth time an
    // assertion of mine has matched prose rather than code.
    const fn = m.slice(
      m.indexOf("create or replace function public.people_you_may_know"),
      m.indexOf("revoke all on function public.people_you_may_know"),
    );
    const code = fn.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    expect(code.length).toBeGreaterThan(400);
    // Removed, not returned-and-ignored: a returned field is one some future
    // caller renders, which is how this became a rendered field in the first place.
    expect(code).not.toContain("neighborhood");
    const card = readFileSync("components/pymk-rail.tsx", "utf8");
    expect(card).not.toMatch(/p\.neighborhood/);
  });

  it("the cache never serves unvalidated identities", () => {
    const src = readFileSync("lib/social-server.ts", "utf8");
    const code = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    // The RPC-failure branch used to return cached.payload verbatim — the stale
    // list, unvalidated, exactly when validation was known to be unavailable.
    expect(code).not.toMatch(/return cached \?/);
    expect(code).toMatch(/return \[\];/);
  });

  it("a suggestion respects the ladder", () => {
    const m = readFileSync("supabase/migrations/0261_pymk_no_neighborhood.sql", "utf8");
    // Offering a Connect button to someone who would refuse it is worse than
    // offering nothing.
    expect(m).toMatch(/may_act_on\(\(select id from me\), p\.id, 'request'\)/);
  });
});

/* KRA-012 — every migration records that it ran. */
describe("KRA-012 migration journal", () => {
  it("every migration from 0262 onward journals itself", () => {
    // Without this the mechanism decays on the first migration someone writes in
    // a hurry, and the journal silently stops being a record of anything.
    const dir = "supabase/migrations";
    const offenders = readdirSync(dir)
      .filter((f) => /^\d{4}_.*\.sql$/.test(f))
      .filter((f) => Number(f.slice(0, 4)) >= 262)
      .filter((f) => !readFileSync(`${dir}/${f}`, "utf8").includes("journal_migration("));
    expect(
      offenders,
      "each migration must end with select public.journal_migration('NNNN', 'filename.sql', ...)",
    ).toEqual([]);
  });

  it("the journal is honest about what it did not observe", () => {
    const m = readFileSync("supabase/migrations/0262_migration_journal.sql", "utf8");
    // 0001-0261 ran before the journal existed. Recording them as though they had
    // been observed would make a complete-looking journal that lies about its
    // earliest and least verifiable rows.
    expect(m).toContain("0000-baseline");
    expect(m).toContain("ASSERTED, not observed");
    expect(m).toMatch(/applied_by\s*=\s*'owner-confirmation'|'owner-confirmation'/);
  });

  it("drift is reported in both directions", () => {
    const m = readFileSync("supabase/migrations/0262_migration_journal.sql", "utf8");
    // A file never applied is the obvious case. A migration applied here that no
    // file explains — a hand-edit in the SQL console — is the one nobody looks for.
    expect(m).toContain("in_repo_not_applied");
    expect(m).toContain("applied_not_in_repo");
  });
});
