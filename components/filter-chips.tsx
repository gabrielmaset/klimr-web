import Link from "next/link";
import { Check } from "lucide-react";

/** The house filter-chip system (sitewide standard candidate).
 *  Grammar: filters never wear the flame — selection is solid ink with a
 *  check (the Material/Spotify pattern), so filters can't compete with
 *  primary CTAs. One 32px size; outline resting state; mono counts;
 *  group rows align on a fixed label column and scroll horizontally on
 *  small screens (scrollbar hidden) instead of wrapping into noise. */

export function ChipRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[56px_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[64px_minmax(0,1fr)]">
      <span className="font-mono text-[9px] font-bold uppercase tracking-[.16em] text-faint">{label}</span>
      <div className="flex gap-1.5 overflow-x-auto py-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
    </div>
  );
}

export function Chip({ href, active, children, count }: { href: string; active: boolean; children: React.ReactNode; count?: number | null }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-pressed={active}
      className={`press inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[13px] font-semibold transition-all ${
        active
          ? "border-ink bg-ink text-surface shadow-[0_2px_8px_-2px_rgba(32,27,18,.35)]"
          : "border-rule-2 bg-surface text-ink-soft hover:-translate-y-px hover:border-[#CDC3AE] hover:text-ink"
      }`}
    >
      {active ? <Check size={13} strokeWidth={3} className="-ml-0.5" /> : null}
      {children}
      {count != null ? <span className={`font-mono text-[10px] font-bold ${active ? "text-surface/70" : "text-faint"}`}>{count}</span> : null}
    </Link>
  );
}

/** State-driven sibling of Chip for client browsers — same visual system. */
export function ChipButton({ active, onClick, children, count, size = "md" }: { active: boolean; onClick: () => void; children: React.ReactNode; count?: number | null; size?: "md" | "sm" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`press inline-flex ${size === "sm" ? "h-7 px-3 text-xs" : "h-8 px-3.5 text-[13px]"} shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border font-semibold transition-all ${
        active
          ? "border-ink bg-ink text-surface shadow-[0_2px_8px_-2px_rgba(32,27,18,.35)]"
          : "border-rule-2 bg-surface text-ink-soft hover:-translate-y-px hover:border-[#CDC3AE] hover:text-ink"
      }`}
    >
      {active ? <Check size={size === "sm" ? 11 : 13} strokeWidth={3} className="-ml-0.5" /> : null}
      {children}
      {count != null ? <span className={`font-mono text-[10px] font-bold ${active ? "text-surface/70" : "text-faint"}`}>{count}</span> : null}
    </button>
  );
}

/** A facet container — the label sits ON the border (real fieldset/legend),
 *  options live inside a bounded, vertically scrolling cloud. Dozens of
 *  options never change the container's footprint; boxes sit side by side
 *  and wrap as a deck on smaller screens. */
export function FilterGroup({ label, children, className = "", trailing, footer, pinned }: { label: string; children: React.ReactNode; className?: string; trailing?: React.ReactNode; footer?: React.ReactNode; pinned?: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className={`relative flex min-w-0 flex-col rounded-2xl border border-rule-2 bg-surface px-1.5 pb-1.5 pt-3 ${className}`}>
      <span
        className="absolute -top-[7px] left-3 inline-flex items-center gap-2 px-1.5 font-mono text-[9px] font-bold uppercase leading-none tracking-[.16em] text-faint"
        style={{ background: "linear-gradient(to bottom, transparent 45%, var(--color-surface) 45%)" }}
      >
        {label}
        {trailing}
      </span>
      {pinned ? <div className="mb-1 shrink-0 border-b border-rule-soft pb-1">{pinned}</div> : null}
      {/* Five rows (h-8) fit before this scrolls — a five-item list never
          shows a scrollbar; the affordance appears at six or more. */}
      <div className="grid max-h-[176px] min-h-0 flex-1 content-start overflow-y-auto overscroll-contain [scrollbar-width:thin] [scrollbar-color:#E4DCCB_transparent]">
        {children}
      </div>
      {footer ? <div className="mt-1 shrink-0 border-t border-rule-soft px-1.5 pb-0.5 pt-2">{footer}</div> : null}
    </div>
  );
}

/** A facet option row — uniform width, indicator + label + optional count.
 *  `mode="check"` = multi-select (square); `mode="radio"` = single (circle).
 *  Uniform rows are the fix for ragged pill clouds: every option occupies the
 *  container's full width, so the column always reads clean. */
export function FacetRow({ mode = "check", active, onClick, children, count }: { mode?: "check" | "radio"; active: boolean; onClick: () => void; children: React.ReactNode; count?: number | null }) {
  return (
    <button
      type="button"
      role={mode === "radio" ? "radio" : "checkbox"}
      aria-checked={active}
      onClick={onClick}
      className="press flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-left transition-colors hover:bg-bg"
    >
      {mode === "check" ? (
        <span className={`grid h-[15px] w-[15px] shrink-0 place-items-center rounded-[4px] border transition-colors ${active ? "border-ink bg-ink" : "border-[#CDC3AE] bg-surface"}`}>
          {active ? <Check size={10} strokeWidth={3.5} className="text-surface" /> : null}
        </span>
      ) : (
        <span className={`grid h-[15px] w-[15px] shrink-0 place-items-center rounded-full border transition-colors ${active ? "border-ink" : "border-[#CDC3AE]"} bg-surface`}>
          {active ? <span className="h-[7px] w-[7px] rounded-full bg-ink" /> : null}
        </span>
      )}
      <span className={`min-w-0 flex-1 truncate text-[13px] ${active ? "font-semibold text-ink" : "font-medium text-ink-soft"}`}>{children}</span>
      {count != null ? <span className={`shrink-0 font-mono text-[10px] font-bold ${active ? "text-ink" : "text-faint"}`}>{count}</span> : null}
    </button>
  );
}

/** Server-safe sibling of FacetRow for URL-param filters — same radio visuals,
 *  navigation instead of state. */
export function FacetLink({ href, active, children, count }: { href: string; active: boolean; children: React.ReactNode; count?: number | null }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "true" : undefined}
      className="press flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-left transition-colors hover:bg-bg"
    >
      <span className={`grid h-[15px] w-[15px] shrink-0 place-items-center rounded-full border transition-colors ${active ? "border-ink" : "border-[#CDC3AE]"} bg-surface`}>
        {active ? <span className="h-[7px] w-[7px] rounded-full bg-ink" /> : null}
      </span>
      <span className={`min-w-0 flex-1 truncate text-[13px] ${active ? "font-semibold text-ink" : "font-medium text-ink-soft"}`}>{children}</span>
      {count != null ? <span className={`shrink-0 font-mono text-[10px] font-bold ${active ? "text-ink" : "text-faint"}`}>{count}</span> : null}
    </Link>
  );
}
