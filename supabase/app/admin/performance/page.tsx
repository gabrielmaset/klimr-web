import { requireAdmin } from "@/lib/admin";
import { getPrivilegedClient } from "@/lib/privileged";

export const metadata = { title: "Performance · Admin" };
export const dynamic = "force-dynamic";

type Row = {
  metric: string;
  budget_ms: number;
  samples: number;
  p50_ms: number | null;
  p95_ms: number | null;
  worst_ms: number | null;
  within_budget: boolean | null;
};

const LABEL: Record<string, string> = {
  queue_snapshot: "Queue snapshot (server)",
  queue_action: "Queue action",
  court_search_stored: "Court search — stored",
  court_search_live: "Court search — live",
  lcp: "Largest Contentful Paint",
  inp: "Interaction to Next Paint",
  ttfb: "Time to First Byte",
  cls: "Cumulative Layout Shift (×1000)",
};

/** Performance budgets, measured (K3-05, audit PERF-001/PERF-003).
 *
 *  The budgets are the audit's own targets and they live in SQL next to the
 *  measurement, so this page cannot drift from them. Three states, deliberately
 *  distinguished: within budget, over budget, and NOT MEASURED — an empty
 *  metric is unknown, never "passing". */
export default async function PerformancePage() {
  await requireAdmin("support");
  const admin = getPrivilegedClient({ reason: "admin:performance" });
  const { data } = await admin.rpc("perf_report", { p_hours: 24 });
  const rows = (data ?? []) as Row[];

  const measured = rows.filter((r) => r.samples > 0);
  const failing = measured.filter((r) => r.within_budget === false);

  return (
    <div className="mx-auto w-full max-w-page px-4 py-8">
      <h1 className="font-athletic text-3xl uppercase tracking-wide text-ink">Performance</h1>
      <p className="mt-2 max-w-3xl text-sm text-ink-soft">
        Real-user measurements from the last 24 hours against the audit&rsquo;s budgets. Client
        vitals are sampled at 10% of page loads; the queue snapshot is timed server-side. A metric
        with no samples reads <strong>not measured</strong> — it is not passing.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Metrics measured" value={`${measured.length} / ${rows.length}`} />
        <Stat label="Over budget" value={String(failing.length)} tone={failing.length > 0 ? "alert" : undefined} />
        <Stat label="Samples (24h)" value={String(rows.reduce((n, r) => n + Number(r.samples), 0))} />
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-rule bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-rule bg-bg/50">
              <tr className="font-mono text-micro uppercase tracking-[0.12em] text-mute">
                <th className="px-4 py-2.5">Metric</th>
                <th className="px-4 py-2.5">Budget</th>
                <th className="px-4 py-2.5">p50</th>
                <th className="px-4 py-2.5">p95</th>
                <th className="px-4 py-2.5">Worst</th>
                <th className="px-4 py-2.5">Samples</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.metric} className="border-b border-rule/60 last:border-0">
                  <td className="px-4 py-2.5 font-medium text-ink">{LABEL[r.metric] ?? r.metric}</td>
                  <td className="px-4 py-2.5 tabular-nums text-mute">{r.budget_ms} ms</td>
                  <td className="px-4 py-2.5 tabular-nums text-ink-soft">{r.p50_ms ?? "—"}</td>
                  <td className="px-4 py-2.5 tabular-nums font-semibold text-ink">{r.p95_ms ?? "—"}</td>
                  <td className="px-4 py-2.5 tabular-nums text-mute">{r.worst_ms ?? "—"}</td>
                  <td className="px-4 py-2.5 tabular-nums text-mute">{r.samples}</td>
                  <td className="px-4 py-2.5">
                    {r.within_budget === null ? (
                      <span className="inline-flex rounded-md bg-bg px-1.5 py-0.5 font-mono text-micro font-bold tracking-[0.1em] text-mute">NOT MEASURED</span>
                    ) : r.within_budget ? (
                      <span className="inline-flex rounded-md bg-[#EAF6EC] px-1.5 py-0.5 font-mono text-micro font-bold tracking-[0.1em] text-[#217A34]">WITHIN</span>
                    ) : (
                      <span className="inline-flex rounded-md bg-[#FBEAEA] px-1.5 py-0.5 font-mono text-micro font-bold tracking-[0.1em] text-[#8A1B1B]">OVER</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-4 max-w-3xl text-xs text-mute">
        Budgets are defined in migration 0186 alongside the percentile query, so this page and the
        targets cannot drift. Samples are retained 14 days. Definitions and the July responsiveness
        pass are in <code>docs/PERFORMANCE.md</code>.
      </p>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "alert" }) {
  return (
    <div className={`rounded-xl border p-4 ${tone === "alert" ? "border-[#E4B8B8] bg-[#FBEAEA]" : "border-rule bg-surface"}`}>
      <div className="font-mono text-micro uppercase tracking-[0.12em] text-mute">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-ink">{value}</div>
    </div>
  );
}
