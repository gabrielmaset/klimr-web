import { createAdminClient } from "@/lib/supabase/admin";

/** Startup schema assertion (Aug 2026, audit QUEUE-002/DEP-001).
 *
 *  Replaces the silent drop-and-retry shims that used to hide a stale
 *  database behind degraded behavior. One cheap probe (`limit 0`, no rows)
 *  selects sentinel columns from recent migrations; if Postgres reports an
 *  unknown column, the deploy is running against a database that is missing
 *  migrations and we fail LOUDLY with a pointer to the ledger. Transient
 *  network errors do NOT block boot (availability doctrine): only a
 *  confirmed missing-column error is fatal.
 *
 *  Two layers, because they catch different failures:
 *
 *  1. Column sentinels (below) — a missing `add column`. Cheap, no DB objects
 *     required, works even if the manifest function itself is absent.
 *  2. `schema_manifest_missing()` (migration 0190) — the tables, functions and
 *     `service_role` EXECUTE grants the deployed code needs. Migrations
 *     0176-0189 added almost no columns; they added functions and grants, and
 *     the one real incident of this class (0183 revoking EXECUTE on the app's
 *     own functions) was invisible to a column probe. The catalog check has to
 *     run where the catalog is.
 *
 *  Sentinels — extend when a migration adds app-required schema:
 *    court_sessions.paused_by / activated_at / display_code   (0124/0127/0128)
 *    join_requests.offered_at                                  (0173)
 *    court_sport_intel.verifying_at                            (0175)
 *    everything from 0176-0189                                 (via 0190 manifest)
 */
const PROBES: { table: "court_sessions" | "join_requests" | "court_sport_intel"; columns: string }[] = [
  { table: "court_sessions", columns: "paused_by, activated_at, display_code" },
  { table: "join_requests", columns: "offered_at" },
  { table: "court_sport_intel", columns: "verifying_at" },
];

const MISSING_COLUMN = /column .* does not exist|42703|could not find/i;
const MISSING_FUNCTION = /could not find the function|does not exist|42883|PGRST202/i;

export async function assertSchemaCurrent(): Promise<void> {
  const admin = createAdminClient();
  for (const p of PROBES) {
    const { error } = await admin.from(p.table).select(p.columns).limit(0);
    if (!error) continue;
    if (MISSING_COLUMN.test(error.message)) {
      const msg =
        `[schema] STALE DATABASE: ${p.table}(${p.columns}) missing — production is behind the code. ` +
        `Apply pending migrations per docs/MIGRATIONS_LEDGER.md before deploying this build.`;
      console.error(msg);
      if (process.env.NODE_ENV === "production") throw new Error(msg);
      return;
    }
    // Anything else (network blip, transient 5xx) must not take boot down.
    console.warn(`[schema] probe on ${p.table} inconclusive (${error.message}) — continuing.`);
  }

  // Layer 2: ask the database what the deployed code is missing.
  const { data, error } = await admin.rpc("schema_manifest_missing");
  if (error) {
    if (MISSING_FUNCTION.test(error.message)) {
      const msg =
        `[schema] STALE DATABASE: schema_manifest_missing() is absent — migration 0190 has not been applied. ` +
        `Apply pending migrations per docs/MIGRATIONS_LEDGER.md before deploying this build.`;
      console.error(msg);
      if (process.env.NODE_ENV === "production") throw new Error(msg);
      return;
    }
    console.warn(`[schema] manifest probe inconclusive (${error.message}) — continuing.`);
    return;
  }
  if (data && data.length > 0) {
    const msg =
      `[schema] STALE DATABASE: ${data.length} required object(s) missing or ungranted — ${data.join("; ")}. ` +
      `Apply pending migrations per docs/MIGRATIONS_LEDGER.md before deploying this build.`;
    console.error(msg);
    if (process.env.NODE_ENV === "production") throw new Error(msg);
  }
}
