import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadQueueFor } from "@/lib/queue-audience";
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

  // KRA-002: anonymous visitor — the public projection, never the raw state.
  // Everything here is serialized into the RSC payload whether it renders or not.
  const snapshot = await loadQueueFor(admin, row.id, null);
  if (!snapshot) {
    return (
      <div className="mx-auto max-w-md px-5 py-16 text-center">
        <h1 className="font-display text-2xl text-ink">Queue not found</h1>
      </div>
    );
  }

  return <GuestJoin initial={snapshot.state} />;
}
