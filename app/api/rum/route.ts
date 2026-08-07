import { NextResponse } from "next/server";
import { getPrivilegedClient } from "@/lib/privileged";

/** Real-user monitoring beacon (K3-05, migration 0186).
 *
 *  Deliberately narrow: a metric from a closed enum, a duration, a ROUTE
 *  PATTERN, and a mobile flag. No user id, no URL, no query string, no
 *  referrer — this is a latency histogram, and the fastest way for one to
 *  become a behaviour log is to accept "just one more field".
 *
 *  Unauthenticated by necessity (vitals fire before and after auth alike) and
 *  therefore untrusted: values are clamped, the metric must be in the enum, and
 *  the client samples at 10%. Worst case for a forger is skewed latency
 *  percentiles on a dashboard — so this is bounded, not gated. */
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

  const admin = getPrivilegedClient({ reason: "rum:beacon" });
  await admin.from("perf_samples").insert({
    metric,
    // Clamp: a bogus or backgrounded-tab value must not distort a percentile.
    value_ms: Math.min(Math.round(value), 120_000),
    route: routePattern(body.route),
    is_mobile: body.isMobile === true,
  });

  return new NextResponse(null, { status: 204 });
}
