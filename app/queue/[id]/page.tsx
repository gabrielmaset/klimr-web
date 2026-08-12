import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadQueueFor } from "@/lib/queue-audience";
import { QueueClient } from "@/components/queue/queue-client";

export const metadata: Metadata = { title: "Live queue" };

export default async function QueueSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/queue/${id}`);

  const admin = createAdminClient();
  // KRA-002: the organizer keeps the full state; every other signed-in viewer of
  // this page gets the projection. The audience is resolved from the raw row inside
  // the seam, so `isOrganizer` no longer depends on a field the projection blanks.
  const snapshot = await loadQueueFor(admin, id, user.id);
  if (!snapshot) notFound();
  const state = snapshot.state;
  const isOrganizer = snapshot.viewer.isOrganizer;

  return (
    <div className="mx-auto max-w-page px-5 py-8">
      <Breadcrumbs items={state.session.eventId ? [{ label: "Events", href: "/events" }, { label: state.session.title, href: `/events/${state.session.eventId}` }, { label: "Live queue" }] : state.session.tournamentId ? [{ label: "Tournaments", href: "/tournaments" }, { label: state.session.title, href: `/tournament/${state.session.tournamentId}` }, { label: "Live queue" }] : [{ label: "Live Queue", href: "/queue" }, { label: state.session.title }]} />
      <QueueClient initial={state} isOrganizer={isOrganizer} />
    </div>
  );
}
