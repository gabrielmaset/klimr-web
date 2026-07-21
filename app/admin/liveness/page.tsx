import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin";
import { runLivenessNow } from "../actions";
import { LIVENESS_LABEL, LIVENESS_TONE, OCCURRENCE_LABEL, REASON_LABEL, type LivenessStatus, type OccurrenceStatus } from "@/lib/liveness";

export const metadata = { title: "Event Pulse · Admin" };
export const dynamic = "force-dynamic";

type Flag = { key: string; enabled: boolean; note: string | null };
type EventRow = {
  id: string; title: string; sport_key: string; recurrence: string;
  liveness_shadow: string; empty_streak: number; last_alive_at: string | null; dormant_at: string | null;
};
type Transition = {
  id: string; event_id: string; scope: string; prev: string; next: string;
  reason_code: string; job_id: string | null; created_at: string;
};
type OccStat = { status: string; n: number };

const OCC_STATUSES = [
  "scheduled", "organizer_confirmed", "skipped", "cancelled", "in_progress",
  "evidence_pending", "completed_with_evidence", "completed_empty", "disputed",
] as const;

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default async function AdminLiveness() {
  await requireAdmin("admin");
  const admin = createAdminClient();

  const [{ data: flags }, { data: watched }, { data: transitions }, occRaw] = await Promise.all([
    admin.from("feature_flags").select("key, enabled, note").like("key", "event_liveness%").order("key"),
    admin
      .from("events")
      .select("id, title, sport_key, recurrence, liveness_shadow, empty_streak, last_alive_at, dormant_at")
      .neq("liveness_shadow", "active")
      .order("empty_streak", { ascending: false })
      .limit(40),
    admin
      .from("liveness_transitions")
      .select("id, event_id, scope, prev, next, reason_code, job_id, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
    Promise.all(
      OCC_STATUSES.map(async (s) => {
        const r = await admin.from("event_occurrences").select("*", { count: "exact", head: true }).eq("status", s);
        return { status: s, n: r.count ?? 0 };
      }),
    ),
  ]);

  const occStats: OccStat[] = occRaw.filter((s) => s.n > 0);

  const eventTitles = new Map(((watched ?? []) as EventRow[]).map((e) => [e.id, e.title]));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Event Pulse</h1>
          <p className="mt-1 text-sm text-mute">
            Liveness shadow mode — the job computes occurrence closes and series transitions but changes no visibility.
            Rule v1: three strikes · 18h grace · queue evidence only · walk-in guests count.
          </p>
        </div>
        <form action={runLivenessNow}>
          <button
            type="submit"
            className="rounded-full border border-line bg-ink px-4 py-2 text-sm font-semibold text-cream transition-opacity hover:opacity-85"
          >
            Run liveness job now
          </button>
        </form>
      </div>

      <section>
        <h2 className="text-xs font-bold uppercase tracking-wider text-faint">Flags</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {((flags ?? []) as Flag[]).map((f) => (
            <span
              key={f.key}
              title={f.note ?? undefined}
              className="rounded-full border border-line px-3 py-1 text-xs font-semibold"
              style={{ color: f.enabled ? "var(--color-success)" : "var(--color-mute)" }}
            >
              {f.key.replace("event_liveness_", "")} · {f.enabled ? "on" : "off"}
            </span>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xs font-bold uppercase tracking-wider text-faint">Occurrences</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {occStats.length === 0 ? (
            <p className="text-sm text-mute">None yet — run the job after applying migration 0129.</p>
          ) : (
            occStats.map((s) => (
              <span key={s.status} className="rounded-lg border border-line bg-card px-3 py-1.5 text-sm text-ink">
                {OCCURRENCE_LABEL[s.status as OccurrenceStatus] ?? s.status}: <strong>{s.n}</strong>
              </span>
            ))
          )}
        </div>
      </section>

      <section>
        <h2 className="text-xs font-bold uppercase tracking-wider text-faint">Series off active (shadow)</h2>
        {(watched ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-mute">No series in watch or dormant — the catalog is healthy.</p>
        ) : (
          <div className="mt-2 overflow-x-auto rounded-xl border border-line bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-faint">
                  <th className="px-3 py-2">Event</th>
                  <th className="px-3 py-2">Cadence</th>
                  <th className="px-3 py-2">Shadow state</th>
                  <th className="px-3 py-2">Streak</th>
                  <th className="px-3 py-2">Last alive</th>
                </tr>
              </thead>
              <tbody>
                {((watched ?? []) as EventRow[]).map((e) => (
                  <tr key={e.id} className="border-b border-line/60 last:border-0">
                    <td className="px-3 py-2">
                      <Link href={`/e/${e.id}`} className="font-semibold text-ink hover:underline">
                        {e.title}
                      </Link>{" "}
                      <span className="text-xs text-faint">{e.sport_key}</span>
                    </td>
                    <td className="px-3 py-2 text-mute">{e.recurrence}</td>
                    <td className="px-3 py-2">
                      <span className="font-semibold" style={{ color: LIVENESS_TONE[e.liveness_shadow as LivenessStatus] }}>
                        {LIVENESS_LABEL[e.liveness_shadow as LivenessStatus] ?? e.liveness_shadow}
                      </span>
                    </td>
                    <td className="px-3 py-2">{e.empty_streak}</td>
                    <td className="px-3 py-2 text-mute">{fmt(e.last_alive_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-xs font-bold uppercase tracking-wider text-faint">Recent transitions</h2>
        {(transitions ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-mute">No transitions recorded yet.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {((transitions ?? []) as Transition[]).map((t) => (
              <li key={t.id} className="rounded-lg border border-line bg-card px-3 py-2 text-sm">
                <span className="text-xs text-faint">{fmt(t.created_at)}</span>{" "}
                <span className="font-semibold text-ink">{eventTitles.get(t.event_id) ?? t.event_id.slice(0, 8)}</span>{" "}
                <span className="text-mute">
                  {t.scope} · {t.prev} → {t.next} · {REASON_LABEL[t.reason_code] ?? t.reason_code}
                </span>
                {t.job_id ? <span className="ml-1 text-xs text-faint">({t.job_id})</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
