import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

/**
 * Signed-cookie gate for the two portal pages:
 *   - "site"     → the invite-code portal in front of klimr.com
 *   - "investor" → the investor-code portal in front of the demo
 *
 * Each portal validates the entered code against the database server-side, then
 * sets a cookie whose value is an HMAC the visitor could not have produced
 * themselves. Pages verify that HMAC, so the cookie can't be forged by simply
 * setting an arbitrary value.
 *
 * GATE_SECRET MUST be set in production (Vercel env) for the token to be
 * forgery-resistant. Without it the gate falls back to a known string so the
 * site doesn't go down, but the cookie becomes guessable — see SECURITY.md.
 */
const SECRET = process.env.GATE_SECRET || "klimr-gate-fallback-set-GATE_SECRET";

export type GateScope = "site" | "investor";

const COOKIE: Record<GateScope, string> = {
  site: "klimr_gate",
  investor: "klimr_investor",
};

export function gateCookieName(scope: GateScope): string {
  return COOKIE[scope];
}

/** Deterministic, non-guessable token for a scope. */
export function gateToken(scope: GateScope): string {
  return createHmac("sha256", SECRET).update(`klimr:${scope}`).digest("base64url");
}

/** Constant-time check that a cookie value matches the expected token. */
export function verifyGateToken(scope: GateScope, token: string | undefined | null): boolean {
  if (!token) return false;
  const expected = gateToken(scope);
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Read the gate cookie for a scope and verify it. */
export async function hasGate(scope: GateScope): Promise<boolean> {
  const token = (await cookies()).get(COOKIE[scope])?.value;
  return verifyGateToken(scope, token);
}
