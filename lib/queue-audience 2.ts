import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { QSessionState } from "@/lib/queue";
import { loadSessionState } from "@/lib/queue-state";
import { projectQueueState } from "@/lib/queue-projection";

type Admin = SupabaseClient<Database>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type QueueViewer = { isOrganizer: boolean; isAdmin: boolean; isOperator: boolean };

/** Proof a Courtside display holds a device capability for this session. */
export type OperatorProof = { installId: string; deviceToken: string };

/** KRA-002 — the ONE place queue state is allowed to cross a server→client boundary.
 *
 *  The re-audit found `projectQueueState` wired into a single caller (the polling
 *  API) while FOUR server components passed `loadSessionState` output straight into
 *  a client component. A React Server Component serializes the whole prop object
 *  into the RSC payload whether or not a field is rendered, so the public
 *  `/q/[code]` page was shipping every pending join request, the geofence centre,
 *  the organizer UUID and the Courtside display code to anyone who fetched it.
 *
 *  The projection was never the problem — remembering to call it was. So loading
 *  and projecting are now one operation, and a guardrail test (tests/guardrails.test.ts)
 *  fails the build if any file other than this one imports `loadSessionState`.
 *  A new queue page cannot leak by omission; it has to route through here. */
export async function loadQueueFor(
  admin: Admin,
  sessionId: string,
  viewerId: string | null,
  opts: {
    /** Precomputed viewer — pass when the caller already resolved it (the poll route
     *  needs the audience BEFORE loading state, to build its ETag and answer 304). */
    viewer?: QueueViewer;
    isAdmin?: boolean;
    /** `true` grants the operator audience outright — use only where possession of
     *  the display code IS the authorization (the login-free Courtside signage page).
     *  Anything else must pass proof, which is checked against the database. */
    operator?: boolean | OperatorProof;
  } = {},
): Promise<{ state: QSessionState; viewer: QueueViewer } | null> {
  const state = await loadSessionState(admin, sessionId, viewerId);
  if (!state) return null;

  const viewer =
    opts.viewer ??
    (await resolveQueueViewer(admin, sessionId, viewerId, {
      isAdmin: opts.isAdmin,
      operator: opts.operator,
      // The raw state is already in hand, so the organizer test is free here and
      // does not cost the extra head query resolveQueueViewer would otherwise run.
      organizerId: state.session.organizerId || null,
    }));

  return { state: projectQueueState(state, viewer), viewer };
}

/** Resolve the audience without loading a snapshot. Split out because the poll
 *  route must know the audience before deciding whether it can answer 304. */
export async function resolveQueueViewer(
  admin: Admin,
  sessionId: string,
  viewerId: string | null,
  opts: {
    isAdmin?: boolean;
    operator?: boolean | OperatorProof;
    /** Skips the lookup when the caller already knows it. */
    organizerId?: string | null;
  } = {},
): Promise<QueueViewer> {
  let organizerId = opts.organizerId ?? null;
  if (organizerId === null && viewerId) {
    const { data } = await admin
      .from("court_sessions")
      .select("organizer_id")
      .eq("id", sessionId)
      .maybeSingle();
    organizerId = data?.organizer_id ?? null;
  }

  const isOrganizer = viewerId !== null && organizerId !== null && viewerId === organizerId;
  const isAdmin = opts.isAdmin === true;

  let isOperator = false;
  if (opts.operator === true) {
    isOperator = true;
  } else if (opts.operator && typeof opts.operator === "object") {
    isOperator = await verifyOperatorProof(admin, sessionId, opts.operator);
  }

  return { isOrganizer, isAdmin, isOperator };
}

/** A device capability is proved against the database, never asserted by a header
 *  alone: the install id plus the SHA-256 of the token minted at registration must
 *  match a live, unrevoked device bound to THIS session. */
export async function verifyOperatorProof(
  admin: Admin,
  sessionId: string,
  proof: OperatorProof,
): Promise<boolean> {
  if (!UUID_RE.test(proof.installId) || proof.deviceToken.length < 20) return false;
  const { data } = await admin.rpc("courtside_authorize", {
    p_install_id: proof.installId,
    p_token_hash: createHash("sha256").update(proof.deviceToken).digest("hex"),
    p_session_id: sessionId,
  });
  return data === true;
}
