import { sportMeta, sportSlug } from "@/lib/sports";
import { cn } from "@/lib/utils";

/**
 * Per-sport identity chips + dots. These give each sport a consistent visual
 * accent — the piece Klimr was missing (sports were emoji-only). Colors come
 * from the `--color-sport-*` tokens; chips are tinted with `color-mix` so the
 * label stays readable across all five hues (a solid gold pill with white text
 * would fail contrast — the tint approach never does). This is *sport* identity,
 * deliberately separate from the per-team generated kits in lib/team-kit.ts.
 */

/** Exact Daylight sport tones (spec §1.1 table) — fg / chip bg / chip border.
 *  The fg values mirror the `--color-sport-*` tokens; bg/bd are the spec's
 *  hand-tuned tints (not derived), so chips match the reference precisely. */
export const SPORT_TONES: Record<string, { fg: string; bg: string; bd: string }> = {
  tennis: { fg: "#4D7C0F", bg: "#F1F8E3", bd: "#DCEBC0" },
  pickleball: { fg: "#BE185D", bg: "#FDEDF4", bd: "#F7D2E2" },
  padel: { fg: "#B45309", bg: "#FDF3DD", bd: "#F1E0B6" },
  racquetball: { fg: "#1D4ED8", bg: "#EAF1FE", bd: "#CDDEFA" },
  beach: { fg: "#C2410C", bg: "#FEF0E4", bd: "#F9DAC0" },
};

/** A small solid dot in the sport's accent color — for inline labels and lists. */
export function SportDot({
  sport,
  size = 8,
  className,
}: {
  sport: string;
  size?: number;
  className?: string;
}) {
  const slug = sportSlug(sport);
  return (
    <span
      aria-hidden
      className={cn("inline-block shrink-0 rounded-full", className)}
      style={{ width: size, height: size, background: `var(--color-sport-${slug})` }}
    />
  );
}

/** A tinted pill naming a sport, accented in the sport's color. */
export function SportChip({
  sport,
  showDot = true,
  size = "md",
  className,
}: {
  sport: string;
  showDot?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const slug = sportSlug(sport);
  const meta = sportMeta(sport);
  const tone = SPORT_TONES[slug];
  const v = `var(--color-sport-${slug})`;
  const pad = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-semibold tracking-tight",
        pad,
        className,
      )}
      style={{
        background: tone ? tone.bg : `color-mix(in oklab, ${v} 12%, white)`,
        color: tone ? tone.fg : `color-mix(in oklab, ${v} 72%, black)`,
        boxShadow: `inset 0 0 0 1px ${tone ? tone.bd : `color-mix(in oklab, ${v} 22%, white)`}`,
      }}
    >
      {showDot && (
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: v }}
        />
      )}
      {meta.name}
    </span>
  );
}
