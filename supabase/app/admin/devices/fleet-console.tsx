"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Activity, RadioTower, CalendarDays, Layers, Power, RefreshCw } from "lucide-react";
import {
  fetchFleetMetrics,
  fetchFleetDetail,
  forceEndSession,
  type FleetMetrics,
  type FleetRow,
  type MetricKey,
} from "./actions";

const POLL_MS = 15_000;
const nowMs = () => Date.now();

const TILES: { key: MetricKey; label: string; field: keyof FleetMetrics; hint: string; Icon: typeof Activity }[] = [
  { key: "registered", label: "Live queues", field: "registered_queues", hint: "Sessions that exist right now and have not been ended.", Icon: Layers },
  { key: "standalone", label: "Standalone", field: "standalone_queues", hint: "Queues run on their own, not attached to an event.", Icon: RadioTower },
  { key: "events", label: "From events", field: "event_queues", hint: "Queues created from an event.", Icon: CalendarDays },
  { key: "instances", label: "Live instances", field: "live_instances", hint: "Courtside displays connected right now — seen in the last 45 seconds.", Icon: Activity },
  { key: "playing", label: "Running live play", field: "running_live_play", hint: "A team is waiting or a match is in progress. This is the number that means a venue is working.", Icon: Activity },
];

export function FleetConsole({ initial }: { initial: FleetMetrics | null }) {
  const [m, setM] = useState<FleetMetrics | null>(initial);
  const [open, setOpen] = useState<MetricKey | null>(null);
  const [rows, setRows] = useState<FleetRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number>(nowMs());
  const [pending, startTransition] = useTransition();

  const refresh = useCallback(async () => {
    const next = await fetchFleetMetrics();
    if (next) {
      setM(next);
      setUpdatedAt(nowMs());
    }
  }, []);

  // Near-real-time by polling: a 15s cadence against a 45s presence window
  // keeps the numbers inside the 30s freshness target without a socket.
  useEffect(() => {
    const t = setInterval(() => void refresh(), POLL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);

  const loadDetail = useCallback(async (key: MetricKey) => {
    setLoadingRows(true);
    setRows(await fetchFleetDetail(key));
    setLoadingRows(false);
  }, []);

  const toggle = (key: MetricKey) => {
    if (open === key) {
      setOpen(null);
      setRows([]);
      return;
    }
    setOpen(key);
    void loadDetail(key);
  };

  const end = (sessionId: string) => {
    startTransition(async () => {
      await forceEndSession(sessionId);
      await refresh();
      if (open) await loadDetail(open);
    });
  };

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {TILES.map(({ key, label, field, hint, Icon }) => {
          const active = open === key;
          const value = m?.[field] ?? 0;
          return (
            <button
              type="button"
              key={key}
              onClick={() => toggle(key)}
              aria-expanded={active}
              className={`rounded-xl border p-4 text-left transition-colors ${
                active ? "border-brand bg-tint-brand/40" : "border-rule bg-surface hover:border-rule-2"
              }`}
            >
              <span className="flex items-center gap-1.5 font-mono text-micro uppercase tracking-[0.12em] text-mute">
                <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
              </span>
              <span className="mt-1 block text-3xl font-semibold text-ink">{value}</span>
              <span className="mt-1.5 block text-xs leading-relaxed text-mute">{hint}</span>
            </button>
          );
        })}
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-xs text-mute">
        <RefreshCw className="h-3 w-3" aria-hidden />
        Refreshes every {POLL_MS / 1000}s · last updated {new Date(updatedAt).toLocaleTimeString("en-US")} · tap a
        number to see and manage the sessions behind it.
      </p>

      {open ? (
        <section className="mt-6" aria-live="polite">
          <h2 className="font-athletic text-lg uppercase tracking-wide text-ink">
            {TILES.find((t) => t.key === open)?.label}
          </h2>
          <div className="mt-3 overflow-hidden rounded-xl border border-rule bg-surface">
            {loadingRows ? (
              <p className="px-4 py-6 text-sm text-mute">Loading…</p>
            ) : rows.length === 0 ? (
              <p className="px-4 py-6 text-sm text-mute">Nothing in this bucket right now.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-rule bg-bg/50">
                    <tr className="font-mono text-micro uppercase tracking-[0.12em] text-mute">
                      <th className="px-4 py-2.5">Session</th>
                      <th className="px-4 py-2.5">Source</th>
                      <th className="px-4 py-2.5">Displays</th>
                      <th className="px-4 py-2.5">Waiting</th>
                      <th className="px-4 py-2.5">Live</th>
                      <th className="px-4 py-2.5">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.session_id} className="border-b border-rule/60 last:border-0">
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-ink">{r.title || "Untitled session"}</div>
                          <div className="font-mono text-micro text-mute">
                            {r.code ?? "—"} · started {new Date(r.created_at).toLocaleString("en-US")}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 capitalize text-ink-soft">{r.source}</td>
                        <td className="px-4 py-2.5 tabular-nums text-ink-soft">{r.live_devices}</td>
                        <td className="px-4 py-2.5 tabular-nums text-ink-soft">{r.waiting_teams}</td>
                        <td className="px-4 py-2.5 tabular-nums text-ink-soft">{r.live_matches}</td>
                        <td className="px-4 py-2.5">
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => {
                              if (
                                window.confirm(
                                  `End "${r.title || "this session"}"? Play state clears and attached displays stop reporting. The join code survives, so the organizer can start a fresh session.`,
                                )
                              )
                                end(r.session_id);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E4B8B8] bg-[#FBEAEA] px-2.5 py-1.5 text-xs font-semibold text-[#8A1B1B] hover:bg-[#f7dcdc] disabled:opacity-50"
                          >
                            <Power className="h-3.5 w-3.5" aria-hidden /> Force end
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
