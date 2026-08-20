"use client";

import { useEffect, useState } from "react";
import type { GalleryItem } from "@/lib/tournament";

const ROTATE_MS = 10_000;

/** Full-bleed hero photo stack: crossfades every 10s, dot per photo, and each
 *  photo honors its non-destructive crop (zoom + focal point) exactly as set
 *  in the organizer's editor. */
export function TournamentHeroCarousel({ items }: { items: GalleryItem[] }) {
  const [idx, setIdx] = useState(0);
  const count = items.length;

  useEffect(() => {
    if (count < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % count), ROTATE_MS);
    return () => clearInterval(t);
    // restarting on idx gives a full 10s after a manual dot click
  }, [count, idx]);

  if (count === 0) return null;

  return (
    <>
      {items.map((g, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={g.url}
          src={g.url}
          alt=""
          aria-hidden={i !== idx}
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-1000"
          style={{
            opacity: i === idx ? 1 : 0,
            objectPosition: `${g.x}% ${g.y}%`,
            transform: `scale(${g.zoom})`,
            transformOrigin: `${g.x}% ${g.y}%`,
          }}
        />
      ))}
      {count > 1 ? (
        <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
          {items.map((g, i) => (
            <button
              key={g.url}
              type="button"
              aria-label={`Photo ${i + 1} of ${count}`}
              aria-current={i === idx}
              onClick={() => setIdx(i)}
              className="press h-2 rounded-full transition-all duration-300"
              style={{
                width: i === idx ? 18 : 8,
                background: i === idx ? "#fff" : "rgba(255,255,255,.45)",
                boxShadow: "0 1px 4px rgba(0,0,0,.35)",
              }}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}
