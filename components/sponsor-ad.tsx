"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import type { Sponsor } from "@/lib/tournament";

/**
 * The single featured premium-sponsor slot. It shows one premium sponsor at a
 * time — logo, blurb, Visit, and one promo image. With more than one premium
 * sponsor it starts on a random one each page load and advances to the next
 * every 20 seconds, fading the card in on each change. Height-capped so it
 * always sits below the event hero.
 */
export function PremiumSponsorAd({ sponsors }: { sponsors: Sponsor[] }) {
  const [idx, setIdx] = useState(0);

  // Random starting sponsor + 20s rotation. Done after mount so SSR and the
  // first client render agree on index 0 (no hydration mismatch). The random
  // pick is deferred to a timer so it isn't a synchronous setState in the effect.
  useEffect(() => {
    if (sponsors.length <= 1) return;
    const start = setTimeout(() => setIdx(Math.floor(Math.random() * sponsors.length)), 0);
    const t = setInterval(() => setIdx((i) => (i + 1) % sponsors.length), 20000);
    return () => {
      clearTimeout(start);
      clearInterval(t);
    };
  }, [sponsors.length]);

  const s = sponsors[idx] ?? sponsors[0];
  if (!s) return null;
  const photo = (Array.isArray(s.photos) ? s.photos : []).filter(Boolean)[0] ?? null;

  return (
    <div className="overflow-hidden rounded-3xl border border-brand/30 bg-[linear-gradient(135deg,#ffffff,#fff6f2)] shadow-sm">
      <div key={idx} className="fade flex flex-col sm:flex-row">
        {/* info */}
        <div className="flex flex-col justify-center gap-2 p-5 sm:w-[42%] sm:p-6">
          <p className="kicker text-brand-deep">Sponsor</p>
          <div className="flex items-center gap-3">
            {s.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.logo} alt="" className="h-11 w-11 shrink-0 rounded-xl border border-rule bg-white object-contain p-1" />
            ) : null}
            <h3 className="font-display text-xl leading-tight text-ink sm:text-2xl">{s.name}</h3>
          </div>
          {s.blurb ? <p className="line-clamp-3 text-sm leading-relaxed text-mute">{s.blurb}</p> : null}
          {s.url ? (
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white shadow-md shadow-brand/25 transition hover:bg-brand-deep"
            >
              Visit <ExternalLink size={14} />
            </a>
          ) : null}
          {sponsors.length > 1 ? (
            <div className="mt-1 flex items-center gap-1.5">
              {sponsors.map((sp, i) => (
                <button
                  key={sp.id}
                  type="button"
                  onClick={() => setIdx(i)}
                  aria-label={`Show ${sp.name}`}
                  className={`h-1.5 rounded-full transition-all ${i === idx ? "w-5 bg-brand" : "w-1.5 bg-brand/30 hover:bg-brand/50"}`}
                />
              ))}
            </div>
          ) : null}
        </div>

        {/* promo image */}
        {photo ? (
          <div className="relative h-60 w-full sm:h-[17.5rem] sm:w-auto sm:flex-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
