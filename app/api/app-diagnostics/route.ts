import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
  const admin = createAdminClient();
  await admin.from("error_logs").insert({
    user_id: null,
    level,
    message: `[Courtside] ${message}`,
    detail,
    url: "app://courtside",
    user_agent: (req.headers.get("user-agent") ?? "").slice(0, 300),
  });
  return new NextResponse(null, { status: 204 });
}
