import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientIp, rateLimitStrict } from "@/lib/ratelimit";
import { createHash } from "node:crypto";
import { scrubLogRow } from "@/lib/log-scrub";

export const dynamic = "force-dynamic";

/** Error ingestion for the Courtside iPad app → Admin → Diagnostics.
 *  The device is anonymous by design, so the endpoint is defensive rather than
 *  authenticated: app marker header, strict clamps, level whitelist, rows
 *  tagged "[Courtside]" + url app://courtside so the admin page can filter app
 *  reports from website ones. Nothing is reflected back to the caller. */
export async function POST(req: Request) {
  if (!(req.headers.get("x-klimr-app") ?? "").startsWith("KlimrCourtside")) {
    return new NextResponse(null, { status: 204 });
  }
  // K1-03 (audit SEC-008): anonymous ingestion is throttled fail-CLOSED —
  // per-IP rate, per-message dedupe, and a global daily row cap. The caller
  // always gets 204 (nothing is reflected); over-limit reports are dropped.
  const ip = await clientIp();
  if (!(await rateLimitStrict(`diag:ip:${ip}`, 20, 3600))) {
    return new NextResponse(null, { status: 204 });
  }
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return new NextResponse(null, { status: 204 });
  }
  const b = (body ?? {}) as { level?: unknown; message?: unknown; detail?: unknown };
  const level = b.level === "warn" ? "warn" : "error";
  const message = String(b.message ?? "").trim().slice(0, 500);
  if (!message) return new NextResponse(null, { status: 204 });
  const detail = b.detail == null ? null : String(b.detail).slice(0, 4000);
  // Dedupe: the same message from the same IP writes at most once per 10 min.
  const digest = createHash("sha1").update(message).digest("hex").slice(0, 16);
  if (!(await rateLimitStrict(`diag:dupe:${ip}:${digest}`, 1, 600))) {
    return new NextResponse(null, { status: 204 });
  }
  const admin = createAdminClient();
  // Global daily cap: a chatty (or hostile) fleet cannot flood error_logs.
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const { count } = await admin
    .from("error_logs")
    .select("id", { count: "exact", head: true })
    .eq("url", "app://courtside")
    .gte("created_at", dayStart.toISOString());
  if ((count ?? 0) >= 500) {
    return new NextResponse(null, { status: 204 });
  }
  // KCDX-068: `message` and `detail` arrive from a Courtside display over the
  // public network. The throttle above bounds volume; the scrubber bounds content.
  await admin.from("error_logs").insert({
    user_id: null,
    level,
    ...scrubLogRow({
      message: `[Courtside] ${message}`,
      detail,
      url: "app://courtside",
      userAgent: req.headers.get("user-agent") ?? "",
    }),
    url: "app://courtside",
  });
  return new NextResponse(null, { status: 204 });
}
