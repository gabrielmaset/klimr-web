import "server-only";
import { getPrivilegedClient } from "@/lib/privileged";
import { notifySupportAdmins } from "@/lib/support-events";

/** KRA-040 — the half that was missing: something that actually CALLS the canaries.
 *
 *  `klimr_health()` existed since 0227 and threw on every call, because it named
 *  two tables that do not exist. Nothing noticed for months for one reason —
 *  nothing called it. 0253 repaired it; repairing a detector and leaving it
 *  uncalled would have been the same defect one step along, and this remediation
 *  has already found that exact shape four times (both cron routes, the CSAM
 *  scanner, `withPrivileged`, and health itself).
 *
 *  Runs on the existing every-minute tick rather than a new schedule, for the
 *  reason the jobs worker and the storage drain are already there: KCDX-039 found
 *  both scheduled routes had never executed for their entire lives, so a new cron
 *  entry is a new thing that can be silently broken.
 *
 *  Alerts on TRANSITIONS only. A subsystem that stays unhealthy for a day would
 *  otherwise produce 1,440 identical notifications, and the first thing anyone
 *  does with that is mute the channel — which takes the next real alert with it. */
export async function runHealthWatch(): Promise<{ checked: number; failing: number; alerted: number }> {
  const admin = getPrivilegedClient({ reason: "cron:health-watch" });

  const { data, error } = await admin.rpc("record_health_snapshot");
  if (error) {
    // supabase-js does not throw. A discarded error here would mean the watcher
    // silently stopped watching — the precise failure it exists to catch.
    console.error("[health] snapshot failed", error.message);
    return { checked: 0, failing: 0, alerted: 0 };
  }

  const rows = (data ?? []) as { subsystem: string; ok: boolean; detail: string | null; transitioned: boolean }[];
  const failing = rows.filter((r) => !r.ok);
  const changed = rows.filter((r) => r.transitioned);

  // Always logged, even without a transition: a human reading the function logs
  // should be able to see the watcher ran at all.
  if (failing.length > 0) {
    console.warn("[health] failing:", failing.map((r) => `${r.subsystem} (${r.detail})`).join("; "));
  }

  let alerted = 0;
  for (const r of changed) {
    const title = r.ok ? `Recovered: ${r.subsystem}` : `Health alert: ${r.subsystem}`;
    // Recovery is announced too. When the alert was "points disagree with the
    // ledger", knowing it is fixed matters as much as knowing it broke.
    const body = r.detail ?? (r.ok ? "back to normal" : "check failed");
    try {
      await notifySupportAdmins(title, body);
      alerted += 1;
    } catch (e) {
      console.error("[health] alert dispatch failed", r.subsystem, e);
    }
  }

  return { checked: rows.length, failing: failing.length, alerted };
}
