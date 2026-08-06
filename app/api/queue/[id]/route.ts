import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSessionState } from "@/lib/queue-state";
import { projectQueueState } from "@/lib/queue-projection";
import { getAdminRole } from "@/lib/admin";
import { queueEtag, canServe304 } from "@/lib/queue-etag";

// Live state for the queue (polled by the tablet display, players' phones, and the
// public walk-up page). Reads run on the service-role client; "me" is resolved only
// from the caller's own session cookie, so anonymous guests simply get me: null.
// The response is PROJECTED per audience (audit SEC-004 · decision D7): only the
// organizer and admins receive the geofence centre, organizer id, and the pending
// join-request list — everyone else gets the trimmed public/player shape.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let meId: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    meId = user?.id ?? null;
  } catch {
    meId = null;
  }
  const admin = createAdminClient();

  // K2-02 (audit QUEUE-003): cheap-unchanged polls. Read the session version
  // first — one primary-key lookup — and answer an unchanged poll with 304 and
  // no body, instead of rebuilding a five-query snapshot every 3 s per client.
  // The ETag carries the AUDIENCE because organizer and public payloads differ
  // (K0-04); mixing them in one cache entry would leak the organizer view.
  let version = 0;
  try {
    const { data: v } = await admin.rpc("queue_version", { p_session_id: id });
    version = Number(v ?? 0);
  } catch {
    version = 0; // version unavailable ⇒ fall through to the full snapshot
  }

  const state = await loadSessionState(admin, id, meId);
  if (!state) return NextResponse.json({ error: "not_found" }, { status: 404 });
  let isAdmin = false;
  if (meId) {
    try {
      isAdmin = (await getAdminRole()) !== null;
    } catch {
      isAdmin = false;
    }
  }
  const isOrganizer = meId !== null && meId === state.session.organizerId;
  const audience = isOrganizer || isAdmin ? "org" : meId ? "player" : "public";
  const etag = queueEtag(id, version, audience, meId);

  if (canServe304(version, req.headers.get("if-none-match"), etag)) {
    return new NextResponse(null, {
      status: 304,
      headers: { ETag: etag, "Cache-Control": "private, no-cache" },
    });
  }

  const safe = projectQueueState(state, { isOrganizer, isAdmin });
  return NextResponse.json(safe, {
    headers: { ETag: etag, "Cache-Control": "private, no-cache" },
  });
}
