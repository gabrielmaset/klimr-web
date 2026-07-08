"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Search,
  Rocket,
  ShieldCheck,
  Zap,
  MonitorPlay,
  Users,
  CalendarDays,
  Trophy,
  MapPin,
  Store,
  Lock,
  ChevronDown,
  Sparkles,
  Mail,
  LifeBuoy,
  ArrowRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { HELP_CATEGORIES, POPULAR_ARTICLE_IDS, findArticle } from "@/lib/help-content";

// The help center proper: search-first hero, quick chips, category cards, and
// per-category accordions — the layout people know from the best product help
// centers, in Klimr's own visual language.

const CATEGORY_ICON: Record<string, LucideIcon> = {
  "getting-started": Rocket,
  "verification-rankings": ShieldCheck,
  "matches-play": Zap,
  "live-queue": MonitorPlay,
  teams: Users,
  "events-classes": CalendarDays,
  tournaments: Trophy,
  courts: MapPin,
  "marketplace-sponsorships": Store,
  "account-privacy": Lock,
};

const TINTS = [
  { bg: "#fff1e8", fg: "#c2410c" },
  { bg: "#eef7ee", fg: "#166534" },
  { bg: "#fdf6e3", fg: "#a16207" },
  { bg: "#eef2ff", fg: "#4338ca" },
  { bg: "#fdf2f8", fg: "#be185d" },
];

const TOTAL_ARTICLES = HELP_CATEGORIES.reduce((n, c) => n + c.articles.length, 0);

export function HelpCenter({ openChat }: { openChat?: () => void }) {
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return null;
    const hits: { catName: string; id: string; q: string; a: string }[] = [];
    for (const cat of HELP_CATEGORIES) {
      for (const a of cat.articles) {
        if (a.q.toLowerCase().includes(q) || a.a.toLowerCase().includes(q)) {
          hits.push({ catName: cat.name, ...a });
        }
      }
    }
    return hits;
  }, [q]);

  function jumpTo(catKey: string) {
    document.getElementById(`hc-${catKey}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openArticle(id: string) {
    setQuery("");
    setOpenId(id);
    const found = findArticle(id);
    if (found) requestAnimationFrame(() => jumpTo(found.cat.key));
  }

  return (
    <div>
      {/* HERO */}
      <section className="relative overflow-hidden rounded-[28px] bg-ink px-5 pb-16 pt-12 text-white sm:px-10 sm:pt-16">
        <div className="pointer-events-none absolute -left-16 -top-24 h-72 w-72 rounded-full opacity-25 blur-3xl" style={{ background: "radial-gradient(circle,#f97316,transparent 65%)" }} />
        <div className="pointer-events-none absolute -bottom-28 -right-10 h-80 w-80 rounded-full opacity-20 blur-3xl" style={{ background: "radial-gradient(circle,#eab308,transparent 65%)" }} />
        <div className="relative mx-auto max-w-2xl text-center">
          <p className="kicker text-white/60">Klimr support</p>
          <h1 className="font-display mt-2 text-4xl leading-none sm:text-6xl">How can we help?</h1>
          <p className="mt-3 text-sm text-white/70 sm:text-base">
            Search {TOTAL_ARTICLES} answers, browse by topic, or ask the assistant — a real person follows up on anything it can&rsquo;t solve.
          </p>
        </div>
      </section>

      {/* STICKY SEARCH — never more than one query away, wherever you've scrolled */}
      <div className="sticky top-2 z-20 -mt-8 px-2 sm:px-10">
        <div className="relative mx-auto max-w-2xl">
          <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for answers — “invite code”, “pending points”, “refund”…"
            className="h-14 w-full rounded-2xl border border-rule bg-bg pl-11 pr-4 text-[15px] text-ink shadow-lg shadow-black/10 outline-none placeholder:text-faint focus:border-ink/40"
            aria-label="Search help articles"
          />
        </div>
      </div>

      {/* POPULAR CHIPS */}
      {!q ? (
        <div className="mx-auto mt-4 flex max-w-3xl flex-wrap items-center justify-center gap-1.5 px-2">
          <span className="text-xs font-semibold text-faint">Popular:</span>
          {POPULAR_ARTICLE_IDS.map((id) => {
            const found = findArticle(id);
            if (!found) return null;
            return (
              <button key={id} type="button" onClick={() => openArticle(id)} className="press rounded-full border border-rule bg-surface px-3 py-1.5 text-xs font-semibold text-mute transition-colors hover:border-ink/30 hover:text-ink">
                {found.article.q.replace(/\?.*$/, "?").slice(0, 44)}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* SEARCH RESULTS */}
      {results ? (
        <section className="mx-auto mt-8 max-w-3xl">
          <p className="mb-3 text-sm font-semibold text-mute">
            {results.length ? `${results.length} answer${results.length === 1 ? "" : "s"} for “${query.trim()}”` : `No matches for “${query.trim()}”`}
          </p>
          {results.length ? (
            <ul className="space-y-2.5">
              {results.map((r) => (
                <li key={r.id} className="rounded-2xl border border-rule bg-surface shadow-e1 p-4">
                  <p className="kicker text-faint">{r.catName}</p>
                  <p className="mt-1 text-[15px] font-bold text-ink">{r.q}</p>
                  <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-mute">{r.a}</p>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-2xl border border-dashed border-rule bg-surface p-6 text-center">
              <p className="text-sm font-semibold text-ink">Nothing matched that.</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-mute">
                Try different words, ask the assistant, or send us a note — we read everything.
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <button type="button" onClick={openChat} className="press inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm font-bold text-white">
                  <Sparkles size={14} className="text-pop" /> Ask the assistant
                </button>
                <Link href="/support" className="press inline-flex items-center gap-1.5 rounded-full border border-rule bg-bg px-4 py-2 text-sm font-semibold text-ink">
                  Contact support
                </Link>
              </div>
            </div>
          )}
        </section>
      ) : (
        <>
          {/* CATEGORY GRID */}
          <section className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {HELP_CATEGORIES.map((c, i) => {
              const Icon = CATEGORY_ICON[c.key] ?? LifeBuoy;
              const tint = TINTS[i % TINTS.length];
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => jumpTo(c.key)}
                  className="press group rounded-2xl border border-rule bg-surface p-4 text-left transition-all hover:-translate-y-0.5 hover:border-ink/25 hover:shadow-md"
                >
                  <span className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: tint.bg, color: tint.fg }}>
                    <Icon size={19} />
                  </span>
                  <p className="mt-3 text-sm font-bold leading-tight text-ink">{c.name}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-faint">{c.blurb}</p>
                  <p className="mt-2 text-[11px] font-semibold text-mute">
                    {c.articles.length} article{c.articles.length === 1 ? "" : "s"}
                  </p>
                </button>
              );
            })}
          </section>

          {/* SECTIONS */}
          <div className="mt-12 space-y-10">
            {HELP_CATEGORIES.map((c, i) => {
              const Icon = CATEGORY_ICON[c.key] ?? LifeBuoy;
              const tint = TINTS[i % TINTS.length];
              return (
                <section key={c.key} id={`hc-${c.key}`} className="scroll-mt-24">
                  <div className="mb-3 flex items-center gap-2.5">
                    <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: tint.bg, color: tint.fg }}>
                      <Icon size={16} />
                    </span>
                    <h2 className="text-lg font-extrabold text-ink">{c.name}</h2>
                  </div>
                  <div className="overflow-hidden rounded-2xl border border-rule bg-surface shadow-e1">
                    {c.articles.map((a, j) => {
                      const isOpen = openId === a.id;
                      return (
                        <div key={a.id} className={j > 0 ? "border-t border-rule" : ""}>
                          <button
                            type="button"
                            onClick={() => setOpenId(isOpen ? null : a.id)}
                            aria-expanded={isOpen}
                            className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-bg sm:px-5"
                          >
                            <span className="text-[15px] font-semibold text-ink">{a.q}</span>
                            <ChevronDown size={17} className={`shrink-0 text-faint transition-transform ${isOpen ? "rotate-180" : ""}`} />
                          </button>
                          {isOpen ? (
                            <p className="whitespace-pre-line px-4 pb-4 text-sm leading-relaxed text-mute sm:px-5">{a.a}</p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}

      {/* STILL STUCK */}
      <section className="mt-14 rounded-[28px] border border-rule bg-surface p-6 sm:p-8">
        <div className="mb-5 text-center">
          <h2 className="font-display text-3xl text-ink">Still stuck?</h2>
          <p className="mt-1 text-sm text-mute">Two humans and one very fast assistant, at your service.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <button type="button" onClick={openChat} className="press group rounded-2xl bg-ink p-5 text-left text-white transition-transform hover:-translate-y-0.5">
            <Sparkles size={20} className="text-pop" />
            <p className="mt-3 font-bold">Ask the assistant</p>
            <p className="mt-1 text-sm text-white/65">Instant answers, and it files a ticket for anything it can&rsquo;t solve.</p>
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-pop">
              Start chatting <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
            </span>
          </button>
          <Link href="/support" className="press group rounded-2xl border border-rule bg-bg p-5 transition-all hover:-translate-y-0.5 hover:border-ink/25">
            <LifeBuoy size={20} className="text-brand-deep" />
            <p className="mt-3 font-bold text-ink">Contact support</p>
            <p className="mt-1 text-sm text-mute">Send a note to the team and track your request&rsquo;s status.</p>
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-deep">
              Open the form <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
          <a href="mailto:support@klimr.com" className="press group rounded-2xl border border-rule bg-bg p-5 transition-all hover:-translate-y-0.5 hover:border-ink/25">
            <Mail size={20} className="text-brand-deep" />
            <p className="mt-3 font-bold text-ink">Email us</p>
            <p className="mt-1 text-sm text-mute">support@klimr.com — we read everything, usually within a day.</p>
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-deep">
              Write an email <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
            </span>
          </a>
        </div>
      </section>
    </div>
  );
}
