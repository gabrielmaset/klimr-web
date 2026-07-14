"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/** History-aware back: returns to wherever the visitor came from (Players,
 *  Network, feed, a team page…), with /players as the cold-load fallback. */
export function BackPill({ label = "Players", fallback = "/players" }: { label?: string; fallback?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) router.back();
        else router.push(fallback);
      }}
      className="press inline-flex items-center gap-1.5 rounded-full border border-rule-2 bg-surface px-3.5 py-2 text-[13px] font-semibold text-ink-soft transition-colors hover:text-ink"
    >
      <ArrowLeft size={14} /> {label}
    </button>
  );
}
