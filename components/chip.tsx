import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "default" | "brand" | "success" | "pop" | "muted";

const TONES: Record<Tone, string> = {
  default: "border-rule bg-bg text-ink-soft",
  brand: "border-brand/30 bg-tint-brand text-brand-deep",
  success: "border-success/30 bg-tint-success text-success",
  pop: "border-pop bg-pop/25 text-ink",
  muted: "border-rule bg-bg text-mute",
};

/**
 * Klimr pill — the canonical info chip. Fully rounded, comfortably padded, and
 * vertically centered, with a fixed-size icon slot so emoji and icons sit on
 * the same line as the label regardless of glyph metrics. Mixed-size content
 * (a label plus a smaller ChipMeta) is centered, not baseline-aligned, so it
 * never looks squeezed. Reference feel: Apple's pill controls.
 */
export function Chip({
  icon,
  children,
  tone = "default",
  className,
}: {
  icon?: ReactNode;
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium leading-none",
        TONES[tone],
        className,
      )}
    >
      {icon != null ? (
        <span className="grid h-[18px] w-[18px] shrink-0 place-items-center text-[15px] leading-none">
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  );
}

/** Subordinate detail inside a Chip — smaller and muted, but on the same line. */
export function ChipMeta({
  children,
  tone = "muted",
  className,
}: {
  children: ReactNode;
  tone?: "muted" | "brand";
  className?: string;
}) {
  return (
    <span className={cn("text-xs font-semibold", tone === "brand" ? "text-brand-deep" : "text-mute", className)}>
      {children}
    </span>
  );
}
