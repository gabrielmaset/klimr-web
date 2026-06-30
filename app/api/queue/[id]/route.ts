import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSessionState } from "@/lib/queue-state";

// Live state for the queue (polled by the tablet display, players' phones, and the
// public walk-up page). Reads run on the service-role client; "me" is resolved only
// from the caller's own session cookie, so anonymous guests simply get me: null.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
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
  const state = await loadSessionState(admin, id, meId);
  if (!state) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
}
