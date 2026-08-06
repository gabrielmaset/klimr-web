import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { getPrivilegedClient } from "@/lib/privileged";
import { clientIp, rateLimitStrict } from "@/lib/ratelimit";

/** One-time courtside device registration (migration 0184).
 *
 *  A display proves it belongs by presenting the session's JOIN CODE — the same
 *  credential players use, so possessing it is evidence of being at the venue.
 *  In exchange the server mints a 32-byte token, stores only its SHA-256, and
 *  returns the token once. Every later heartbeat presents that token.
 *
 *  Registration is rare (once per device, or after a cache clear), so this
 *  endpoint carries the strict per-IP limit that the heartbeat path does NOT
 *  need — there, the token is the gate. */
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

  const installId = String(body.installId ?? "");
  const code = String(body.code ?? "").trim().toUpperCase();
  if (!UUID_RE.test(installId) || code.length < 4 || code.length > 12) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Server-minted: the client never chooses its own token.
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const admin = getPrivilegedClient({ reason: "courtside:register" });
  const { data, error } = await admin.rpc("courtside_register", {
    p_install_id: installId,
    p_code: code,
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
