"use server";

/** Courtside device provisioning — KRA-001 (P0).
 *
 *  Its own module rather than another 55 lines on app/queue/actions.ts. The size
 *  ratchet (KCDX-067) exists to make that choice deliberate, and the precedent it
 *  set was `payment-actions.ts`: extract when the lines share a subject that
 *  nothing else in the parent module touches. Device enrollment qualifies —
 *  provisioning a screen has no overlap with running a queue.
 */

import { revalidatePath } from "next/cache";
import { createHash, randomInt } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { accountActive } from "@/lib/guards";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function genCode(len = 4): string {
  // A credential — crypto-grade randomness, never Math.random.
  let out = "";
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
}

/** KRA-001 (P0) — issue a one-time Courtside enrollment secret.
 *
 *  The re-audit found that `courtside_register` accepted the session JOIN code —
 *  the value printed on the poster and rendered as the walk-up QR — and returned a
 *  fresh operator token for any UUID the caller invented. Owner decision OD-1: a
 *  display enrolls with a secret the organizer issues, and nothing else.
 *
 *  The secret is minted HERE and only its SHA-256 reaches the database, matching
 *  how the device token itself has worked since 0184. That means it is displayed
 *  to the organizer exactly once and is not recoverable afterwards — losing it
 *  costs one more tap, which is the correct trade for a credential that grants
 *  match control.
 *
 *  Authorization is NOT decided here. The RPC re-derives the organizer from the
 *  locked session row using the caller's own `auth.uid()`, so this action cannot
 *  grant more than the caller already has, and a direct PostgREST call to the same
 *  function gets the identical answer. */
export async function issueCourtsideEnrollment(formData: FormData): Promise<{ code?: string; label?: string; expiresInMinutes?: number; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };
  if (!(await accountActive(supabase, user.id))) return { error: "Your account is not active." };

  const sessionId = String(formData.get("sessionId") ?? "");
  if (!sessionId) return { error: "Missing session." };
  const label = String(formData.get("label") ?? "").trim().slice(0, 60) || null;

  // Grouped for reading aloud across a court: XXXX-XXXX-XXXX.
  const raw = `${genCode(4)}-${genCode(4)}-${genCode(4)}`;
  const secretHash = createHash("sha256").update(raw).digest("hex");

  // The caller's own session — so auth.uid() inside the function is the person
  // who clicked, not the service role.
  const { error } = await supabase.rpc("courtside_issue_enrollment", {
    p_session_id: sessionId,
    p_secret_hash: secretHash,
    p_label: label,
    p_ttl_minutes: 30,
  });

  if (error) {
    // The function raises `not_organizer` / `session_ended` / `session_not_found`.
    const msg = String(error.message ?? "");
    if (msg.includes("not_organizer")) return { error: "Only the organizer can add a display." };
    if (msg.includes("session_ended")) return { error: "This session has ended." };
    if (msg.includes("session_not_found")) return { error: "Queue not found." };
    return { error: "Could not create a display code. Try again." };
  }

  revalidatePath(`/queue/${sessionId}`);
  return { code: raw, label: label ?? undefined, expiresInMinutes: 30 };
}
