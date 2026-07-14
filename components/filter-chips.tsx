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
export function ChipButton({ active, onClick, children, count }: { active: boolean; onClick: () => void; children: React.ReactNode; count?: number | null }) {
  return (
    <button
      type="button"
      onClick={onClick}
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
    </button>
  );
}
