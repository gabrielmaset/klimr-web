import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSessionState } from "@/lib/queue-state";
import { GuestJoin } from "@/components/queue/guest-join";

export const metadata: Metadata = { title: "Join the queue" };

export default async function PublicQueuePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const admin = createAdminClient();
  const { data: row } = await admin.from("court_sessions").select("id").eq("code", code.toUpperCase()).maybeSingle();

  if (!row) {
    return (
      <div className="mx-auto max-w-md px-5 py-16 text-center">
        <h1 className="font-display text-2xl text-ink">Queue not found</h1>
        <p className="mt-2 text-sm text-mute">Double-check the link or code with your organizer.</p>
      </div>
    );
  }

  const state = await loadSessionState(admin, row.id, null);
  if (!state) {
    return (
      <div className="mx-auto max-w-md px-5 py-16 text-center">
        <h1 className="font-display text-2xl text-ink">Queue not found</h1>
      </div>
    );
  }

  return <GuestJoin initial={state} />;
}
