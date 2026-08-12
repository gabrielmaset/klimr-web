import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadQueueFor } from "@/lib/queue-audience";
import { CourtDisplay } from "@/components/queue/court-display";

export const metadata: Metadata = { title: "Courtside display" };

// Public, login-free signage for the tablet at the net. Short, typeable URL:
//   klimr.com/q/CODE/1 → first court, /q/CODE/2 → second, and so on.
// Authorized by the session code in the URL (same capability as the walk-up link),
// so the organizer can open it on any tablet without signing in.
export default async function PublicCourtDisplayPage({ params }: { params: Promise<{ code: string; court: string }> }) {
  const { code, court } = await params;
  const admin = createAdminClient();
  const { data: row } = await admin.from("court_sessions").select("id, code").eq("display_code", code.toUpperCase()).maybeSingle();
  if (!row) notFound();

  // KRA-002: the signage is the OPERATOR audience — possession of the display code
  // is what authorizes this page (KCDX-008), so it keeps `displayCode` and notices a
  // rotation. It still loses the geofence centre, the organizer UUID and other
  // people's pending join requests, none of which a scoreboard has any use for.
  const snapshot = await loadQueueFor(admin, row.id, null, { operator: true });
  if (!snapshot) notFound();
  const state = snapshot.state;

  // "1"/"2"/… resolve to a court by position; also accept a raw court id for old
  // links. A missing court is NOT a 404: after the day's wipe a session has no
  // courts at all, and the display must still show its ended/asleep takeover.
  const n = parseInt(court, 10);
  const target = Number.isFinite(n) && n >= 1 && n <= state.courts.length ? state.courts[n - 1] : state.courts.find((c) => c.id === court);

  const ua = (await headers()).get("user-agent") ?? "";
  const isApp = ua.includes("KlimrCourtside");

  return <CourtDisplay initial={state} courtId={target?.id ?? ""} canOperate code={state.session.code} enteredCode={code.toUpperCase()} isApp={isApp} />;
}
