import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getPrivilegedClient } from "@/lib/privileged";
import { clientIp } from "@/lib/ratelimit";

/** Courtside device heartbeat (K2-05, migration 0180).
 *
 *  The iPad app posts here every few minutes with its install id and telemetry
 *  so /admin/devices can show which venues are up, what build they run, and
 *  when each was last seen. Anonymous by design — the fleet has no login — so
 *  it is treated like the diagnostics endpoint: app-attested, rate limited
 *  fail-CLOSED, and it reflects nothing back to the caller.
 *
 *  The install id is an operations identifier, NOT a credential: nothing is
 *  authorized by it. A spoofed id can at worst create a bogus row an operator
 *  retires from the console. */
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const installId = String(body.installId ?? "");
  const token = String(body.token ?? "");
  if (!UUID_RE.test(installId) || token.length < 20 || token.length > 200) {
    return new NextResponse(null, { status: 204 });
  }

  // The TOKEN is the gate — not a header and not an IP budget. The old per-IP
  // limiter was both the wrong dimension (a venue's courts share one NAT'd IP,
  // so real displays throttled each other while an attacker rotating IPs was
  // unaffected) and an extra DB round trip on the hottest path. An unforgeable
  // token plus the 60-second throttle inside the SQL statement replaces it, so
  // an authenticated beat now costs ONE primary-key-targeted write.
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const battery = Number(body.batteryPct);
  const sessionId = String(body.sessionId ?? "");
  const ip = await clientIp();

  const admin = getPrivilegedClient({ reason: "courtside:heartbeat" });
  const { error } = await admin.rpc("courtside_heartbeat", {
    p_install_id: installId,
    p_token_hash: tokenHash,
    p_app_version: str(body.appVersion, 40),
    p_platform: str(body.platform, 40),
    p_network_state: str(body.networkState, 24),
    p_battery_pct: Number.isFinite(battery) ? Math.round(battery) : null,
    p_session_id: UUID_RE.test(sessionId) ? sessionId : null,
    // Truncated hash only — enough to notice a venue's connection changed,
    // never enough to reconstruct the address (K1-08 location handling).
    p_ip_hash: createHash("sha256").update(ip).digest("hex").slice(0, 12),
  });
  if (error) console.error("[courtside] heartbeat failed", error.message);

  // Always 204: a forged, revoked, or throttled beat is indistinguishable from
  // an accepted one, so the endpoint is no oracle for probing install ids.
  return new NextResponse(null, { status: 204 });
}

function str(v: unknown, max: number): string | null {
  const s = v == null ? null : String(v).slice(0, max);
  return s && s.trim().length > 0 ? s : null;
}
