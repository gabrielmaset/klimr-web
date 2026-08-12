import { NextResponse } from "next/server";
import { getPrivilegedClient } from "@/lib/privileged";
import { clientIp, rateLimitStrict } from "@/lib/ratelimit";

/** Real-user monitoring beacon (K3-05, migration 0186).
 *
 *  Deliberately narrow: a metric from a closed enum, a duration, a ROUTE
 *  PATTERN, and a mobile flag. No user id, no URL, no query string, no
 *  referrer — this is a latency histogram, and the fastest way for one to
 *  become a behaviour log is to accept "just one more field".
 *
 *  Unauthenticated by necessity (vitals fire before and after auth alike) and
 *  therefore untrusted: values are clamped and the metric must be in the enum.
 *
 *  KRA-031 — the old comment claimed the worst case was a skewed dashboard. It
 *  was not. Every accepted request created a service-role client and inserted a
 *  row with no per-source limit and no global budget, so anyone holding the URL
 *  could drive unbounded writes, storage growth, index churn and project cost.
 *  "The client samples at 10%" is a request TO the client, not a control.
 *
 *  Two bounds now, neither of which the client can decline: a fail-closed per-IP
 *  limit here, and a daily row budget inside `rum_ingest` that COUNTS what it
 *  drops — a budget that discards traffic silently is indistinguishable from a
 *  system nobody is talking to. */
export const dynamic = "force-dynamic";

const METRICS = new Set([
  "lcp", "inp", "cls", "ttfb",
  "queue_snapshot", "queue_action",
  "court_search_stored", "court_search_live",
]);

/** Route PATTERNS only — a real path can carry a session code or a person's
 *  slug, and neither belongs in a performance table. */
function routePattern(raw: unknown): string | null {
  const p = String(raw ?? "").split("?")[0];
  if (!p.startsWith("/") || p.length > 120) return null;
  return p
    .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "/[id]")
    .replace(/\/\d+/g, "/[n]")
    .replace(/\/(q|e)\/[A-Z0-9]{4,10}/gi, "/$1/[code]")
    .slice(0, 80);
}

export async function POST(req: Request) {
  // Fail-closed: rateLimitStrict denies when the limiter itself is unavailable,
  // the opposite of the fail-open `rateLimit` KCDX-055 had to correct in front of
  // a paid vendor call.
  const ip = await clientIp();
  if (!(await rateLimitStrict(`rum:ip:${ip}`, 120, 60))) {
    return new NextResponse(null, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const metric = String(body.metric ?? "");
  const value = Number(body.value);
  if (!METRICS.has(metric) || !Number.isFinite(value) || value < 0) {
    return new NextResponse(null, { status: 204 });
  }

  // Admission, not a raw insert. The budget lives in the database so a
  // distributed flood cannot outrun a per-instance counter.
  const admin = getPrivilegedClient({ reason: "rum:beacon" });
  const { data, error } = await admin.rpc("rum_ingest", {
    p_metric: metric,
    // Clamp: a bogus or backgrounded-tab value must not distort a percentile.
    p_value_ms: Math.min(Math.round(value), 120_000),
    p_route: routePattern(body.route),
    p_is_mobile: body.isMobile === true,
    p_daily_cap: 200_000,
  });
  // supabase-js does not throw on a failed RPC, and a discarded { error } is a
  // failure nobody will ever see (KCDX-031). Telemetry must never break a page,
  // so the caller still gets 204 — but the server records why.
  if (error) console.error("rum_ingest failed", { code: error.code, message: error.message });
  else if (data === "over_budget") console.warn("rum_ingest over daily budget");

  return new NextResponse(null, { status: 204 });
}
