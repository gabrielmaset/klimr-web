"use client";

import { useState } from "react";
import { LayoutGrid, Trophy } from "lucide-react";

/* Splits the pools-knockout view into two tabs so the page stays clean: the
 * Groups tab holds every division's pools, the Brackets tab holds the knockouts.
 * Both subtrees are server-rendered and passed in as props. */
export function BracketsTabs({ groups, brackets }: { groups: React.ReactNode; brackets: React.ReactNode }) {
  const [tab, setTab] = useState<"groups" | "brackets">("groups");
  return (
    <div>
      <div className="mb-5 inline-flex rounded-full border border-rule bg-surface p-1">
        <button
          type="button"
          onClick={() => setTab("groups")}
          className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition ${tab === "groups" ? "bg-ink text-surface" : "text-mute hover:text-ink"}`}
        >
          <LayoutGrid size={15} /> Groups
        </button>
        <button
          type="button"
          onClick={() => setTab("brackets")}
          className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition ${tab === "brackets" ? "bg-ink text-surface" : "text-mute hover:text-ink"}`}
        >
          <Trophy size={15} /> Brackets
        </button>
      </div>
      <div className={tab === "groups" ? "" : "hidden"}>{groups}</div>
      <div className={tab === "brackets" ? "" : "hidden"}>{brackets}</div>
    </div>
  );
}
