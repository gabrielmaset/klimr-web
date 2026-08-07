import { NextResponse } from "next/server";
import { getPrivilegedClient } from "@/lib/privileged";
import { clientIp, rateLimitStrict } from "@/lib/ratelimit";

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
  await admin.from("error_logs").insert({
    user_id: null,
    level: "warn",
    message: `[CSP] ${directive} blocked ${blocked || "(inline)"}`,
    // Path only — a document URI can carry a session code or a person's slug.
    detail: String(r["document-uri"] ?? "").split("?")[0].slice(0, 300),
    url: "csp://report-only",
    user_agent: (req.headers.get("user-agent") ?? "").slice(0, 300),
  });

  return new NextResponse(null, { status: 204 });
}
