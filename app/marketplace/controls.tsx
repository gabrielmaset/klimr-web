"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { SPORTS } from "@/lib/sports";

const SORTS: [string, string][] = [
  ["new", "Newest"],
  ["price_asc", "Price: Low to High"],
  ["price_desc", "Price: High to Low"],
];
const CATEGORIES: [string, string][] = [
  ["", "All categories"],
  ["racquet", "Racquets"],
  ["paddle", "Paddles"],
  ["bag", "Bags"],
  ["shoes", "Shoes"],
  ["balls", "Balls"],
  ["accessory", "Accessories"],
];
const CONDITIONS: [string, string][] = [
  ["", "Any condition"],
  ["new", "New"],
  ["like_new", "Like new"],
  ["good", "Good"],
  ["fair", "Fair"],
];

const selectCls =
  "rounded-lg border border-rule bg-surface px-2.5 py-1.5 text-xs font-semibold text-ink outline-none focus:border-brand";

export function MarketplaceControls({
  kind,
  q,
  sort,
  sport,
  category,
  condition,
  location,
  locations,
}: {
  kind: string;
  q: string;
  sort: string;
  sport: string;
  category: string;
  condition: string;
  location: string;
  locations: string[];
}) {
  const router = useRouter();
  const [text, setText] = useState(q);

  const go = (patch: Record<string, string>) => {
    const merged: Record<string, string> = { tab: kind, q: text, sort, sport, category, condition, location, ...patch };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v && !(k === "sort" && v === "new")) p.set(k, v);
    }
    p.set("tab", kind);
    router.push(`/marketplace?${p.toString()}`);
  };

  return (
    <div className="mb-5 space-y-2.5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go({ q: text });
        }}
        className="relative"
      >
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={kind === "coaching" ? "Search coaches…" : "Search gear…"}
          className="w-full rounded-xl border border-rule bg-surface shadow-e1 py-2.5 pl-9 pr-3 text-sm text-ink outline-none focus:border-brand"
          aria-label="Search listings"
        />
      </form>

      <div className="flex flex-wrap gap-2">
        <select value={sort} onChange={(e) => go({ sort: e.target.value })} className={selectCls} aria-label="Sort">
          {SORTS.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <select value={sport} onChange={(e) => go({ sport: e.target.value })} className={selectCls} aria-label="Sport">
          <option value="">All sports</option>
          {SPORTS.map((s) => (
            <option key={s.key} value={s.key}>{s.emoji} {s.name}</option>
          ))}
        </select>
        {locations.length > 0 ? (
          <select value={location} onChange={(e) => go({ location: e.target.value })} className={selectCls} aria-label="Area">
            <option value="">All areas</option>
            {locations.map((loc) => (
              <option key={loc} value={loc}>{loc}</option>
            ))}
          </select>
        ) : null}
        {kind === "gear" ? (
          <>
            <select value={category} onChange={(e) => go({ category: e.target.value })} className={selectCls} aria-label="Category">
              {CATEGORIES.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <select value={condition} onChange={(e) => go({ condition: e.target.value })} className={selectCls} aria-label="Condition">
              {CONDITIONS.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </>
        ) : null}
      </div>
    </div>
  );
}
