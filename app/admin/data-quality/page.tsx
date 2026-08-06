import { requireAdmin } from "@/lib/admin";
import { getPrivilegedClient } from "@/lib/privileged";

export const metadata = { title: "Data quality · Admin" };

/** Data-quality scorecards (K2-06, migration 0181).
 *
 *  "AI-verified court data" is a claim in the investor materials
 *  (CLAIMS-REGISTER.md). A claim needs a number behind it that anyone can
 *  recompute — these are those numbers, read straight from the database with
 *  no smoothing. Disagreement rate in particular is deliberately unflattering:
 *  it is how often the judge changed its mind about the same venue. */
export default async function DataQualityPage() {
  await requireAdmin("support");
  const admin = getPrivilegedClient({ reason: "admin:data-quality" });

  const [{ data: courts }, { data: ranks }] = await Promise.all([
    admin.rpc("court_data_quality"),
    admin.rpc("ranking_data_quality"),
  ]);
  const c = courts?.[0];
  const r = ranks?.[0];

  return (
    <div className="mx-auto w-full max-w-page px-4 py-8">
      <h1 className="font-athletic text-3xl uppercase tracking-wide text-ink">Data quality</h1>
      <p className="mt-2 max-w-3xl text-sm text-ink-soft">
        Measured, not asserted. These figures back the &ldquo;AI-verified court data&rdquo; claim and
        the ranking freshness the product depends on. Recomputed live on each load — nothing is
        cached or smoothed.
      </p>

      <section className="mt-8">
        <h2 className="font-athletic text-lg uppercase tracking-wide text-ink">Courts intelligence</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Coverage" value={pct(c?.coverage_pct)} hint="Reached a definite verdict (confirmed or denied) rather than staying unknown." good={c?.coverage_pct != null && c.coverage_pct >= 75} />
          <Metric label="Median age" value={c?.median_age_days != null ? `${c.median_age_days} d` : "—"} hint="How old the typical verdict being served is." good={c?.median_age_days != null && c.median_age_days <= 7} />
          <Metric label="Stale" value={pct(c?.stale_pct)} hint="Older than the 7-day freshness window; these re-verify on next search." good={c?.stale_pct != null && c.stale_pct <= 25} />
          <Metric label="Disagreement" value={pct(c?.disagreement_pct)} hint="Venues whose verdict CHANGED on re-check — how often the judge is unstable. Lower is better; non-zero is normal." good={c?.disagreement_pct != null && c.disagreement_pct <= 10} />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Confirmed" value={String(c?.confirmed ?? 0)} />
          <Metric label="Denied" value={String(c?.denied ?? 0)} />
          <Metric label="Unknown" value={String(c?.unknown ?? 0)} />
          <Metric label="Evidence / verdict" value={c?.evidence_per_verdict != null ? String(c.evidence_per_verdict) : "—"} hint="Provenance records backing the average verdict. Below 1.0 means older verdicts predate evidence records." />
        </div>
        {c?.verifying_now ? (
          <p className="mt-3 text-xs text-mute">{c.verifying_now} venue(s) mid-verification right now.</p>
        ) : null}
      </section>

      <section className="mt-10">
        <h2 className="font-athletic text-lg uppercase tracking-wide text-ink">Rankings</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Hours since snapshot" value={r?.hours_since_latest != null ? `${r.hours_since_latest} h` : "—"} hint="Snapshots run nightly; over ~48 h means the job is not running." good={r?.hours_since_latest != null && r.hours_since_latest <= 48} />
          <Metric label="Latest snapshot" value={r?.latest_snapshot ?? "—"} />
          <Metric label="Players ranked" value={String(r?.players_in_latest ?? 0)} />
          <Metric label="Sports covered" value={String(r?.sports_covered ?? 0)} />
        </div>
        <p className="mt-3 text-xs text-mute">
          Snapshot history spans {r?.snapshot_days ?? 0} day(s).
        </p>
      </section>

      <p className="mt-10 max-w-3xl text-xs text-mute">
        Definitions live in <code>docs/METRICS.md</code>; the claims these support and their required
        phrasing live in <code>docs/CLAIMS-REGISTER.md</code>.
      </p>
    </div>
  );
}

function pct(v: number | null | undefined) {
  return v == null ? "—" : `${v}%`;
}

function Metric({ label, value, hint, good }: { label: string; value: string; hint?: string; good?: boolean }) {
  const tone = good === undefined ? "border-rule bg-surface" : good ? "border-rule bg-surface" : "border-[#E4B8B8] bg-[#FBEAEA]";
  return (
    <div className={`rounded-xl border p-4 ${tone}`}>
      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-mute">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-ink">{value}</div>
      {hint ? <p className="mt-1.5 text-xs leading-relaxed text-mute">{hint}</p> : null}
    </div>
  );
}
