"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { setPresenceMode } from "@/app/account/presence-actions";
import type { PresenceMode } from "@/app/account/presence";

const OPTS: { mode: PresenceMode; dot: string; label: string; sub: string }[] = [
  { mode: "auto", dot: "#16a34a", label: "Automatic", sub: "Online while you're active, away when idle. Recommended." },
  { mode: "online", dot: "#16a34a", label: "Always online", sub: "Always show the green dot while signed in." },
  { mode: "away", dot: "#f59e0b", label: "Away", sub: "Always show the amber dot." },
  { mode: "offline", dot: "#a1a1aa", label: "Appear offline", sub: "Browse privately — others won't see a status dot." },
];

export function PresenceControl({ initialMode }: { initialMode: PresenceMode }) {
  const [mode, setMode] = useState<PresenceMode>(initialMode);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function pick(m: PresenceMode) {
    if (m === mode) return;
    setMode(m);
    setSaved(false);
    startTransition(async () => {
      const r = await setPresenceMode(m);
      if (r.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    });
  }

  return (
    <div className="space-y-2">
      {OPTS.map((o) => {
        const sel = o.mode === mode;
        return (
          <button
            key={o.mode}
            type="button"
            onClick={() => pick(o.mode)}
            aria-pressed={sel}
            className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors ${sel ? "border-brand bg-tint-brand" : "border-rule bg-surface hover:bg-bg"}`}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: o.dot }} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink">{o.label}</span>
              <span className="block text-xs text-mute">{o.sub}</span>
            </span>
            {sel ? <Check size={16} className="shrink-0 text-brand-deep" /> : null}
          </button>
        );
      })}
      <p className="h-4 px-1 text-xs text-mute" aria-live="polite">{pending ? "Saving…" : saved ? "Saved" : ""}</p>
    </div>
  );
}
