import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanQueueCode, splitQueueCode } from "@/lib/queue";

export const dynamic = "force-dynamic";

/** Pre-flight for the Courtside app: does this code point at a real session,
 *  and is it live? Codes are public credentials printed on posters, so
 *  existence is not a secret — the response still carries nothing beyond
 *  { ok, live, courts }. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const raw = cleanQueueCode(String(searchParams.get("code") ?? ""));
  const { code } = splitQueueCode(raw);
  const headers = { "cache-control": "no-store" };
  if (code.length !== 6) return NextResponse.json({ ok: false, live: false, courts: 0 }, { headers });
  const admin = createAdminClient();
  const { data: s } = await admin.from("court_sessions").select("id, status").eq("code", code).maybeSingle();
  if (!s) return NextResponse.json({ ok: false, live: false, courts: 0 }, { headers });
  const { count } = await admin.from("queue_courts").select("id", { count: "exact", head: true }).eq("session_id", s.id);
  return NextResponse.json({ ok: true, live: s.status === "live", courts: count ?? 0 }, { headers });
}
