import type { Metadata } from "next";
import { SportIcon } from "@/components/sport-icons";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SPORTS, sportSlug } from "@/lib/sports";
import { RESOURCES } from "@/lib/resources";
import { SPORT_TONES } from "@/components/sport-chip";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "The playbook" };

const monoKicker = "font-mono text-[9.5px] font-bold uppercase tracking-[.18em]";

export default function ResourcesPage() {
  return (
    <div className="mx-auto max-w-page px-[30px] pb-16 pt-[22px]">
      <PageHeader
        kicker="Discover — Playbook"
        title="The playbook"
        sub="Rules, scoring, and skill tiers for every sport on Klimr."
      />

      <div className="mt-6 grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(330px, 1fr))" }}>
        {SPORTS.map((s) => {
          const r = RESOURCES[s.key];
          if (!r) return null;
          const tone = SPORT_TONES[sportSlug(s.key)];
          return (
            <Link
              key={s.key}
              href={`/resources/${s.key}`}
              className="lift block overflow-hidden rounded-[18px] p-5"
              style={{ border: `1px solid ${tone?.bd ?? "var(--color-rule)"}`, background: `linear-gradient(150deg, ${tone?.bg ?? "var(--color-bg)"}, #FFFFFF 62%)` }}
            >
              <div className="flex items-center gap-3.5">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px]" style={{ background: tone?.bg ?? "var(--color-bg)", border: `1px solid ${tone?.bd ?? "var(--color-rule)"}` }}>
                  <SportIcon sport={s.key} variant="glyph" size={32} />
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-[17px] font-bold leading-tight tracking-[-0.015em] text-ink">{s.name}</span>
                  <span className="mt-0.5 block truncate text-[12.5px] text-mute">{r.tagline}</span>
                </span>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-rule-soft pt-3">
                <span className={`${monoKicker} text-faint`}>Rules · Scoring · Skill tiers</span>
                <ArrowRight size={15} style={{ color: tone?.fg ?? "var(--color-brand)" }} />
              </div>
            </Link>
          );
        })}
      </div>

      {/* How the mountain works — the one climb motif on this page */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-6 rounded-[20px] border border-rule bg-surface p-6 shadow-e1">
        <div className="min-w-0 max-w-xl">
          <p className={`${monoKicker} text-flame-text`}>How the mountain works</p>
          <h2 className="mt-1.5 font-display text-[20px] font-bold leading-tight tracking-[-0.015em] text-ink">Points per sport. Rank per place.</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-mute">
            You earn ranking points per sport from the matches you play. Klimr then ranks you geographically — from your ZIP and
            city all the way to national and world — so you can see exactly where you stand against the players around you.
          </p>
          <Link href="/rankings" className="mt-3 inline-flex items-center gap-1 text-[13px] font-bold text-flame-text">
            View the mountain <ArrowRight size={14} />
          </Link>
        </div>
        <svg width="280" height="110" viewBox="0 0 280 110" aria-hidden className="shrink-0">
          <path d="M14,96 L74,74 L134,58 L194,38 L262,16" fill="none" stroke="rgba(32,27,18,.35)" strokeWidth="2" strokeDasharray="1 7" strokeLinecap="round" />
          {[
            { x: 14, y: 96 }, { x: 74, y: 74 }, { x: 134, y: 58 }, { x: 194, y: 38 }, { x: 262, y: 16 },
          ].map((pnt, i) => (
            <circle
              key={i}
              cx={pnt.x}
              cy={pnt.y}
              r={i === 0 ? 7 : 6}
              fill={i === 0 ? "var(--color-brand)" : "#fff"}
              stroke={i === 4 ? "var(--color-sun)" : i === 0 ? "var(--color-brand)" : "#D9CFBB"}
              strokeWidth={i === 4 ? 2.5 : 1.5}
            />
          ))}
          <text x="14" y="110" textAnchor="middle" style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, letterSpacing: ".14em", fill: "var(--color-faint)" }}>ZIP</text>
          <text x="262" y="110" textAnchor="middle" style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, letterSpacing: ".14em", fill: "var(--color-faint)" }}>WORLD</text>
        </svg>
      </div>
    </div>
  );
}
