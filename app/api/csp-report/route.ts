import { NextResponse } from "next/server";
import { getPrivilegedClient } from "@/lib/privileged";
import { clientIp, rateLimitStrict } from "@/lib/ratelimit";
import { scrubLogRow } from "@/lib/log-scrub";

/** CSP violation collector (K3-06).
 *
 *  Browsers POST here when the report-only policy would have blocked something.
 *  The whole point of the report-only phase is to find those cases before
 *  enforcement, so reports land in `error_logs` where the diagnostics screen
 *  already surfaces them.
 *
 *  Untrusted and unauthenticated by nature — browsers send these without
 *  credentials — so it is rate limited fail-closed, deduplicated by directive,
 *  and stores only the policy fields, never the page's own content. */
export const dynamic = "force-dynamic";

type Report = {
  "csp-report"?: {
    "violated-directive"?: string;
    "effective-directive"?: string;
    "blocked-uri"?: string;
    "document-uri"?: string;
    "line-number"?: number;
  };
};

export async function POST(req: Request) {
  const ip = await clientIp();
  if (!(await rateLimitStrict(`csp:ip:${ip}`, 30, 3600))) {
    return new NextResponse(null, { status: 204 });
  }

  let body: Report;
  try {
    body = (await req.json()) as Report;
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const r = body["csp-report"];
  if (!r) return new NextResponse(null, { status: 204 });

  const directive = String(r["effective-directive"] ?? r["violated-directive"] ?? "unknown").slice(0, 80);
  const blocked = String(r["blocked-uri"] ?? "").slice(0, 300);

  // One report per directive+source per 10 minutes: a single broken page would
  // otherwise generate a report per render, per visitor.
  if (!(await rateLimitStrict(`csp:dupe:${directive}:${blocked.slice(0, 80)}`, 1, 600))) {
    return new NextResponse(null, { status: 204 });
  }

  const admin = getPrivilegedClient({ reason: "csp:violation" });
  // KCDX-068: the path-only trim below was already the right instinct; the
  // scrubber makes it the same policy every other writer uses, and templates
  // the codes a document URI can still carry after the query is stripped.
  await admin.from("error_logs").insert({
    user_id: null,
    level: "warn",
    ...scrubLogRow({
      message: `[CSP] ${directive} blocked ${blocked || "(inline)"}`,
      detail: String(r["document-uri"] ?? "").split("?")[0],
      url: "csp://report-only",
      userAgent: req.headers.get("user-agent") ?? "",
    }),
    url: "csp://report-only",
  });

  return new NextResponse(null, { status: 204 });
}
