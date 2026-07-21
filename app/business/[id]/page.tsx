import { redirect } from "next/navigation";
import { BadgeCheck, ShieldCheck, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { setBusinessPublished } from "../actions";
import { kindLabel, TIER_LABEL, BUSINESS_STATUS_LABEL } from "@/lib/business";
import { formatMilestoneBucket } from "@/lib/analytics-buckets";

export const dynamic = "force-dynamic";

/** Portal dashboard: status at a glance, listing control, verified reach.
 *  Membership and the flag are guaranteed by the portal layout. */
export default async function BusinessDashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/business/${id}`);

  const [{ data: b }, { data: membership }] = await Promise.all([
    supabase
      .from("business_accounts")
      .select("id, kind, name, verification_level, status, published")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("business_members").select("role").eq("business_id", id).eq("user_id", user.id).maybeSingle(),
  ]);
  if (!b) redirect("/settings");
  const canManage = membership?.role === "owner" || membership?.role === "manager";
  const draft = b.status === "draft";

  // Verified reach — milestone buckets only (exact stays server-side).
  const { data: fullSpons } = await supabase
    .from("sponsorships")
    .select("id, target_kind, target_id, label")
    .eq("business_id", id)
    .eq("status", "active");
  const rows = (fullSpons ?? []) as { id: string; target_kind: string; target_id: string; label: string }[];
  const reachRows: { id: string; kindLabelText: string; bucket: string | null }[] = [];
  let reachTotal = 0;
  if (rows.length) {
    const evIds = rows.filter((r) => r.target_kind === "event").map((r) => r.target_id);
    const evReach = new Map<string, number>();
    if (evIds.length) {
      const { data: occs } = await supabase
        .from("event_occurrences")
        .select("event_id, verified_count")
        .in("event_id", evIds)
        .eq("status", "completed_with_evidence")
        .limit(2000);
      for (const o of (occs ?? []) as { event_id: string; verified_count: number }[]) {
        evReach.set(o.event_id, (evReach.get(o.event_id) ?? 0) + o.verified_count);
      }
    }
    const teamIds = rows.filter((r) => r.target_kind === "team").map((r) => r.target_id);
    const teamReach = new Map<string, number>();
    if (teamIds.length) {
      const { data: tm } = await supabase.from("team_members").select("team_id").in("team_id", teamIds).limit(2000);
      for (const t of (tm ?? []) as { team_id: string }[]) teamReach.set(t.team_id, (teamReach.get(t.team_id) ?? 0) + 1);
    }
    for (const r of rows) {
      const n = r.target_kind === "event" ? evReach.get(r.target_id) ?? 0
        : r.target_kind === "team" ? teamReach.get(r.target_id) ?? 0 : 0;
      reachTotal += n;
      reachRows.push({ id: r.id, kindLabelText: `${r.label} · ${r.target_kind}`, bucket: formatMilestoneBucket(n) });
    }
  }
  const reachBucket = formatMilestoneBucket(reachTotal);

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <PageHeader
        kicker={`Business · ${kindLabel(b.kind)}`}
        title={b.name}
        sub={`${TIER_LABEL[b.verification_level] ?? b.verification_level} · ${BUSINESS_STATUS_LABEL[b.status] ?? b.status}${b.published ? " · Listed" : " · Unlisted"}`}
      />

      {draft ? (
        <div className="mt-5 rounded-2xl border border-warning/30 bg-tint-warning px-4 py-3 text-sm text-ink">
          <span className="font-semibold">Awaiting review.</span> Klimr checks new businesses before they can go live —
          keep building the profile meanwhile.
        </div>
      ) : null}

      <div className="mt-6 grid items-start gap-4 sm:grid-cols-2">
        {canManage ? (
          <div className="rounded-2xl border border-rule bg-surface p-4 shadow-e1">
            <p className="kicker mb-2 flex items-center gap-1.5"><BadgeCheck size={14} /> Listing</p>
            <p className="text-sm text-mute">
              {b.published ? "Listed — visible wherever businesses appear." : "Unlisted — only your team can see this profile."}
              {draft ? " Listing takes effect once the review approves this business." : ""}
            </p>
            <form action={setBusinessPublished} className="mt-3">
              <input type="hidden" name="businessId" value={b.id} />
              <input type="hidden" name="published" value={b.published ? "false" : "true"} />
              <button className="press rounded-full border border-rule bg-surface px-4 py-2 text-sm font-semibold text-ink hover:border-faint">
                {b.published ? "Unlist" : "List this business"}
              </button>
            </form>
          </div>
        ) : null}

        <div className="rounded-2xl border border-rule bg-surface p-4 shadow-e1">
          <p className="kicker mb-2 flex items-center gap-1.5"><TrendingUp size={14} /> Verified reach</p>
          {rows.length === 0 ? (
            <p className="text-sm text-mute">
              Reach appears once sponsorships are active — head to{" "}
              <span className="inline-flex items-center gap-1 font-semibold text-ink"><ShieldCheck size={13} /> Sponsorships</span>.
            </p>
          ) : reachBucket ? (
            <p className="font-display text-3xl font-bold text-ink">{reachBucket}</p>
          ) : (
            <p className="text-sm text-mute">Growing — milestones appear from 100 verified.</p>
          )}
          <p className="mt-1 text-[11.5px] leading-snug text-mute">
            People verified at your sponsored events — court-checked, not claimed. Klimr shows milestones, not raw counts.
          </p>
          {reachRows.some((r) => r.bucket) ? (
            <ul className="mt-2.5 space-y-1 border-t border-rule pt-2.5">
              {reachRows.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate capitalize text-mute">{r.kindLabelText}</span>
                  <span className="shrink-0 font-mono font-bold text-ink">{r.bucket ?? "—"}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}
