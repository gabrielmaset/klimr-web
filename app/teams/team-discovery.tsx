"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Search, Users, ChevronRight, Loader2, Check } from "lucide-react";
import { searchTeams } from "./actions";
import type { TeamCard } from "./types";
import { SPORTS, sportMeta } from "@/lib/sports";
import { TeamCrest } from "@/components/team-crest";

export function TeamDiscovery({
  initial,
  initialSport = null,
  initialSpots = null,
  initialQ = null,
}: {
  initial: TeamCard[];
  initialSport?: string | null;
  initialSpots?: number | null;
  initialQ?: string | null;
}) {
  const [q, setQ] = useState(initialQ ?? "");
  const [list, setList] = useState<TeamCard[]>(initial);
  const [sport, setSport] = useState<string>(initialSport ?? "all");
  const [spots, setSpots] = useState<number>(initialSpots ?? 0);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const reqId = useRef(0);
  const mounted = useRef(false);

  useEffect(() => {
    const term = q.trim();
    // Don't refetch on mount — the server already applied the URL filters.
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const id = ++reqId.current;
    const t = setTimeout(
      async () => {
        if (id === reqId.current) setLoading(true);
        const r = await searchTeams(term, { sport: sport === "all" ? null : sport });
        if (id === reqId.current) {
          setList(r);
          setLoading(false);
        }
      },
      term ? 220 : 0,
    );
    return () => clearTimeout(t);
  }, [q, sport]);

  // URL SYNC (lib/filter-params vocabulary): the address bar always reflects
  // the active filters, so any moment of this page is shareable and the AI's
  // deep links and the on-page controls stay one system. /teams owns exactly
  // sport/spots/q — built fresh each time, replace() keeps history clean.
  const urlMounted = useRef(false);
  useEffect(() => {
    if (!urlMounted.current) {
      urlMounted.current = true;
      return;
    }
    const p = new URLSearchParams();
    if (sport !== "all") p.set("sport", sport);
    if (spots > 0) p.set("spots", String(spots));
    const term = q.trim();
    if (term) p.set("q", term);
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [q, sport, spots, pathname, router]);

  const openingsOf = (t: TeamCard) => (t.maxSize != null ? Math.max(0, t.maxSize - t.memberCount) : null);
  const bySport = sport === "all" ? list : list.filter((t) => t.sport_key === sport);
  // Unknown-cap teams can't prove open spots — excluded only when the user
  // asked for openings (same rule as the AI teams tool).
  const filtered = spots > 0 ? bySport.filter((t) => { const o = openingsOf(t); return o != null && o >= spots; }) : bySport;
  // The full catalog, always: with server-side sport narrowing, deriving chips
  // from the visible list would hide every other sport after one click.
  const presentSports = SPORTS;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search teams by name or area…"
            className="w-full rounded-[10px] border border-rule-2 bg-surface py-2.5 pl-10 pr-10 text-sm text-ink outline-none transition-colors focus:border-brand focus:ring-4 focus:ring-brand/15"
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
                className={`press rounded-[9px] border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  active ? "border-ink bg-ink text-surface" : "border-rule bg-surface text-mute hover:text-ink"
                }`}
              >
                {s.name}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Open-spots filter — mirrors the AI tool's open_spots_min concept. */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">Open spots</span>
        {[
          { v: 0, label: "Any" },
          { v: 1, label: "1+" },
          { v: 2, label: "2+" },
          { v: 3, label: "3+" },
        ].map((o) => {
          const active = spots === o.v;
          return (
            <button
              key={o.v}
              type="button"
              onClick={() => setSpots(o.v)}
              className={`press rounded-[9px] border px-2.5 py-1 text-xs font-semibold transition-colors ${
                active ? "border-ink bg-ink text-surface" : "border-rule bg-surface text-mute hover:text-ink"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-rule bg-bg/40 px-4 py-10 text-center text-sm text-mute">
          {q.trim()
            ? `No teams match “${q.trim()}”.`
            : spots > 0
              ? `No teams with ${spots}+ open spot${spots === 1 ? "" : "s"} right now — try Any.`
              : "No teams near you yet — be the first to start one above."}
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
