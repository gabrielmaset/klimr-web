import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin";
import { resolveReport } from "../actions";

export const metadata = { title: "Reports · Admin" };

type ReportRow = {
  id: string;
  reporter_id: string;
  reported_id: string;
  reason: string;
  context: string | null;
  status: string;
  resolution: string | null;
  created_at: string;
};
type Prof = { id: string; display_name: string };

const REASON: Record<string, string> = {
  harassment: "Harassment or bullying",
  cheating: "Cheating / false results",
  no_show: "No-show",
  inappropriate: "Inappropriate behavior",
  fake_profile: "Fake profile",
  other: "Something else",
};
const STATUS_TONE: Record<string, string> = {
  open: "var(--color-brand-deep)",
  reviewing: "var(--color-warning)",
  actioned: "var(--color-success)",
  dismissed: "var(--color-mute)",
};
const RANK: Record<string, number> = { open: 0, reviewing: 1, actioned: 2, dismissed: 3 };

export default async function AdminReports() {
  await requireAdmin("support");
  const admin = createAdminClient();

  const { data: reportRows } = await admin
    .from("reports")
    .select("id, reporter_id, reported_id, reason, context, status, resolution, created_at")
    .order("created_at", { ascending: false })
    .limit(80);
  const reports = ((reportRows as ReportRow[] | null) ?? []).sort(
    (a, b) => (RANK[a.status] ?? 9) - (RANK[b.status] ?? 9),
  );

  const ids = [...new Set(reports.flatMap((r) => [r.reporter_id, r.reported_id]))];
  const profMap = new Map<string, Prof>();
  if (ids.length) {
    const { data: profs } = await admin.from("profiles").select("id, display_name").in("id", ids);
    for (const p of (profs as Prof[] | null) ?? []) profMap.set(p.id, p);
  }
  const nameOf = (id: string) => profMap.get(id)?.display_name || "Unknown";

  return (
    <div>
      {reports.length === 0 ? (
        <div className="rounded-2xl border border-rule bg-surface shadow-e1 p-10 text-center text-sm text-mute">
          No reports. Quiet is good.
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => (
            <div key={r.id} className="rounded-2xl border border-rule bg-surface shadow-e1 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-display text-lg text-ink">{REASON[r.reason] ?? r.reason}</span>
                    <span className="kicker rounded-full px-2 py-0.5 text-[9px]" style={{ background: "var(--color-bg)", color: STATUS_TONE[r.status] ?? "var(--color-mute)" }}>
                      {r.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-mute">
                    <Link href={`/admin/users/${r.reporter_id}`} className="font-semibold text-ink hover:text-brand-deep">{nameOf(r.reporter_id)}</Link>
                    {" reported "}
                    <Link href={`/admin/users/${r.reported_id}`} className="font-semibold text-ink hover:text-brand-deep">{nameOf(r.reported_id)}</Link>
                    {" · "}
                    {new Date(r.created_at).toLocaleString("en-US")}
                  </p>
                  {r.context ? <p className="mt-2 max-w-2xl rounded-xl bg-bg px-3 py-2 text-sm text-ink">{r.context}</p> : null}
                  {r.resolution ? <p className="mt-2 text-xs text-faint">Resolution: {r.resolution}</p> : null}
                </div>
                <Link href={`/admin/users/${r.reported_id}`} className="press shrink-0 rounded-full border border-rule px-3 py-1.5 text-sm font-semibold text-ink transition-colors hover:border-faint">
                  Review user →
                </Link>
              </div>

              <form action={resolveReport} className="mt-4 flex flex-wrap items-center gap-2 border-t border-rule pt-3">
                <input type="hidden" name="reportId" value={r.id} />
                <select name="status" defaultValue={r.status === "open" ? "reviewing" : r.status} className="rounded-xl border border-rule bg-surface shadow-e1 px-3 py-2 text-sm text-ink outline-none focus:border-brand">
                  <option value="reviewing">Reviewing</option>
                  <option value="actioned">Action taken</option>
                  <option value="dismissed">Dismiss</option>
                </select>
                <input name="resolution" defaultValue={r.resolution ?? ""} placeholder="Resolution note (optional)" className="min-w-0 flex-1 rounded-xl border border-rule bg-surface shadow-e1 px-3 py-2 text-sm text-ink outline-none focus:border-brand" />
                <button className="press rounded-full bg-ink px-4 py-2 text-sm font-semibold text-surface transition-colors hover:bg-ink-soft">Save</button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
