import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, Users, Maximize } from "lucide-react";
import { BackButton } from "@/components/back-button";
import { SPORTS, sportMeta, sportSlug } from "@/lib/sports";
import { RESOURCES } from "@/lib/resources";

export function generateStaticParams() {
  return SPORTS.map((s) => ({ sport: s.key }));
}

export async function generateMetadata({ params }: { params: Promise<{ sport: string }> }): Promise<Metadata> {
  const { sport } = await params;
  const meta = RESOURCES[sport] ? sportMeta(sport) : null;
  return { title: meta ? `${meta.name} — rules & scoring` : "Sport resources" };
}

export default async function ResourceDetailPage({ params }: { params: Promise<{ sport: string }> }) {
  const { sport } = await params;
  const r = RESOURCES[sport];
  if (!r) notFound();
  const meta = sportMeta(sport);

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <BackButton fallback="/resources" label="Sport resources" className="press mb-5 inline-flex items-center gap-1 text-sm font-semibold text-mute hover:text-ink" size={15} />

      <div className="flex items-center gap-3">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-3xl text-3xl" style={{ background: `color-mix(in oklab, var(--color-sport-${sportSlug(sport)}) 16%, transparent)` }}>{meta.emoji}</span>
        <div>
          <h1 className="font-display text-3xl leading-tight text-ink sm:text-4xl">{meta.name}</h1>
          <p className="text-sm text-mute">{r.tagline}</p>
        </div>
      </div>

      {/* at a glance */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-rule bg-surface shadow-e1 p-4">
          <div className="flex items-center gap-1.5"><Users size={12} className="text-mute" /><span className="kicker text-faint">Format</span></div>
          <p className="mt-1 text-sm font-semibold text-ink">{r.format}</p>
        </div>
        <div className="rounded-2xl border border-rule bg-surface shadow-e1 p-4">
          <div className="flex items-center gap-1.5"><Maximize size={12} className="text-mute" /><span className="kicker text-faint">Court</span></div>
          <p className="mt-1 text-sm font-semibold text-ink">{r.court}</p>
        </div>
      </div>

      <section className="mt-6">
        <h2 className="kicker mb-1.5 text-faint">Overview</h2>
        <p className="text-sm leading-relaxed text-ink-soft">{r.overview}</p>
      </section>

      <section className="mt-6">
        <h2 className="kicker mb-1.5 text-faint">Scoring</h2>
        <p className="text-sm leading-relaxed text-ink-soft">{r.scoring}</p>
      </section>

      <section className="mt-6">
        <h2 className="kicker mb-2 text-faint">Key rules</h2>
        <ul className="space-y-2">
          {r.rules.map((rule, i) => (
            <li key={i} className="flex items-start gap-2.5 rounded-xl border border-rule bg-surface shadow-e1 p-3">
              <Check size={15} className="mt-0.5 shrink-0 text-brand" />
              <span className="text-sm leading-snug text-ink-soft">{rule}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="kicker mb-2 text-faint">Skill tiers</h2>
        <div className="divide-y divide-rule rounded-2xl border border-rule bg-surface shadow-e1">
          {r.tiers.map((t) => (
            <div key={t.name} className="flex items-start gap-3 p-4">
              <span className="mt-0.5 shrink-0 rounded-full bg-tint-brand px-2.5 py-1 text-xs font-bold text-brand-deep">{t.name}</span>
              <span className="text-sm leading-snug text-ink-soft">{t.desc}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="kicker mb-1.5 text-faint">Equipment</h2>
        <p className="text-sm leading-relaxed text-ink-soft">{r.equipment}</p>
      </section>

      <div className="mt-7 flex flex-wrap gap-2">
        <Link href={`/courts?sport=${sport}`} className="press rounded-full border border-rule px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-bg">
          Find {meta.name.toLowerCase()} courts
        </Link>
        <Link href="/play" className="press rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-deep">
          Find a match
        </Link>
      </div>
    </div>
  );
}
