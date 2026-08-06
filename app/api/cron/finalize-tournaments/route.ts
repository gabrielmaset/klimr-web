import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { awardTournamentPointsSystem } from "@/app/tournaments/actions";
import { isAuthorizedCron } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Vercel cron (vercel.json): auto-finalize + award ranking points for
 *  tournaments 72h past their end that no organizer finalized. Gabriel's
 *  rule: registered players never lose points to a forgotten button. Reuses
 *  the exact award math (one code path); safe to re-run — the stamp is
 *  written only once and the awarder is idempotent. */
export async function GET(req: Request) {
  // Fail closed (audit SEC-003): a deploy without CRON_SECRET authorizes nothing.
  if (!isAuthorizedCron(req.headers, process.env.CRON_SECRET)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - 72 * 3_600_000).toISOString();
  const { data: due } = await admin
    .from("tournaments")
    .select("id, title")
    .is("results_finalized_at", null)
    .is("cancelled_at", null)
    .not("ends_at", "is", null)
    .lt("ends_at", cutoff)
    .limit(20);
  const results: { id: string; ok: boolean; note?: string }[] = [];
  for (const t of due ?? []) {
    try {
      const r = await awardTournamentPointsSystem(t.id);
      results.push({ id: t.id, ok: r.ok, note: r.ok ? undefined : r.error });
    } catch (e) {
      console.error("[cron finalize] failed", t.id, e);
      results.push({ id: t.id, ok: false, note: "exception" });
    }
  }
  return NextResponse.json({ ok: true, processed: results });
}
