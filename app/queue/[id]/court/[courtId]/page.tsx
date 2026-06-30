import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSessionState } from "@/lib/queue-state";
import { CourtDisplay } from "@/components/queue/court-display";

export const metadata: Metadata = { title: "Court display" };

export default async function CourtDisplayPage({ params }: { params: Promise<{ id: string; courtId: string }> }) {
  const { id, courtId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/queue/${id}/court/${courtId}`);

  const admin = createAdminClient();
  const state = await loadSessionState(admin, id, user.id);
  if (!state) notFound();

  const isOrganizer = state.session.organizerId === user.id;
  return <CourtDisplay initial={state} courtId={courtId} isOrganizer={isOrganizer} />;
}
