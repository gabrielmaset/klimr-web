import Link from "next/link";
import { BadgeCheck, MapPin } from "lucide-react";
import { cardClasses } from "@/components/card";
import { SportChip } from "@/components/sport-chip";
import { sportSlug } from "@/lib/sports";
import { cn } from "@/lib/utils";

/**
 * PlayerCard — the reusable "collectible" player sport-card.
 *
 * One identity core for every list/discovery surface (search, Network, People You
 * May Know, rankings rows) and shareable player cards. It puts the per-sport accent
 * system to real use: a sport-colored top strip + avatar ring, the SportChip, and
 * the geographic rank shown in the sport's color. Purely presentational (server-
 * component-safe); the relationship button is passed in via `action` so the parent
 * owns the optimistic client behavior.
 *
 * Props are intentionally primitive (strings/numbers) so any page can map its own
 * Supabase shape onto it — full profile pages, PYMK, rankings, or search.
 */
type PlayerCardProps = {
  name: string;
  href?: string;
  avatarUrl?: string | null;
  verified?: boolean;
  /** sport key (e.g. "beach_volleyball") — drives the accent color + chip */
  primarySport?: string;
  /** privacy-aware location label, e.g. "Mar Vista" or "Westside LA" */
  location?: string | null;
  /** geographic-zoom rank, e.g. { value: 6, scope: "in 90066" } */
  rank?: { value: number; scope: string } | null;
  /** reliability score 0–100 */
  reliability?: number | null;
  /** win–loss record, pre-formatted, e.g. "26–15" */
  record?: string | null;
  /** one-line "why you may know them" context (buildContextChips → strongest) */
  contextChip?: string | null;
  /** relationship button slot, compact, top-right (Connect / Follow / Pending …) */
  action?: React.ReactNode;
  /** full-width action rendered in the footer — e.g. a Connect CTA on suggestion cards */
  footerAction?: React.ReactNode;
  className?: string;
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function PlayerCard({
  name,
  href,
  avatarUrl,
  verified,
  primarySport,
  location,
  rank,
  reliability,
  record,
  contextChip,
  action,
  footerAction,
  className,
}: PlayerCardProps) {
  const slug = primarySport ? sportSlug(primarySport) : null;
  const accent = slug ? `var(--color-sport-${slug})` : "var(--color-brand)";
  const hasStats = Boolean(rank) || reliability != null || Boolean(record);

  return (
    <div className={cn(cardClasses({ pad: "none", interactive: Boolean(href) }), "relative overflow-hidden", className)}>
      {href && (
        <Link href={href} className="absolute inset-0" aria-label={`View ${name}'s profile`}>
          <span className="sr-only">View {name}&rsquo;s profile</span>
        </Link>
      )}
      <div aria-hidden className="h-1" style={{ background: accent }} />

      <div className="flex items-start gap-3 p-4">
        <div className="relative shrink-0">
          <div
            className="h-14 w-14 overflow-hidden rounded-full"
            style={{ boxShadow: `0 0 0 2px var(--color-surface), 0 0 0 4px ${accent}` }}
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div
                className="grid h-full w-full place-items-center font-athletic text-lg font-bold text-white"
                style={{ background: accent }}
              >
                {initials(name)}
              </div>
            )}
          </div>
          {verified && (
            <span className="absolute -right-0.5 -bottom-0.5 grid h-5 w-5 place-items-center rounded-full bg-surface">
              <BadgeCheck size={18} className="text-brand" />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <span className="block truncate font-display text-[15px] font-semibold text-ink">{name}</span>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            {primarySport && <SportChip sport={primarySport} size="sm" />}
            {location && (
              <span className="inline-flex items-center gap-1 text-xs text-mute">
                <MapPin size={12} />
                {location}
              </span>
            )}
          </div>
          {contextChip && <p className="mt-1.5 truncate text-xs text-mute">{contextChip}</p>}
        </div>

        {action && <div className="relative z-10 shrink-0">{action}</div>}
      </div>

      {hasStats && (
        <div className="flex items-center gap-6 border-t border-rule px-4 py-2.5">
          {rank && (
            <div className="flex flex-col">
              <span className="font-mono text-sm font-semibold tabular-nums" style={{ color: accent }}>
                #{rank.value}
              </span>
              <span className="kicker text-mute">{rank.scope}</span>
            </div>
          )}
          {reliability != null && (
            <div className="flex flex-col">
              <span className="font-mono text-sm font-semibold tabular-nums text-ink">{reliability}%</span>
              <span className="kicker text-mute">Reliable</span>
            </div>
          )}
          {record && (
            <div className="flex flex-col">
              <span className="font-mono text-sm font-semibold tabular-nums text-ink">{record}</span>
              <span className="kicker text-mute">W–L</span>
            </div>
          )}
        </div>
      )}

      {footerAction && <div className="relative z-10 border-t border-rule p-3">{footerAction}</div>}
    </div>
  );
}
