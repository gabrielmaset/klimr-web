import { SPORTS, sportMeta } from "@/lib/sports";
import { cn } from "@/lib/utils";

/**
 * Klimr sport icons — Gabriel's hand-illustrated set (Claude Design, Jul 2026),
 * served as static assets from /public/sport-icons. Three tiers per sport:
 *
 *   badge — circular ball emblem; the compact mark for chips, list rows, nav,
 *           and inline mentions ("Completed a [badge] Tennis match").
 *   glyph — the equipment illustration (racquet/paddle + ball); pickers, tiles,
 *           cards, and section headers.
 *   hero  — dynamic rotated composition with motion streaks; wizard art, empty
 *           states, and large cover watermarks.
 *
 * Four sports are SVG; beach volleyball shipped as PNG (quantized to 6/12/16 KB
 * at 256/512/768 px — plenty for 2x displays at every size we render).
 *
 * Icons render as <img>, not inline SVG: a feed of forty rows references one
 * cached asset instead of duplicating forty DOM subtrees, and the PNG sport
 * uses the identical code path. `sportIconSrc` exists for non-React sinks
 * (map popup HTML strings, canvas, SVG <image> href).
 */

export type SportIconVariant = "badge" | "glyph" | "hero";

const PNG_SPORTS = new Set(["beach_volleyball"]);

/** Raw asset path for a sport icon — e.g. /sport-icons/tennis-badge.svg */
export function sportIconSrc(sport: string, variant: SportIconVariant = "glyph"): string {
  const ext = PNG_SPORTS.has(sport) ? "png" : "svg";
  return `/sport-icons/${sport.replace(/_/g, "-")}-${variant}.${ext}`;
}

export function SportIcon({
  sport,
  variant = "glyph",
  size = 24,
  className,
  title,
}: {
  sport: string;
  variant?: SportIconVariant;
  /** Rendered square, in CSS px. */
  size?: number;
  className?: string;
  /** Accessible name. Omit when a visible text label sits beside the icon. */
  title?: string;
}) {
  const known = SPORTS.some((s) => s.key === sport);
  if (!known) {
    // Unknown key (bad data, future sport before assets land): neutral dot,
    // never a broken-image glyph.
    return (
      <span
        aria-hidden
        title={title ?? sportMeta(sport).name}
        className={cn("inline-block shrink-0 rounded-full bg-ink/20", className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={sportIconSrc(sport, variant)}
      width={size}
      height={size}
      alt={title ?? ""}
      aria-hidden={title ? undefined : true}
      loading="lazy"
      decoding="async"
      draggable={false}
      className={cn(
        "inline-block shrink-0 select-none object-contain align-[-0.125em]",
        className,
      )}
    />
  );
}
