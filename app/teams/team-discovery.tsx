"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, Users, ChevronRight, Loader2, Check } from "lucide-react";
import { searchTeams } from "./actions";
import type { TeamCard } from "./types";
import { SPORTS, sportMeta } from "@/lib/sports";
import { TeamCrest } from "@/components/team-crest";

export function TeamDiscovery({ initial }: { initial: TeamCard[] }) {
  const [q, setQ] = useState("");
  const [list, setList] = useState<TeamCard[]>(initial);
  const [sport, setSport] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const reqId = useRef(0);
  const mounted = useRef(false);

  useEffect(() => {
    const term = q.trim();
    // Don't refetch on mount — the server already gave us the nearby list.
    if (!mounted.current) {
      mounted.current = true;
      if (!term) return;
    }
    const id = ++reqId.current;
    const t = setTimeout(
      async () => {
        if (id === reqId.current) setLoading(true);
        const r = await searchTeams(term);
        if (id === reqId.current) {
          setList(r);
          setLoading(false);
        }
      },
      term ? 220 : 0,
    );
    return () => clearTimeout(t);
  }, [q]);

  const filtered = sport === "all" ? list : list.filter((t) => t.sport_key === sport);
  // Only offer filter chips for sports that actually appear in the current list.
  const presentSports = SPORTS.filter((s) => list.some((t) => t.sport_key === s.key));

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search teams by name or area…"
            className="w-full rounded-xl border border-rule bg-surface shadow-e1 py-2.5 pl-10 pr-10 text-sm text-ink outline-none transition-colors focus:border-brand focus:ring-4 focus:ring-brand/15"
            autoComplete="off"
          />
          {loading ? <Loader2 size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-faint" /> : null}
        </div>
        <span className="hidden shrink-0 text-xs font-medium text-mute sm:block">
          {filtered.length} team{filtered.length === 1 ? "" : "s"} near you
        </span>
      </div>

      {presentSports.length > 1 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {[{ key: "all", name: "All" }, ...presentSports].map((s) => {
            const active = sport === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setSport(s.key)}
                className={`press rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  active ? "border-ink bg-ink text-surface" : "border-rule bg-surface text-mute hover:text-ink"
                }`}
              >
                {s.name}
              </button>
            );
          })}
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-rule bg-bg/40 px-4 py-10 text-center text-sm text-mute">
          {q.trim() ? `No teams match “${q.trim()}”.` : "No teams near you yet — be the first to start one above."}
        </p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => {
            const meta = sportMeta(t.sport_key);
            const place = [t.city, t.state].filter(Boolean).join(", ");
            return (
              <Link
                key={t.id}
                href={`/teams/${t.id}`}
                className="lift flex items-center gap-3 rounded-2xl border border-rule bg-surface shadow-e1 p-4"
              >
                <TeamCrest name={t.name} size={44} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate font-athletic text-[15px] text-ink">{t.name}</span>
                    {t.joined ? (
                      <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-tint-success px-1.5 py-0.5 text-[10px] font-semibold text-success">
                        <Check size={10} /> Joined
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1 text-xs text-mute">
                    <Users size={12} className="shrink-0" /> {t.memberCount} · {meta.name}
                    {place ? ` · ${place}` : ""}
                  </span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-faint" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
