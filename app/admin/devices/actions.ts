"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { getPrivilegedClient } from "@/lib/privileged";

export type MetricKey = "registered" | "standalone" | "events" | "instances" | "playing";

export type FleetMetrics = {
  registered_queues: number;
  standalone_queues: number;
  event_queues: number;
  live_instances: number;
  running_live_play: number;
};

export type FleetRow = {
  session_id: string;
  title: string | null;
  code: string | null;
  source: string;
  status: string;
  created_at: string;
  live_devices: number;
  waiting_teams: number;
  live_matches: number;
  last_device_at: string | null;
};

/** Live counters for the fleet console. Called on an interval by the client, so
 *  it stays a single cheap query — no roster, no per-device rows. */
export async function fetchFleetMetrics(): Promise<FleetMetrics | null> {
  await requireAdmin("support");
  const admin = getPrivilegedClient({ reason: "admin:fleet-metrics" });
  const { data } = await admin.rpc("fleet_metrics");
  return (data?.[0] as FleetMetrics) ?? null;
}

/** The sessions behind one counter — fetched only when an operator opens it,
 *  so the common case (watching the numbers) never pays for the list. */
export async function fetchFleetDetail(metric: MetricKey): Promise<FleetRow[]> {
  await requireAdmin("support");
  const admin = getPrivilegedClient({ reason: `admin:fleet-detail:${metric}` });
  const { data } = await admin.rpc("fleet_metric_detail", { p_metric: metric });
  return (data ?? []) as FleetRow[];
}

/** Force-end a stuck or frozen session so the organizer can start a clean one.
 *  Ends play, expires pending requests, and revokes attached displays so a
 *  zombie client stops reporting presence. Audit-logged in the RPC. */
export async function forceEndSession(sessionId: string): Promise<{ ok: boolean }> {
  const { userId } = await requireAdmin("support");
  const admin = getPrivilegedClient({
    reason: "admin:force-end-session",
    actorId: userId,
    targetRef: sessionId,
  });
  const { data, error } = await admin.rpc("admin_force_end_session", {
    p_session_id: sessionId,
    p_actor: userId,
  });
  if (error) {
    console.error("[admin] force end failed", error.message);
    return { ok: false };
  }
  revalidatePath("/admin/devices");
  return { ok: data === true };
}
