import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

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
