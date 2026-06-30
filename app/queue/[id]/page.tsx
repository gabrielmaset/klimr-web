import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSessionState } from "@/lib/queue-state";
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
  const state = await loadSessionState(admin, id, user.id);
  if (!state) notFound();

  const isOrganizer = state.session.organizerId === user.id;

  return (
    <div className="mx-auto max-w-page px-5 py-8">
      <QueueClient initial={state} isOrganizer={isOrganizer} />
    </div>
  );
}
