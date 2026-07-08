import Link from "next/link";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/button";

/**
 * Small shared primitives that codify patterns already used ad-hoc across the
 * app, so they stay consistent and honest.
 */

/** The athletic uppercase section label (Oswald, tracked) used site-wide. */
export function SectionHeader({
  title,
  action,
  className,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-3", className)}>
      <h2 className="font-athletic text-base font-bold uppercase tracking-wide text-ink">
        {title}
      </h2>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** A labeled figure — mono, tabular — for profile / team / rankings stat rows. */
export function Stat({
  value,
  label,
  className,
}: {
  value: React.ReactNode;
  label: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-[12px] bg-bg px-3 py-2.5", className)} style={{ border: "1px solid #EFE9DC" }}>
      <p className="font-mono text-[8.5px] font-bold uppercase tracking-[.16em] text-faint">{label}</p>
      <p className="mt-1 font-display text-base font-bold leading-none tracking-[-0.01em] text-ink">{value}</p>
    </div>
  );
}

/**
 * The honest, branded empty state — dashed card + optional icon + optional CTA.
 * Codifies the "dashed-border card with a branded action" pattern already used
 * (e.g. the recent-matches empty state). Honest by policy: never fabricates data.
 */
export function EmptyState({
  icon,
  title,
  description,
  cta,
  className,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  cta?: { label: string; href: string };
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-2xl border border-dashed border-rule bg-surface px-6 py-12 text-center",
        className,
      )}
    >
      {icon ? <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-tint-brand text-brand">{icon}</div> : null}
      <p className="font-display text-lg text-ink">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-mute">{description}</p>
      ) : null}
      {cta ? (
        <Link
          href={cta.href}
          className={cn("mt-5", buttonVariants({ variant: "primary", size: "md" }))}
        >
          {cta.label}
        </Link>
      ) : null}
    </div>
  );
}
