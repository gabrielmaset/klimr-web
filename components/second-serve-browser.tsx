"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Heart, ShieldCheck, Binoculars, LayoutGrid, BadgeCheck, Plus } from "lucide-react";
import { sportSlug, SPORTS } from "@/lib/sports";
import { SportIcon } from "@/components/sport-icons";
import { SPORT_TONES } from "@/components/sport-chip";
import { PageHeader } from "@/components/page-header";
import { CATEGORIES, RADII_MI, TRADE_TONE, FREE_TONE, PENDING_TONE, MULTI_TONE, priceLabel } from "@/lib/marketplace";
import { toggleSave } from "@/app/marketplace/actions";

export type BrowseListing = {
  id: string;
  title: string;
  sport: string; // sport key or "multi"
  category: string;
  mode: "sale" | "trade" | "free";
  obo: boolean;
  tradeWants: string | null;
  priceCents: number | null;
  condition: string | null;
  status: "active" | "pending" | "sold";
  cover: string | null;
  distanceMi: number | null;
  postedDaysAgo: number;
  sellerName: string;
  sellerHue: number;
  sellerVerified: boolean;
  yours: boolean;
  saved: boolean;
};

const monoKicker = "font-mono text-[9.5px] font-bold uppercase tracking-[.18em]";

function sportTone(key: string) {
  return key === "multi" ? MULTI_TONE : (SPORT_TONES[sportSlug(key)] ?? MULTI_TONE);
}
function SportMark({ k, size, className }: { k: string; size: number; className?: string }) {
  if (k === "multi")
    return <span aria-hidden className={className} style={{ fontSize: size * 0.82, lineHeight: 1 }}>🏅</span>;
  return <SportIcon sport={k} variant={size >= 24 ? "glyph" : "badge"} size={size} className={className} />;
}

export function SecondServeBrowser({ listings, viewerZip }: { listings: BrowseListing[]; viewerZip: string | null }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [, startTransition] = useTransition();

  const [q, setQ] = useState(sp.get("q") ?? "");
  const mode = (sp.get("mode") ?? "all") as "all" | "sale" | "trade" | "free";
  const cat = sp.get("cat") ?? "all";
  const sport = sp.get("sport") ?? "all";
  const radius = Number(sp.get("radius") ?? 10);
  const sort = sp.get("sort") ?? "new";
  const savedOnly = sp.get("saved") === "1";
  const [saves, setSaves] = useState<Record<string, boolean>>({});

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(sp.toString());
    if (value === null || value === "" || value === "all" || (key === "radius" && value === "10") || (key === "sort" && value === "new") || (key === "saved" && value === "0")) {
      next.delete(key);
    } else next.set(key, value);
    startTransition(() => router.replace(`/marketplace${next.size ? `?${next}` : ""}`, { scroll: false }));
  };

  const isSaved = (l: BrowseListing) => saves[l.id] ?? l.saved;

  // Radius applies to everything (unknown distance passes — honest default).
  const inRadius = (l: BrowseListing) => l.distanceMi === null || l.distanceMi <= radius;
  const matchesQ = (l: BrowseListing) => !q.trim() || l.title.toLowerCase().includes(q.trim().toLowerCase());
  const matchesMode = (l: BrowseListing, m: string) => m === "all" || l.mode === m;
  const matchesCat = (l: BrowseListing, c: string) => c === "all" || l.category === c;
  const matchesSport = (l: BrowseListing, s: string) => (s === "all" ? true : l.sport === s);
  const matchesSaved = (l: BrowseListing) => !savedOnly || isSaved(l);

  const filtered = useMemo(() => {
    const base = listings.filter((l) => inRadius(l) && matchesQ(l) && matchesMode(l, mode) && matchesCat(l, cat) && matchesSport(l, sport) && matchesSaved(l));
    const arr = [...base];
    if (sort === "price-asc") arr.sort((a, b) => rank(a) - rank(b) || price(a) - price(b));
    else if (sort === "price-desc") arr.sort((a, b) => rank(a) - rank(b) || price(b) - price(a));
    else if (sort === "near") arr.sort((a, b) => (a.distanceMi ?? 9999) - (b.distanceMi ?? 9999));
    else arr.sort((a, b) => a.postedDaysAgo - b.postedDaysAgo);
    return arr;
    function price(l: BrowseListing) {
      return l.mode === "free" ? 0 : (l.priceCents ?? 0);
    }
    function rank(l: BrowseListing) {
      return l.mode === "trade" ? 1 : 0; // trades last in price sorts (handoff)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listings, q, mode, cat, sport, radius, sort, savedOnly, saves]);

  // Live counts per the handoff's recompute rules.
  const catCount = (c: string) => listings.filter((l) => inRadius(l) && matchesQ(l) && matchesMode(l, mode) && matchesSport(l, sport) && matchesSaved(l) && matchesCat(l, c)).length;
  const sportCount = (s: string) => listings.filter((l) => inRadius(l) && matchesQ(l) && matchesMode(l, mode) && matchesCat(l, cat) && matchesSaved(l) && matchesSport(l, s)).length;
  const savedCount = listings.filter((l) => isSaved(l) && !l.yours).length;

  const clearAll = () => startTransition(() => router.replace("/marketplace", { scroll: false }));

  const onHeart = (l: BrowseListing) => {
    setSaves((s) => ({ ...s, [l.id]: !isSaved(l) }));
    const fd = new FormData();
    fd.set("listing_id", l.id);
    void toggleSave(fd);
  };

  return (
    <div className="mx-auto max-w-page px-[30px] pb-16 pt-[22px]">
      <PageHeader
        kicker="Discover — Gear marketplace"
        title="Second Serve"
        sub="Buy, trade, and donate gear with players near you — deal direct, meet at the court."
        pill={
          <span className="flex items-center gap-2">
          <Link
            href="/marketplace/mine"
            className="press inline-flex h-[38px] items-center rounded-[11px] border border-rule-2 bg-surface px-3.5 text-[13px] font-semibold text-ink-soft transition-colors hover:text-ink"
          >
            My listings
          </Link>
          <Link
            href="/marketplace/new"
            className="press inline-flex h-[38px] items-center gap-1.5 rounded-[11px] px-4 text-[13.5px] font-bold text-white shadow-flame transition-[filter] hover:brightness-[1.06]"
            style={{ background: "linear-gradient(140deg, #FF6A35, #E23E0D)" }}
          >
            <Plus size={16} /> List gear
          </Link>
          </span>
        }
      />

      <div className="mt-6 grid items-start gap-[22px] lg:grid-cols-[264px_minmax(0,1fr)]">
        {/* ── Filter rail ─────────────────────────────────────────────── */}
        <div className="lg:sticky lg:top-[92px]">
          <div className="rounded-[18px] border border-rule bg-surface p-3.5 shadow-e1">
            <label className="flex h-[34px] items-center gap-2 rounded-[10px] border border-rule-2 px-2.5" style={{ background: "rgba(32,27,18,.03)" }}>
              <Search size={14} className="shrink-0 text-faint" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onBlur={() => setParam("q", q.trim() || null)}
                onKeyDown={(e) => e.key === "Enter" && setParam("q", q.trim() || null)}
                placeholder="Search gear…"
                className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-faint"
              />
            </label>

            <div className="mt-3 flex gap-0.5 rounded-[11px] p-[3px]" style={{ background: "rgba(32,27,18,.05)" }}>
              {(["all", "sale", "trade", "free"] as const).map((m) => {
                const on = mode === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setParam("mode", m)}
                    className={`h-7 flex-1 rounded-lg text-xs font-semibold capitalize transition-colors ${on ? "border border-rule-2 bg-white text-ink shadow-[0_1px_2px_rgba(80,60,30,.08)]" : "text-mute"}`}
                  >
                    {m === "all" ? "All" : m === "sale" ? "Buy" : m === "trade" ? "Trade" : "Free"}
                  </button>
                );
              })}
            </div>

            <p className={`${monoKicker} mt-4 px-1 text-faint`}>Categories</p>
            <div className="mt-1 space-y-[1px]">
              {[{ key: "all", label: "All gear" }, ...CATEGORIES].map((c) => {
                const on = cat === c.key;
                const n = catCount(c.key === "all" ? "all" : c.key);
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setParam("cat", c.key)}
                    className={`flex h-8 w-full items-center rounded-[9px] px-[9px] text-left transition-colors ${on ? "bg-tint-brand text-flame-text" : "text-ink hover:bg-[#FBF8F1]"}`}
                  >
                    <span className="flex-1 truncate text-[12.5px] font-semibold">{c.label}</span>
                    <span className={`font-mono text-[10px] font-bold ${on ? "" : "text-faint"}`}>{n}</span>
                  </button>
                );
              })}
            </div>

            <p className={`${monoKicker} mt-4 px-1 text-faint`}>Sport</p>
            <div className="mt-1 space-y-[1px]">
              {[{ key: "all", name: "All sports", emoji: "" }, ...SPORTS.map((s) => ({ key: s.key, name: s.name, emoji: s.emoji }))].map((s) => {
                const on = sport === s.key;
                const tone = s.key === "all" ? null : sportTone(s.key);
                const n = sportCount(s.key);
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setParam("sport", s.key)}
                    className={`flex h-8 w-full items-center gap-2 rounded-[9px] px-[9px] text-left transition-colors ${on ? "" : "text-ink hover:bg-[#FBF8F1]"}`}
                    style={on ? { background: tone?.bg ?? "var(--color-tint-brand)", color: tone?.fg ?? "var(--color-flame-text)" } : undefined}
                  >
                    <span className="grid w-[18px] shrink-0 place-items-center text-sm leading-none">
                      {s.key === "all" ? <LayoutGrid size={13} className={on ? "" : "text-faint"} /> : <SportMark k={s.key} size={15} />}
                    </span>
                    <span className="flex-1 truncate text-[12.5px] font-semibold">{s.name}</span>
                    <span className={`font-mono text-[10px] font-bold ${on ? "" : "text-faint"}`}>{n}</span>
                  </button>
                );
              })}
            </div>

            <p className={`${monoKicker} mt-4 px-1 text-faint`}>Distance</p>
            <select
              value={String(radius)}
              onChange={(e) => setParam("radius", e.target.value)}
              aria-label="Distance"
              className="mt-1 h-8 w-full rounded-[10px] border border-rule-2 bg-surface px-2 text-xs font-semibold text-ink-soft outline-none"
            >
              {RADII_MI.map((r) => (
                <option key={r} value={r}>Within {r} miles</option>
              ))}
            </select>
          </div>

          <div className="mt-3 flex items-start gap-2.5 rounded-[16px] p-3.5" style={{ background: "#FDFBF7", border: "1px solid #EFE9DC" }}>
            <ShieldCheck size={15} className="mt-0.5 shrink-0 text-success" />
            <p className="text-[11.5px] leading-relaxed text-mute">
              Meet at a court and inspect before you pay. Klimr never processes payments — arrange directly with the lister.
            </p>
          </div>
        </div>

        {/* ── Results ─────────────────────────────────────────────────── */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[.16em] text-faint">
              {filtered.length} {filtered.length === 1 ? "listing" : "listings"} · Within {radius} mi{viewerZip ? ` of ${viewerZip}` : ""}
            </p>
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => setParam("saved", savedOnly ? "0" : "1")}
              className={`press inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors ${
                savedOnly ? "border-tint-brand-bd bg-tint-brand text-flame-text" : "border-rule bg-surface text-mute hover:text-ink"
              }`}
            >
              <Heart size={13} fill={savedOnly ? "currentColor" : "none"} /> Saved
              <span className="font-mono text-[10px] font-bold">{savedCount}</span>
            </button>
            <select
              value={sort}
              onChange={(e) => setParam("sort", e.target.value)}
              aria-label="Sort listings"
              className="h-8 rounded-[10px] border border-rule-2 bg-surface px-2 text-xs font-semibold text-ink-soft outline-none"
            >
              <option value="new">Newest first</option>
              <option value="price-asc">Price: low to high</option>
              <option value="price-desc">Price: high to low</option>
              <option value="near">Nearest first</option>
            </select>
          </div>

          {filtered.length === 0 ? (
            <div className="mt-4 rounded-[16px] px-6 py-12 text-center" style={{ background: "var(--color-bg)", border: "1px solid #EFE9DC" }}>
              <Binoculars size={26} className="mx-auto text-faint" />
              <p className="mt-2 text-sm font-semibold text-ink">No gear matches these filters.</p>
              <button type="button" onClick={clearAll} className="press mt-3 inline-flex h-8 items-center rounded-[10px] border border-rule-2 bg-surface px-3 text-xs font-semibold text-mute hover:text-ink">
                Clear filters
              </button>
            </div>
          ) : (
            <div className="mt-3.5 grid gap-[13px]" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(236px, 1fr))" }}>
              {filtered.map((l) => (
                <ListingCard key={l.id} l={l} saved={isSaved(l)} onHeart={() => onHeart(l)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ListingCard({ l, saved, onHeart }: { l: BrowseListing; saved: boolean; onHeart: () => void }) {
  const tone = sportTone(l.sport);
  const pending = l.status === "pending";
  const sold = l.status === "sold";
  const badge = l.yours
    ? { label: "YOUR LISTING", ...{ fg: "var(--color-flame-text)", bg: "var(--color-tint-brand)", bd: "var(--color-tint-brand-bd)" } }
    : sold
      ? { label: "SOLD", ...PENDING_TONE }
      : pending
        ? { label: "PENDING", ...PENDING_TONE }
        : l.mode === "trade"
          ? { label: "TRADE", ...TRADE_TONE }
          : l.mode === "free"
            ? { label: "FREE", ...FREE_TONE }
            : null;

  return (
    <Link
      href={`/marketplace/${l.id}`}
      className={`lift block overflow-hidden rounded-[16px] border border-rule bg-surface shadow-e1 ${pending || sold ? "opacity-[.72]" : ""}`}
    >
      <div className="relative border-b border-rule-soft" style={{ aspectRatio: "4/3", background: tone.bg }}>
        {l.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={l.cover} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <span className="grid h-full w-full place-items-center" aria-hidden><SportMark k={l.sport} size={44} /></span>
        )}
        {badge ? (
          <span className="absolute left-2 top-2 rounded-[6px] px-[7px] py-[3px] font-mono text-[8px] font-bold uppercase tracking-[.12em]" style={{ background: badge.bg, color: badge.fg, boxShadow: `inset 0 0 0 1px ${badge.bd}` }}>
            {badge.label}
          </span>
        ) : null}
        {!l.yours ? (
          <button
            type="button"
            aria-label={saved ? "Remove from saved" : "Save listing"}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onHeart();
            }}
            className="press absolute right-2 top-2 grid h-[30px] w-[30px] place-items-center rounded-full border border-rule"
            style={{ background: "rgba(255,255,255,.94)" }}
          >
            <Heart size={14} className={saved ? "text-[#E23E0D]" : "text-mute"} fill={saved ? "#E23E0D" : "none"} />
          </button>
        ) : null}
      </div>

      <div className="px-[13px] pb-3 pt-[11px]">
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono text-[15.5px] font-bold tabular" style={{ color: l.mode === "trade" ? TRADE_TONE.fg : l.mode === "free" ? FREE_TONE.fg : "var(--color-ink)" }}>
            {priceLabel(l)}
          </span>
          {l.mode === "sale" && l.obo ? <span className="font-mono text-[9px] font-bold text-faint">OBO</span> : null}
          <span className="ml-auto shrink-0 font-mono text-[8.5px] font-bold uppercase tracking-[.1em] text-faint">{l.condition ?? ""}</span>
        </div>
        <p className="mt-1 truncate text-[13px] font-semibold text-ink">
          {l.title}
          {l.mode === "trade" && l.tradeWants ? <span className="text-mute"> — wants: {l.tradeWants}</span> : null}
        </p>
        <p className="mt-0.5 text-[11.5px] text-faint">
          <SportMark k={l.sport} size={13} className="mr-0.5" /> {l.distanceMi !== null ? `${l.distanceMi} mi` : "distance —"} · {l.postedDaysAgo}d ago
        </p>
        <div className="mt-2 flex items-center gap-1.5 border-t border-rule-soft pt-2">
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[9px] font-bold text-white" style={{ background: `linear-gradient(140deg, hsl(${l.sellerHue} 82% 52%), hsl(${l.sellerHue} 85% 38%))` }}>
            {l.sellerName.slice(0, 1)}
          </span>
          <span className="truncate text-[11.5px] font-semibold text-ink-soft">
            {l.sellerName}
            {l.yours ? " (you)" : ""}
          </span>
          {l.sellerVerified ? <BadgeCheck size={13} className="shrink-0 text-brand-deep" fill="var(--color-tint-brand)" /> : null}
        </div>
      </div>
    </Link>
  );
}
