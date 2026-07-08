import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Trophy } from "lucide-react";
import { SPORTS, sportSlug } from "@/lib/sports";
import { RESOURCES } from "@/lib/resources";

export const metadata: Metadata = { title: "Sport resources" };

export default function ResourcesPage() {
  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <div className="mb-5">
        <h1 className="font-display text-4xl leading-none text-ink sm:text-5xl">Sport resources</h1>
        <p className="mt-1 text-sm text-mute">Rules, scoring, and skill tiers for every sport on Klimr.</p>
      </div>

      <div className="space-y-2.5">
        {SPORTS.map((s) => {
          const r = RESOURCES[s.key];
          if (!r) return null;
          return (
            <Link key={s.key} href={`/resources/${s.key}`} className="lift flex items-center gap-3 rounded-2xl border border-rule bg-surface shadow-e1 p-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-2xl" style={{ background: `color-mix(in oklab, var(--color-sport-${sportSlug(s.key)}) 16%, transparent)` }}>{s.emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-ink">{s.name}</span>
                <span className="block truncate text-xs text-mute">{r.tagline}</span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-faint" />
            </Link>
          );
        })}
      </div>

      <div className="mt-6 rounded-2xl border border-rule bg-surface shadow-e1 p-4">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-ink">
          <Trophy size={15} className="text-pop" /> How Klimr ranking works
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-mute">
          You earn ranking points per sport from the matches you play. Klimr then ranks you geographically — from your ZIP and city
          all the way to national and world — so you can see exactly where you stand against players nearby.
        </p>
        <Link href="/rankings" className="press mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-deep hover:text-brand">
          View rankings <ChevronRight size={14} />
        </Link>
      </div>
    </div>
  );
}
