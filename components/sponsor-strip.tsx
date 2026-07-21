import Link from "next/link";
import { Handshake, ShieldCheck } from "lucide-react";

export type SponsorStripItem = {
  id: string;
  name: string;
  slug: string;
  label: string;
  sponsorReady: boolean;
};

/** "Sponsored by" chips on an event or team page — discovery surface behind
 *  `sponsorship_discovery`. Only ACTIVE sponsorships appear, which means the
 *  target consented; only published sponsor businesses resolve (RLS), so an
 *  unlisted sponsor never renders here. Recorded relationships, nothing more. */
export function SponsorStrip({ items }: { items: SponsorStripItem[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-5 rounded-2xl border border-rule bg-bg px-4 py-3">
      <p className="kicker mb-2 flex items-center gap-1.5 text-faint">
        <Handshake size={12} /> Sponsored by
      </p>
      <div className="flex flex-wrap gap-2">
        {items.map((s) => (
          <Link
            key={s.id}
            href={`/b/${s.slug}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-rule bg-surface px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-faint"
          >
            {s.sponsorReady ? <ShieldCheck size={12} className="text-brand-deep" aria-hidden /> : null}
            {s.name}
            <span className="font-normal text-faint">· {s.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
