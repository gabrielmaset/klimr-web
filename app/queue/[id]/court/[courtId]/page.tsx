import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadQueueFor } from "@/lib/queue-audience";
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
  // KRA-002: the organizer operates this display; anyone else signed in who opens
  // it is an ordinary viewer and gets the projection.
  const snapshot = await loadQueueFor(admin, id, user.id);
  if (!snapshot) notFound();

  const isOrganizer = snapshot.viewer.isOrganizer;
  return <CourtDisplay initial={snapshot.state} courtId={courtId} canOperate={isOrganizer} />;
}
