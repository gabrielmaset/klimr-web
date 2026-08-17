import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { getPrivilegedClient } from "@/lib/privileged";
import { clientIp, rateLimitStrict } from "@/lib/ratelimit";

/** Courtside device enrollment — KFU-001 permanent fix (migration 0280).
 *
 *  A display enrolls by presenting a ONE-TIME ENROLLMENT SECRET that the
 *  organizer issued from their signed-in session (see
 *  app/queue/courtside-actions.ts → issueCourtsideEnrollment). The session's
 *  join code and display code are PUBLIC by design — poster, walk-up QR, signage
 *  URL, public queue projection — and can no longer enroll anything.
 *
 *  In exchange the server mints a 32-byte device token, stores only its SHA-256,
 *  and returns the token once. Every later operator command presents that token,
 *  and courtside_authorize re-checks scope (session, not-revoked, live session).
 *
 *  The secret is sent as `enrollmentCode`; `code` is still accepted on the wire
 *  so an older tablet build gets a clean 403 rather than a crash — it simply
 *  cannot enroll, which is the intended post-KFU-001 behavior.
 */
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const ip = await clientIp();
  // Bounds code-guessing: a venue registers a handful of displays, ever.
  if (!(await rateLimitStrict(`courtside-register:ip:${ip}`, 20, 3600))) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // KRA-001 IS NOT ACTIVE ON THIS PATH YET — reverted 2026-08-11 after it broke
  // Courtside registration in production.
  //
  // The hardened version of this route reads `enrollmentCode` and calls
  // `courtside_register(p_secret_hash …)`. Both halves of that require migration
  // 0235, which is deliberately NOT pasted: the handoff records that 0235 must
  // ship together with a Courtside app batch, because the tablet sends `code`.
  //
  // Shipping the route without the migration and without the app batch produced
  // exactly the predicted failure — `ensureDeviceToken()` got a 400, returned
  // null, and every display reported "This display isn't registered yet". The
  // ordering constraint was written down and then not honoured on deploy, which
  // is the failure worth remembering: a documented constraint only helps if the
  // thing it constrains cannot ship without it.
  //
  // This restores the pre-KRA-001 behaviour, which matches the deployed database.
  // The vulnerability (the public join code can mint an operator token) is
  // therefore OPEN again and stays open until 0235 + the app batch ship together.
  const installId = String(body.installId ?? "");
  // The enrollment secret is grouped for reading aloud (XXXX-XXXX-XXXX) but is
  // accepted in whatever case the tablet sends.
  const secret = String(body.enrollmentCode ?? body.secret ?? "").trim().toUpperCase();
  if (!UUID_RE.test(installId) || secret.length < 8 || secret.length > 64) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Server-minted: the client never chooses its own token.
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const admin = getPrivilegedClient({ reason: "courtside:register" });
  const { data, error } = await admin.rpc("courtside_register", {
    p_install_id: installId,
    // The SERVER hashes the secret (0280), so a leaked hash is not a credential.
    p_secret: secret,
    p_token_hash: tokenHash,
    p_platform: String(body.platform ?? "").slice(0, 40) || null,
    p_app_version: String(body.appVersion ?? "").slice(0, 40) || null,
  });

  if (error || data !== true) {
    // Same response for a bad code and a dead session: no oracle for guessing.
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  // The token is returned exactly once and never stored in plaintext anywhere.
  return NextResponse.json({ ok: true, token }, { headers: { "Cache-Control": "no-store" } });
}
