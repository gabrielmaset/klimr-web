import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { bucketAllow } from "@/lib/ratelimit-bucket";

/** Best-effort end-user IP from proxy headers (Vercel sets x-forwarded-for). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0];
    return (first ?? "").trim() || "unknown";
  }
  return h.get("x-real-ip") ?? "unknown";
}

/** True if the action is allowed, false if the caller is over the limit for `key`.
 *  Fails OPEN on any infrastructure error so a DB hiccup never blocks a real user. */
export async function rateLimit(key: string, max: number, windowSeconds: number): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("check_rate_limit", { p_key: key, p_max: max, p_window_seconds: windowSeconds });
    if (error) {
      console.error("[ratelimit] rpc error", error);
      return true;
    }
    return data !== false;
  } catch (e) {
    console.error("[ratelimit] threw", e);
    return true;
  }
}

/** Fail-CLOSED variant for cost-bearing / enumerable endpoints (audit
 *  SEC-007 · O-4 · K1-02): AI search, gate & code validation, diagnostics.
 *  When the DB limiter answers, its verdict stands; when the limiter
 *  infrastructure errors, the in-process secondary bucket enforces the same
 *  rate instead of allowing everything. Ordinary UX actions keep the
 *  fail-open `rateLimit` above — that doctrine is unchanged. */
export async function rateLimitStrict(key: string, max: number, windowSeconds: number): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("check_rate_limit", { p_key: key, p_max: max, p_window_seconds: windowSeconds });
    if (!error) return data !== false;
    console.error("[ratelimit:strict] rpc error — secondary bucket engaged", error);
  } catch (e) {
    console.error("[ratelimit:strict] threw — secondary bucket engaged", e);
  }
  return bucketAllow(key, max, windowSeconds * 1000);
}
