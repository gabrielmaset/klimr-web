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
  // KCDX-001: the profile boundary is a GRANT, and grants are exactly the thing
  // that drifts — one `grant select on public.profiles to authenticated` pasted
  // to fix a 42501 reopens twelve columns to every member, silently. The deploy
  // should not survive that.
  const { data: intact, error: bErr } = await admin.rpc("profile_boundary_intact");
  if (!bErr && intact === false) {
    const msg =
      "[schema] PROFILE BOUNDARY OPEN: members can read private profile columns — " +
      "a table-level SELECT grant on public.profiles has been restored. See migration 0191.";
    console.error(msg);
    if (process.env.NODE_ENV === "production") throw new Error(msg);
  } else if (bErr && !MISSING_FUNCTION.test(bErr.message)) {
    console.warn(`[schema] profile boundary probe inconclusive (${bErr.message}) — continuing.`);
  }

  // KCDX-002/007/008: same reasoning as the profile boundary — a restored grant
  // or a table put back on the Realtime publication reopens live presence to
  // anyone with the anon key, and nothing about the app would look wrong.
  const { data: qOk, error: qErr } = await admin.rpc("queue_boundary_intact");
  if (!qErr && qOk === false) {
    const msg =
      "[schema] QUEUE BOUNDARY OPEN: queue tables or session credentials are readable by anon/authenticated, " +
      "or presence is being streamed again. See migration 0192.";
    console.error(msg);
    if (process.env.NODE_ENV === "production") throw new Error(msg);
  } else if (qErr && !MISSING_FUNCTION.test(qErr.message)) {
    console.warn(`[schema] queue boundary probe inconclusive (${qErr.message}) — continuing.`);
  }

  const { data: tOk, error: tErr } = await admin.rpc("tournament_boundary_intact");
  if (!tErr && tOk === false) {
    const msg =
      "[schema] TOURNAMENT BOUNDARY OPEN: members can write registrations, rosters or payments directly — " +
      "the transactional commands are being bypassed. See migration 0193.";
    console.error(msg);
    if (process.env.NODE_ENV === "production") throw new Error(msg);
  } else if (tErr && !MISSING_FUNCTION.test(tErr.message)) {
    console.warn(`[schema] tournament boundary probe inconclusive (${tErr.message}) — continuing.`);
  }

  // KCDX-005: the re-moderation triggers. A trigger is easy to drop and
  // impossible to notice missing — the app looks identical either way, and the
  // only symptom is that edited content quietly keeps its approval.
  const { data: mOk, error: mErr } = await admin.rpc("moderation_reentry_intact");
  if (!mErr && mOk === false) {
    const msg =
      "[schema] MODERATION RE-ENTRY MISSING: an approved post can be edited without returning to review. " +
      "See migration 0194.";
    console.error(msg);
    if (process.env.NODE_ENV === "production") throw new Error(msg);
  } else if (mErr && !MISSING_FUNCTION.test(mErr.message)) {
    console.warn(`[schema] moderation re-entry probe inconclusive (${mErr.message}) — continuing.`);
  }

  // KCDX-006: video stays disabled at the boundary, not in the interface. If the
  // trigger is dropped or the video MIME types return to the bucket without the
  // safety gate shipping, the deploy should stop rather than quietly accept
  // unscreened moving images.
  const { data: vOk, error: vErr } = await admin.rpc("video_disabled_intact");
  if (!vErr && vOk === false) {
    const msg =
      "[schema] VIDEO CONTAINMENT BROKEN: posts_reject_video is missing or feed-media accepts video again, " +
      "and no media safety gate has shipped. See migration 0195.";
    console.error(msg);
    if (process.env.NODE_ENV === "production") throw new Error(msg);
  } else if (vErr && !MISSING_FUNCTION.test(vErr.message)) {
    console.warn(`[schema] video containment probe inconclusive (${vErr.message}) — continuing.`);
  }

  // KCDX-016: privilege hygiene. TRUNCATE in particular is not constrained by
  // RLS at all, so a member role holding it is a privilege no policy can undo.
  const { data: gOk, error: gErr } = await admin.rpc("grant_hygiene_intact");
  if (!gErr && gOk === false) {
    const msg =
      "[schema] GRANT HYGIENE BROKEN: a member role holds TRUNCATE/REFERENCES/TRIGGER, or anon can read " +
      "beyond the deliberately public tables. See migration 0196.";
    console.error(msg);
    if (process.env.NODE_ENV === "production") throw new Error(msg);
  } else if (gErr && !MISSING_FUNCTION.test(gErr.message)) {
    console.warn(`[schema] grant hygiene probe inconclusive (${gErr.message}) — continuing.`);
  }

  if (data && data.length > 0) {
    const msg =
      `[schema] STALE DATABASE: ${data.length} required object(s) missing or ungranted — ${data.join("; ")}. ` +
      `Apply pending migrations per docs/MIGRATIONS_LEDGER.md before deploying this build.`;
    console.error(msg);
    if (process.env.NODE_ENV === "production") throw new Error(msg);
  }
}
