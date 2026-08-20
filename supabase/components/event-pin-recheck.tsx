"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Loader2, ChevronDown } from "lucide-react";
import { recheckEventPin } from "@/app/events/actions";
import { recheckTournamentPin } from "@/app/tournaments/actions";

/** Organizer tool: re-run the pin resolution ladder on demand and SHOW the
 *  step-by-step trace — which link was walked, what Google answered, which
 *  rung finally produced coordinates. Turns "the map is wrong" into an exact,
 *  reportable diagnosis. */
export function EventPinRecheck({ kind, targetId }: { kind: "event" | "tournament"; targetId: string }) {
  const [result, setResult] = useState<{ ok: boolean; source: string | null; lat: number | null; lng: number | null; trace: string[] } | null>(null);
  const [showTrace, setShowTrace] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  const run = () => {
    if (pending) return;
    start(async () => {
      const res = kind === "tournament" ? await recheckTournamentPin(targetId) : await recheckEventPin(targetId);
      setResult(res);
      setShowTrace(!res.ok || res.source === "venue" || res.source === "zip");
      if (res.ok) router.refresh();
    });
  };

  const sourceLabel =
    result?.source === "link"
      ? "your Google Maps link (exact pin)"
      : result?.source === "place"
        ? "the venue picker (exact pin)"
        : result?.source === "zip"
          ? "the ZIP centroid (approximate)"
          : result?.source === "venue"
            ? "the venue text (approximate)"
            : null;

  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={run}
        className="press inline-flex items-center gap-1.5 rounded-[10px] border border-rule-2 bg-surface px-3 py-2 text-xs font-semibold text-ink-soft hover:text-ink"
      >
        {pending ? <Loader2 size={13} className="animate-spin" /> : <MapPin size={13} />}
        Re-check map pin
      </button>

      {result ? (
        <div className="mt-2 rounded-[10px] border border-rule-soft bg-bg px-3 py-2">
          <p className={`text-xs font-semibold ${result.ok ? "text-ink" : "text-danger"}`}>
            {result.ok
              ? `Pinned from ${sourceLabel} · ${result.lat?.toFixed(4)}, ${result.lng?.toFixed(4)}`
              : "Couldn't resolve a pin — the map falls back to the venue text."}
          </p>
          {result.trace.length ? (
            <>
              <button
                type="button"
                onClick={() => setShowTrace((v) => !v)}
                className="mt-1 inline-flex items-center gap-1 font-mono text-floor font-semibold uppercase tracking-[0.14em] text-faint hover:text-mute"
              >
                <ChevronDown size={10} className={`transition-transform ${showTrace ? "rotate-180" : ""}`} />
                Resolution steps
              </button>
              {showTrace ? (
                <ol className="mt-1.5 max-h-44 space-y-1 overflow-y-auto">
                  {result.trace.map((line, i) => (
                    <li key={i} className="break-all font-mono text-[10px] leading-snug text-mute">
                      {i + 1}. {line}
                    </li>
                  ))}
                </ol>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
