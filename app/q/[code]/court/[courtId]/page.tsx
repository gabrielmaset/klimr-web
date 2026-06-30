import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSessionState } from "@/lib/queue-state";
import { CourtDisplay } from "@/components/queue/court-display";

export const metadata: Metadata = { title: "Courtside display" };

// Public, login-free signage for the tablet at the net. Authorized by the session
// code in the URL (the same capability as the walk-up link), so the organizer can
// just open this on any tablet without signing in.
export default async function PublicCourtDisplayPage({ params }: { params: Promise<{ code: string; courtId: string }> }) {
  const { code, courtId } = await params;
  const admin = createAdminClient();
  const { data: row } = await admin.from("court_sessions").select("id, code").eq("code", code.toUpperCase()).maybeSingle();
  if (!row) notFound();

  const state = await loadSessionState(admin, row.id, null);
  if (!state) notFound();

  return <CourtDisplay initial={state} courtId={courtId} canOperate code={state.session.code} />;
}
