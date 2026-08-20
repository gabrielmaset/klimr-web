"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { FilterGroup } from "@/components/filter-chips";
import { searchCourts, type CourtHit } from "@/app/play/court-actions";

type Props = {
  nearby: CourtHit[];
  counts: Record<string, number>;
  total: number;
  activeSport: string | null;
  activeCourt: { id: string; name: string } | null;
};

function qs(sport: string | null, court: string | null) {
  const parts = [sport ? `sport=${sport}` : null, court ? `court=${court}` : null].filter(Boolean);
  return parts.length ? `?${parts.join("&")}` : "";
}

function Row({ href, active, name, sub, count }: { href: string; active: boolean; name: string; sub?: string | null; count: number }) {
  return (
    <Link href={href} scroll={false} aria-current={active ? "true" : undefined} className="press flex h-9 w-full items-center gap-2.5 rounded-lg px-2 text-left transition-colors hover:bg-bg">
      <span className={`grid h-[15px] w-[15px] shrink-0 place-items-center rounded-full border transition-colors ${active ? "border-ink" : "border-[#CDC3AE]"} bg-surface`}>
        {active ? <span className="h-[7px] w-[7px] rounded-full bg-ink" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[13px] leading-tight ${active ? "font-semibold text-ink" : "font-medium text-ink-soft"}`}>{name}</span>
        {sub ? <span className="block truncate text-[10.5px] leading-tight text-faint">{sub}</span> : null}
      </span>
      <span className={`shrink-0 font-mono text-[10px] font-bold ${count > 0 ? "text-ink" : "text-faint"}`}>{count}</span>
    </Link>
  );
}

/** Court filter for Play: defaults to courts near the member's home ZIP
 *  (zeros included — checking a quiet court is the point), searchable by
 *  court name, city, or ZIP to reach any court anywhere. */
export function PlayCourtFilter({ nearby, counts, total, activeSport, activeCourt }: Props) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<CourtHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const query = q.trim();
      if (query.length < 2) {
        setHits(null);
        setSearching(false);
        return;
      }
      setSearching(true);
      void searchCourts(query, activeSport).then((r) => {
        setHits(r);
        setSearching(false);
      });
    }, 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q, activeSport]);

  const list = hits ?? nearby;
  const pinActive = activeCourt && !list.some((c) => c.id === activeCourt.id);

  return (
    <FilterGroup
      label="Court"
      className="min-w-[280px] max-w-md flex-[1.3]"
      pinned={
        <>
          <Row href={`/play${qs(activeSport, null)}`} active={!activeCourt} name="All courts" sub="near you" count={total} />
          {pinActive ? (
            <Row href={`/play${qs(activeSport, activeCourt!.id)}`} active name={activeCourt!.name} count={counts[activeCourt!.id] ?? 0} />
          ) : null}
        </>
      }
      footer={
        <label className="relative block">
          {searching ? (
            <Loader2 size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 animate-spin text-faint" />
          ) : (
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
          )}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search any court — name, city, or ZIP"
            aria-label="Search courts by name, city, or ZIP"
            className="h-8 w-full rounded-[10px] border border-rule-2 bg-surface pl-7.5 pr-2.5 text-xs text-ink outline-none placeholder:text-faint focus:border-brand"
            style={{ paddingLeft: 30 }}
          />
        </label>
      }
    >
      {list.map((c) => (
        <Row
          key={c.id}
          href={`/play${qs(activeSport, c.id)}`}
          active={activeCourt?.id === c.id}
          name={c.name}
          sub={[c.city, c.state].filter(Boolean).join(", ") + (c.distanceMi != null ? ` · ${c.distanceMi} mi` : "")}
          count={counts[c.id] ?? 0}
        />
      ))}
      {hits && hits.length === 0 && !searching ? <p className="px-2 py-2 text-xs text-faint">No courts match &ldquo;{q.trim()}&rdquo;.</p> : null}
    </FilterGroup>
  );
}
