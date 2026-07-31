"use client";

// Shared AI-search affordance — ONE implementation for every search surface
// (inline top bar today, command palette on its next touch). Keeping the
// Ask-row + results panel here means the two can never drift.

import { useState } from "react";
import { Sparkles, Loader2, ArrowUpRight } from "lucide-react";
import { aiSearch } from "@/app/search/ai-actions";
import type { AiSearchResult } from "@/lib/ai-search";

export type AiState = { state: "idle" | "loading" | "done" | "error"; query?: string; result?: AiSearchResult; error?: string };

export function useAiSearch() {
  const [ai, setAi] = useState<AiState>({ state: "idle" });
  const runAi = (q: string) => {
    const query = q.trim();
    if (query.length < 3 || ai.state === "loading") return;
    setAi({ state: "loading", query });
    void aiSearch(query).then((res) => {
      setAi(
        res.ok && res.result
          ? { state: "done", query, result: res.result }
          : { state: "error", query, error: res.error ?? "Try again." },
      );
    });
  };
  return { ai, runAi, resetAi: () => setAi({ state: "idle" }) };
}

export function AiAskRow({ query, hint, onRun }: { query: string; hint?: string; onRun: () => void }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onRun}
      className="mb-1 flex w-full items-center gap-3 rounded-xl border border-dashed border-[#F3C9B4] bg-[#FFF7F2] px-2.5 py-2.5 text-left text-sm font-semibold text-brand-deep transition-colors hover:bg-tint-brand"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface text-brand">
        <Sparkles size={15} />
      </span>
      <span className="min-w-0 flex-1 truncate">Ask Klimr AI — “{query}”</span>
      {hint ? (
        <kbd className="hidden shrink-0 rounded-md border border-rule bg-surface px-1.5 py-0.5 text-[10px] font-semibold text-faint sm:block">{hint}</kbd>
      ) : null}
    </button>
  );
}

export function AiPanel({ ai, onBack, go }: { ai: AiState; onBack: () => void; go: (href: string) => void }) {
  if (ai.state === "loading") {
    return (
      <p className="flex items-center gap-2 px-2.5 py-8 text-sm font-semibold text-mute">
        <Loader2 size={15} className="animate-spin" /> Asking Klimr AI…
      </p>
    );
  }
  if (ai.state === "error") {
    return <p className="px-2.5 py-8 text-sm text-mute">{ai.error}</p>;
  }
  if (ai.state !== "done" || !ai.result) return null;
  const r = ai.result;
  return (
    <div className="space-y-3 px-1 py-1.5">
      <p className="px-1.5 text-[13.5px] leading-relaxed text-ink">{r.summary}</p>
      {r.steps?.length ? (
        <ol className="space-y-1 rounded-xl border border-rule-soft bg-bg px-3.5 py-3">
          {r.steps.map((s, i) => (
            <li key={i} className="flex gap-2 text-[13px] text-ink-soft">
              <span className="font-mono text-[11px] font-bold text-brand">{i + 1}.</span> {s}
            </li>
          ))}
        </ol>
      ) : null}
      {r.groups.map((g) => (
        <div key={g.kind}>
          <p className="kicker px-1.5 pb-1 text-faint">{g.label}</p>
          {g.items.map((item) => (
            <button
              key={item.href + item.title}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => go(item.href)}
              className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-tint-brand"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">{item.title}</span>
                {item.subtitle || item.meta ? (
                  <span className="block truncate text-xs text-mute">{[item.subtitle, item.meta].filter(Boolean).join(" · ")}</span>
                ) : null}
              </span>
              <ArrowUpRight size={14} className="shrink-0 text-faint" />
            </button>
          ))}
        </div>
      ))}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onBack}
        className="press mx-1.5 mt-1 rounded-[9px] border border-rule-2 px-2.5 py-1.5 text-xs font-semibold text-mute hover:text-ink"
      >
        Back to results
      </button>
    </div>
  );
}
