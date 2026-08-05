import { NextResponse } from "next/server";
import { sweepWaitlists } from "@/lib/match-waitlist";

/** Pinged every minute by pg_cron (migration 0172) via pg_net. Expires
 *  overdue waitlist offers and cascades each freed spot to the next player
 *  in line, with fresh windows, notifications, and emails. */
export const maxDuration = 60;

export async function POST(req: Request) {
  const secret = process.env.WAITLIST_CRON_SECRET;
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const result = await sweepWaitlists();
  return NextResponse.json({ ok: true, ...result });
}
