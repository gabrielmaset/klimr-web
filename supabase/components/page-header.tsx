import { cn } from "@/lib/utils";

/** Daylight §2.3 page-header grammar: mono flame kicker → Space Grotesk 40 title
 *  → one support sentence, with at most ONE status pill on the right. */
export function PageHeader({
  kicker,
  title,
  sub,
  pill,
  className,
}: {
  kicker: string;
  title: React.ReactNode;
  sub?: React.ReactNode;
  pill?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-3", className)}>
      <div className="min-w-0">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-flame-text">{kicker}</p>
        <h1 className="mt-1.5 font-display text-[40px] font-bold leading-none tracking-[-0.025em] text-ink">{title}</h1>
        {sub ? <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-mute">{sub}</p> : null}
      </div>
      {pill ? <div className="shrink-0">{pill}</div> : null}
    </div>
  );
}

/** The §2.3 status pill: white, hairline, optional pulsing dot (grass=live, flame=you). */
export function StatusPill({ dot, children }: { dot?: "grass" | "flame"; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-rule bg-surface px-3 py-1.5 text-xs font-semibold text-mute">
      {dot ? (
        <span
          className="live-dot h-1.5 w-1.5 rounded-full"
          style={{ background: dot === "grass" ? "var(--color-success)" : "var(--color-brand)" }}
          aria-hidden
        />
      ) : null}
      {children}
    </span>
  );
}
