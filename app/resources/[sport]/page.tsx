import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { SportIcon } from "@/components/sport-icons";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Users, Maximize, Backpack } from "lucide-react";
import { SPORTS, sportMeta, sportSlug } from "@/lib/sports";
import { RESOURCES } from "@/lib/resources";
import { SPORT_TONES } from "@/components/sport-chip";
import { CourtDiagram } from "@/components/court-diagram";

export function generateStaticParams() {
  return SPORTS.map((s) => ({ sport: s.key }));
}

export async function generateMetadata({ params }: { params: Promise<{ sport: string }> }): Promise<Metadata> {
  const { sport } = await params;
  const meta = RESOURCES[sport] ? sportMeta(sport) : null;
  return { title: meta ? `${meta.name} — The playbook` : "The playbook" };
}

const monoKicker = "font-mono text-[9.5px] font-bold uppercase tracking-[.18em]";
const CARD = "rounded-[18px] border border-rule bg-surface p-5 shadow-e1";

const SECTIONS = [
  ["overview", "Overview"],
  ["court", "The court"],
  ["scoring", "Scoring"],
  ["serving", "Serving"],
  ["rules", "Key rules"],
  ["faults", "Faults"],
  ["tiers", "Skill tiers"],
  ["etiquette", "Etiquette"],
  ["first-match", "Your first match"],
  ["glossary", "Glossary"],
] as const;

export default async function SportGuidePage({ params }: { params: Promise<{ sport: string }> }) {
  const { sport } = await params;
  const r = RESOURCES[sport];
  if (!r) notFound();
  const meta = sportMeta(sport);
  const tone = SPORT_TONES[sportSlug(sport)];

  return (
    <div className="mx-auto max-w-page px-[30px] pb-16 pt-[22px]">
      <Breadcrumbs items={[{ label: "Playbook", href: "/resources" }, { label: meta.name }]} />
      <Link href="/resources" className="press inline-flex items-center gap-1.5 text-sm text-mute transition-colors hover:text-ink">
        <ArrowLeft size={15} /> The playbook
      </Link>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-flame-text">Playbook — {meta.name}</p>
          <h1 className="mt-1.5 flex items-center gap-3 font-display text-[40px] font-bold leading-none tracking-[-0.025em] text-ink">
            <span className="grid h-12 w-12 place-items-center rounded-[14px]" style={{ background: tone?.bg, border: `1px solid ${tone?.bd}` }} aria-hidden>
              <SportIcon sport={sport} variant="glyph" size={32} />
            </span>
            {meta.name}
          </h1>
          <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-mute">{r.tagline}</p>
        </div>
      </div>

      {/* quick facts */}
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {[
          { Icon: Users, l: "Format", v: r.format },
          { Icon: Maximize, l: "Court", v: r.court },
          { Icon: Backpack, l: "Gear", v: r.equipment },
        ].map(({ Icon, l, v }) => (
          <div key={l} className="rounded-[12px] bg-bg px-3.5 py-3" style={{ border: "1px solid #EFE9DC" }}>
            <p className={`${monoKicker} flex items-center gap-1.5 text-[8.5px] text-faint`}>
              <Icon size={11} /> {l}
            </p>
            <p className="mt-1.5 text-[12.5px] font-semibold leading-snug text-ink">{v}</p>
          </div>
        ))}
      </div>

      {/* section index */}
      <div className="mt-5 flex flex-wrap gap-1.5">
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="press rounded-full border border-rule-2 bg-surface px-3 py-1.5 text-xs font-semibold text-mute transition-colors hover:border-rule-hover hover:text-ink">
            {label}
          </a>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* overview */}
        <section id="overview" className={`${CARD} lg:col-span-2`}>
          <h2 className={`${monoKicker} text-flame-text`}>Overview</h2>
          <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-ink-soft">{r.overview}</p>
        </section>

        {/* the court — diagram */}
        <section id="court" className={`${CARD} lg:col-span-2`}>
          <div className="flex items-baseline justify-between gap-4">
            <h2 className={`${monoKicker} text-flame-text`}>The court</h2>
            <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[.14em] text-faint">{r.court}</p>
          </div>
          <div className="mx-auto mt-3 max-w-[640px]">
            <CourtDiagram sport={sport} />
          </div>
        </section>

        {/* scoring */}
        <section id="scoring" className={CARD}>
          <h2 className={`${monoKicker} text-flame-text`}>How scoring works</h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-soft">{r.scoring}</p>
        </section>

        {/* serving */}
        <section id="serving" className={CARD}>
          <h2 className={`${monoKicker} text-flame-text`}>Serving</h2>
          <ol className="mt-2.5 space-y-2">
            {r.serving.map((s, i) => (
              <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-ink-soft">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-tint-brand font-mono text-[10px] font-bold text-flame-text">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
        </section>

        {/* rules */}
        <section id="rules" className={CARD}>
          <h2 className={`${monoKicker} text-flame-text`}>Key rules</h2>
          <ul className="mt-2.5 space-y-2">
            {r.rules.map((s, i) => (
              <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-ink-soft">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: tone?.fg ?? "var(--color-brand)" }} aria-hidden />
                {s}
              </li>
            ))}
          </ul>
        </section>

        {/* faults */}
        <section id="faults" className={CARD}>
          <h2 className={`${monoKicker} text-flame-text`}>You lose the point when…</h2>
          <ul className="mt-2.5 space-y-2">
            {r.faults.map((s, i) => (
              <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-ink-soft">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-danger" aria-hidden />
                {s}
              </li>
            ))}
          </ul>
        </section>

        {/* tiers */}
        <section id="tiers" className={CARD}>
          <h2 className={`${monoKicker} text-flame-text`}>Skill tiers on Klimr</h2>
          <div className="mt-2.5 space-y-2.5">
            {r.tiers.map((t, i) => (
              <div key={t.name} className="rounded-[12px] bg-bg px-3.5 py-2.5" style={{ border: "1px solid #EFE9DC" }}>
                <p className="flex items-center gap-2 text-[12.5px] font-bold text-ink">
                  <span className="font-mono text-[9px] font-bold text-faint">T{i + 1}</span>
                  {t.name}
                </p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-mute">{t.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* etiquette */}
        <section id="etiquette" className={CARD}>
          <h2 className={`${monoKicker} text-flame-text`}>Court etiquette</h2>
          <ul className="mt-2.5 space-y-2">
            {r.etiquette.map((s, i) => (
              <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-ink-soft">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-success" aria-hidden />
                {s}
              </li>
            ))}
          </ul>
        </section>

        {/* first match */}
        <section id="first-match" className={CARD}>
          <h2 className={`${monoKicker} text-flame-text`}>Your first Klimr match</h2>
          <ol className="mt-2.5 space-y-2">
            {r.firstMatch.map((s, i) => (
              <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-ink-soft">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full font-mono text-[10px] font-bold" style={{ background: tone?.bg, color: tone?.fg, boxShadow: `inset 0 0 0 1px ${tone?.bd}` }}>
                  {i + 1}
                </span>
                {s}
              </li>
            ))}
          </ol>
        </section>

        {/* glossary */}
        <section id="glossary" className={`${CARD} lg:col-span-2`}>
          <h2 className={`${monoKicker} text-flame-text`}>Talk the talk</h2>
          <dl className="mt-3 grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
            {r.glossary.map((g) => (
              <div key={g.term} className="flex gap-2.5 border-b border-rule-soft pb-2.5">
                <dt className="w-32 shrink-0 font-mono text-[11px] font-bold uppercase tracking-[.08em]" style={{ color: tone?.fg ?? "var(--color-flame-text)" }}>{g.term}</dt>
                <dd className="text-[12.5px] leading-relaxed text-mute">{g.def}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      {/* cross-sell the mountain */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-[18px] border p-5" style={{ borderColor: tone?.bd, background: `linear-gradient(150deg, ${tone?.bg}, #FFFFFF 62%)` }}>
        <p className="text-[13.5px] font-semibold text-ink">Know the game? Go climb its mountain.</p>
        <Link href={`/rankings?sport=${sport}`} className="press inline-flex h-[34px] items-center rounded-[10px] px-3.5 text-[13px] font-bold text-white shadow-flame transition-[filter] hover:brightness-[1.06]" style={{ background: "linear-gradient(140deg, #FF6A35, #E23E0D)" }}>
          View {meta.name} rankings
        </Link>
      </div>
    </div>
  );
}
