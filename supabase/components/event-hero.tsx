"use client";

import { useEffect, useState } from "react";
import { CalendarClock, MapPin } from "lucide-react";

/* The public event hero. With photos it becomes a full-bleed slideshow that
 * crossfades every 10s behind a legibility scrim, with dot controls; without
 * photos it falls back to the brand gradient. Client-side for the timer + dots. */
export function EventHero({
  kicker,
  title,
  summary,
  dateText,
  locationName,
  emoji,
  photos,
}: {
  kicker: string;
  title: string;
  summary: string | null;
  dateText: string | null;
  locationName: string | null;
  emoji: string;
  photos: string[];
}) {
  const [idx, setIdx] = useState(0);
  const hasPhotos = photos.length > 0;

  useEffect(() => {
    if (photos.length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % photos.length), 10000);
    return () => clearInterval(t);
  }, [photos.length]);

  return (
    <div className="relative min-h-[440px] overflow-hidden rounded-3xl border border-rail-border bg-[linear-gradient(135deg,#0e2c3a,#0a212c)] sm:min-h-[520px]">
      {hasPhotos
        ? photos.map((url, i) => (
            <div key={url} className="absolute inset-0 transition-opacity duration-[1200ms] ease-in-out" style={{ opacity: i === idx ? 1 : 0 }} aria-hidden={i !== idx}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-full w-full object-cover" />
            </div>
          ))
        : (
          <>
            <span aria-hidden className="pointer-events-none absolute -right-6 -top-10 select-none text-[170px] leading-none opacity-[0.07]">{emoji}</span>
            <span aria-hidden className="pointer-events-none absolute -left-12 bottom-0 h-48 w-48 rounded-full bg-brand/20 blur-3xl" />
          </>
        )}

      {/* legibility scrim — keeps the text readable over any photo */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/20" />

      {/* content, anchored to the bottom like the landing hero */}
      <div className="relative flex min-h-[440px] flex-col justify-end p-6 pb-12 sm:min-h-[520px] sm:p-9 sm:pb-14">
        <p className="kicker text-rail-active">{kicker}</p>
        <h1 className="mt-1 max-w-3xl font-display text-4xl leading-tight text-white drop-shadow-md sm:text-5xl">{title}</h1>
        {summary ? <p className="mt-3 max-w-xl text-white/90 drop-shadow">{summary}</p> : null}
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/85">
          {dateText ? (
            <span className="flex items-center gap-1.5">
              <CalendarClock size={14} /> {dateText}
            </span>
          ) : null}
          {locationName ? (
            <span className="flex items-center gap-1.5">
              <MapPin size={14} /> {locationName}
            </span>
          ) : null}
        </div>
      </div>

      {/* dot controls */}
      {photos.length > 1 ? (
        <div className="absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2">
          {photos.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIdx(i)}
              aria-label={`Show photo ${i + 1}`}
              aria-current={i === idx}
              className={`h-2 rounded-full shadow transition-all ${i === idx ? "w-6 bg-white" : "w-2 bg-white/55 hover:bg-white/80"}`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
