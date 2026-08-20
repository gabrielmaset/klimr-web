"use client";

import { useState } from "react";

export function ListingGallery({ photos, alt, fallback, fallbackBg }: { photos: string[]; alt: string; fallback: React.ReactNode; fallbackBg: string }) {
  const [idx, setIdx] = useState(0);

  return (
    <div>
      <div className="overflow-hidden rounded-[16px] border border-rule" style={{ aspectRatio: "4/3", background: fallbackBg }}>
        {photos.length > 0 ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photos[Math.min(idx, photos.length - 1)]} alt={alt} className="h-full w-full object-cover" />
        ) : (
          <span className="grid h-full w-full place-items-center" aria-hidden>{fallback}</span>
        )}
      </div>
      {photos.length > 1 ? (
        <div className="mt-2 flex gap-2 overflow-x-auto py-0.5">
          {photos.map((p, i) => (
            <button
              key={p}
              type="button"
              aria-label={`Photo ${i + 1}`}
              onClick={() => setIdx(i)}
              className={`shrink-0 overflow-hidden rounded-[10px] border-2 transition-colors ${i === idx ? "border-brand" : "border-rule hover:border-rule-hover"}`}
              style={{ width: 64, height: 48 }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
