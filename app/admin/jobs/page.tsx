import { RotateCcw } from "lucide-react";
import { requireAdmin } from "@/lib/admin";
import { getPrivilegedClient } from "@/lib/privileged";
import { replayJob } from "./actions";

export const metadata = { title: "Jobs · Admin" };

type Row = {
  id: string;
  kind: string;
  status: string;
  attempts: number;
  max_attempts: number;
  run_after: string;
  last_error: string | null;
  correlation_id: string | null;
  created_at: string;
};

const STATUS_STYLE: Record<string, string> = {
  queued: "bg-bg text-mute",
  running: "bg-[#EAF2FB] text-[#1B4F8A]",
  done: "bg-[#EAF6EC] text-[#217A34]",
  dead: "bg-[#FBEAEA] text-[#8A1B1B]",
};

/** Operator console for durable background work (K2-03).
 *  Dead-lettered jobs surface here with their last error and a replay button —
 *  the whole point of the jobs table is that failed work is visible and
 *  recoverable instead of silently lost. */
export default async function AdminJobsPage() {
  await requireAdmin("support");
  const admin = getPrivilegedClient({ reason: "admin:jobs-console" });

  const [{ data: dead }, { data: recent }, { count: queuedCount }] = await Promise.all([
    admin.from("jobs").select("id, kind, status, attempts, max_attempts, run_after, last_error, correlation_id, created_at")
      .eq("status", "dead").order("updated_at", { ascending: false }).limit(50),
    admin.from("jobs").select("id, kind, status, attempts, max_attempts, run_after, last_error, correlation_id, created_at")
      .neq("status", "dead").order("created_at", { ascending: false }).limit(50),
    admin.from("jobs").select("id", { count: "exact", head: true }).eq("status", "queued"),
  ]);

  const deadRows = (dead ?? []) as Row[];
  const recentRows = (recent ?? []) as Row[];

  return (
    <div className="mx-auto w-full max-w-page px-4 py-8">
      <h1 className="font-athletic text-3xl uppercase tracking-wide text-ink">Background jobs</h1>
      <p className="mt-2 max-w-3xl text-sm text-ink-soft">
        Durable work — courts verification and waitlist cascades. Jobs are leased to one worker at a
        time, retried with backoff, and parked here as <strong>dead</strong> when they exhaust their
        attempts. Replay puts a job back on the queue with a fresh budget.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Queued" value={String(queuedCount ?? 0)} />
        <Stat label="Dead-lettered" value={String(deadRows.length)} tone={deadRows.length > 0 ? "alert" : undefined} />
        <Stat label="Recent (50)" value={String(recentRows.length)} />
      </div>

      <Section title="Dead-lettered — needs attention">
        {deadRows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-mute">Nothing dead-lettered. Background work is healthy.</p>
        ) : (
          <JobTable rows={deadRows} replayable />
        )}
      </Section>

      <Section title="Recent jobs">
        {recentRows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-mute">No jobs yet.</p>
        ) : (
          <JobTable rows={recentRows} />
        )}
      </Section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "alert" }) {
  return (
    <div className={`rounded-xl border p-4 ${tone === "alert" ? "border-[#E4B8B8] bg-[#FBEAEA]" : "border-rule bg-surface"}`}>
      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-mute">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-ink">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-athletic text-lg uppercase tracking-wide text-ink">{title}</h2>
      <div className="mt-3 overflow-hidden rounded-xl border border-rule bg-surface">{children}</div>
    </section>
  );
}

function JobTable({ rows, replayable }: { rows: Row[]; replayable?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-rule bg-bg/50">
          <tr className="font-mono text-[10px] uppercase tracking-[0.12em] text-mute">
            <th className="px-4 py-2.5">Kind</th>
            <th className="px-4 py-2.5">Status</th>
            <th className="px-4 py-2.5">Tries</th>
            <th className="px-4 py-2.5">Next run</th>
            <th className="px-4 py-2.5">Last error</th>
            {replayable ? <th className="px-4 py-2.5">Action</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((j) => (
            <tr key={j.id} className="border-b border-rule/60 last:border-0 align-top">
              <td className="px-4 py-2.5">
                <div className="font-medium text-ink">{j.kind}</div>
                {j.correlation_id ? (
                  <div className="font-mono text-[10px] text-mute">corr {j.correlation_id.slice(0, 8)}</div>
                ) : null}
              </td>
              <td className="px-4 py-2.5">
                <span className={`inline-flex rounded-md px-1.5 py-0.5 font-mono text-floor font-bold uppercase tracking-[0.1em] ${STATUS_STYLE[j.status] ?? "bg-bg text-mute"}`}>
                  {j.status}
                </span>
              </td>
              <td className="px-4 py-2.5 tabular-nums text-ink-soft">{j.attempts}/{j.max_attempts}</td>
              <td className="px-4 py-2.5 text-ink-soft">{new Date(j.run_after).toLocaleString("en-US")}</td>
              <td className="max-w-md px-4 py-2.5 text-xs text-ink-soft">{j.last_error ?? "—"}</td>
              {replayable ? (
                <td className="px-4 py-2.5">
                  <form action={replayJob}>
                    <input type="hidden" name="id" value={j.id} />
                    <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg border border-rule bg-surface px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-bg">
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                      Replay
                    </button>
                  </form>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
