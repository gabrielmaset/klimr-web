"use client";

import { useEffect, useState } from "react";
import { X, Maximize2 } from "lucide-react";
import { Avatar } from "@/components/avatar";

/**
 * Wraps an Avatar so a real uploaded photo can be tapped to pop out larger in a
 * lightbox (Esc or click-outside to close; body scroll locked while open). When
 * there's no photo it renders the plain initials Avatar with no interaction, so
 * it's a safe drop-in anywhere the static Avatar was used.
 */
export function AvatarLightbox({
  url,
  hue,
  name,
  size = 72,
  ring = false,
  className = "",
}: {
  url: string | null;
  hue: number;
  name: string;
  size?: number;
  ring?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!url) return <Avatar url={url} hue={hue} name={name} size={size} ring={ring} className={className} />;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`View ${name || "player"}'s photo`}
        className="group relative shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        style={{ width: size, height: size }}
      >
        <Avatar url={url} hue={hue} name={name} size={size} ring={ring} className={`transition group-hover:brightness-95 ${className}`} />
        <span aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center rounded-full bg-ink/0 opacity-0 transition duration-150 group-hover:bg-ink/25 group-hover:opacity-100">
          <Maximize2 size={Math.max(14, Math.round(size * 0.24))} className="text-white drop-shadow" />
        </span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${name || "Player"}'s photo`}
          onClick={() => setOpen(false)}
          className="fade fixed inset-0 z-50 grid place-items-center bg-ink/70 p-6 backdrop-blur-md"
        >
          <div className="rise relative" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`${name || "Player"}'s profile photo`} className="max-h-[80vh] max-w-[86vw] rounded-3xl object-contain shadow-[0_30px_90px_-20px_rgba(0,0,0,0.65)]" />
            <button
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="press absolute -right-3 -top-3 grid h-9 w-9 place-items-center rounded-full border border-rule bg-surface text-ink shadow-lg"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
