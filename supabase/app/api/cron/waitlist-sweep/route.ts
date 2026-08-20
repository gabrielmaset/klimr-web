import { NextResponse } from "next/server";
import { sweepWaitlists } from "@/lib/match-waitlist";
import { isAuthorizedCron } from "@/lib/cron-auth";

/** Waitlist offer expiry + promotion emails. Pinged by pg_cron.
 *  NOTE (H1/KFU-002): the durable background workers (Storage-deletion drain,
 *  jobs worker, perf pruning, health canaries) MOVED to /api/cron/worker-heartbeat
 *  — they must not share a failure boundary with the waitlist path, and the
 *  authoritative promotion now lives in the SQL sweep (0232). This route only
 *  sends the offer/promotion notifications the SQL path does not. */
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!isAuthorizedCron(req.headers, process.env.WAITLIST_CRON_SECRET)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const result = await sweepWaitlists();
  return NextResponse.json({ ok: true, ...result });
}
