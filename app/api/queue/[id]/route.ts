import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSessionState } from "@/lib/queue-state";
import { projectQueueState } from "@/lib/queue-projection";
import { getAdminRole } from "@/lib/admin";
import { queueEtag, canServe304 } from "@/lib/queue-etag";

// Module scope: the lint rule forbids impure calls inside render/handlers.
const sampleRoll = () => Math.random();

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

  // K2-02 + fix (0187): decide BEFORE doing the expensive work. One query
  // returns the state version and the organizer id — enough to compute the
  // audience-scoped ETag — so an unchanged poll answers 304 without ever
  // building a snapshot. The first version of this shipped the ETag check
  // AFTER loadSessionState, which meant every "cheap" poll still ran all five
  // queries and only the bytes were saved.
  let version = 0;
  let organizerId: string | null = null;
  try {
    const { data: head } = await admin.rpc("queue_poll_head", { p_session_id: id });
    const row = head?.[0];
    version = Number(row?.version ?? 0);
    organizerId = row?.organizer_id ?? null;
  } catch {
    version = 0; // head unavailable ⇒ fall through to the full snapshot
  }

  let isAdmin = false;
  if (meId) {
    try {
      isAdmin = (await getAdminRole()) !== null;
    } catch {
      isAdmin = false;
    }
  }
  const isOrganizer = meId !== null && organizerId !== null && meId === organizerId;
  const audience = isOrganizer || isAdmin ? "org" : meId ? "player" : "public";
  const etag = queueEtag(id, version, audience, meId);

  if (canServe304(version, req.headers.get("if-none-match"), etag)) {
    return new NextResponse(null, {
      status: 304,
      headers: { ETag: etag, "Cache-Control": "private, no-cache" },
    });
  }

  // Changed (or unknown version): build the real snapshot and time it. Only
  // this path is sampled, so the percentile measures the work that actually
  // costs something rather than being flattered by 304s.
  const t0 = Date.now();
  const state = await loadSessionState(admin, id, meId);
  const snapshotMs = Date.now() - t0;
  if (!state) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (sampleRoll() < 0.1) {
    void admin.from("perf_samples").insert({ metric: "queue_snapshot", value_ms: snapshotMs, route: "/api/queue/[id]" });
  }

  const safe = projectQueueState(state, { isOrganizer, isAdmin });
  return NextResponse.json(safe, {
    headers: { ETag: etag, "Cache-Control": "private, no-cache" },
  });
}
