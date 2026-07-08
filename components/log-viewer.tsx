"use client";

import { useEffect, useState } from "react";
import { Download, Trash2, RefreshCw, CircleAlert, TriangleAlert, Info } from "lucide-react";
import { logger, type LogEntry } from "@/lib/logger";

const LEVEL = {
  error: { Icon: CircleAlert, cls: "text-brand-deep", tint: "bg-tint-brand" },
  warn: { Icon: TriangleAlert, cls: "text-[#b45309]", tint: "bg-[#fffbeb]" },
  info: { Icon: Info, cls: "text-mute", tint: "bg-bg" },
} as const;

export function LogViewer() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setEntries(logger.getAll().slice().reverse());
      setLoaded(true);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  function refresh() {
    setEntries(logger.getAll().slice().reverse());
  }

  function clear() {
    logger.clear();
    setEntries([]);
  }

  function download() {
    const blob = new Blob([logger.export()], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const a = document.createElement("a");
    a.href = url;
    a.download = `klimr-log-${stamp}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const errors = entries.filter((e) => e.level === "error").length;
  const warns = entries.filter((e) => e.level === "warn").length;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={download}
          disabled={entries.length === 0}
          className="press inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-surface transition-colors hover:bg-ink-soft disabled:opacity-50"
        >
          <Download size={15} /> Download log file
        </button>
        <button onClick={refresh} className="press inline-flex items-center gap-1.5 rounded-full border border-rule bg-surface px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-bg">
          <RefreshCw size={15} className="text-mute" /> Refresh
        </button>
        <button
          onClick={clear}
          disabled={entries.length === 0}
          className="press inline-flex items-center gap-1.5 rounded-full border border-rule bg-surface px-4 py-2 text-sm font-semibold text-mute transition-colors hover:text-brand-deep disabled:opacity-50"
        >
          <Trash2 size={15} /> Clear
        </button>
      </div>

      <p className="mt-3 text-xs text-faint">
        {loaded ? `${entries.length} entries · ${errors} errors · ${warns} warnings` : "Loading…"}
      </p>

      <div className="mt-3 space-y-2">
        {loaded && entries.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-rule bg-bg/40 px-4 py-10 text-center text-sm text-mute">
            No warnings or errors logged. That&rsquo;s a good thing.
          </p>
        ) : (
          entries.map((e, i) => {
            const meta = LEVEL[e.level];
            return (
              <div key={`${e.t}-${i}`} className="rounded-2xl border border-rule bg-surface shadow-e1 p-3.5">
                <div className="flex items-center gap-2">
                  <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg ${meta.tint} ${meta.cls}`}>
                    <meta.Icon size={13} />
                  </span>
                  <span className={`text-xs font-bold uppercase tracking-wide ${meta.cls}`}>{e.level}</span>
                  <span className="ml-auto text-[11px] text-faint">{new Date(e.t).toLocaleString()}</span>
                </div>
                <p className="mt-1.5 break-words text-sm text-ink">{e.msg}</p>
                {e.url ? <p className="mt-0.5 text-[11px] text-faint">{e.url}</p> : null}
                {e.detail ? (
                  <details className="mt-1.5">
                    <summary className="cursor-pointer text-xs font-medium text-mute hover:text-ink">Details</summary>
                    <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-bg/60 p-2 text-[11px] leading-relaxed text-ink-soft">{e.detail}</pre>
                  </details>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
