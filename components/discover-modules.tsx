import Link from "next/link";
import { CalendarDays, ChevronRight, Compass, UserPlus } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { SportIcon } from "@/components/sport-icons";

/** Discover surfaces for the feed — one source of truth for both placements:
 *  the desktop aside modules and the compact in-feed cards the Wire slots in
 *  every ~10 rows on smaller screens. Presentational only; the page fetches. */

export type DiscoverPerson = {
  id: string;
  name: string;
  hue: number;
  avatarUrl: string | null;
  context: string; // "3 mutual connections" · "Also plays padel" · "Mar Vista"
};

export type DiscoverEvent = {
  id: string;
  title: string;
  sport: string | null;
  whenLabel: string;
};

export function DiscoverPeople({ people, compact }: { people: DiscoverPerson[]; compact?: boolean }) {
  if (!people.length) return null;
  return (
    <div className={`rounded-[18px] border border-rule bg-surface ${compact ? "p-3.5" : "p-4"}`}>
      <p className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[.14em] text-faint">
        <UserPlus size={12} /> People you may know
      </p>
      <div className="mt-2">
        {people.map((p, i) => (
          <Link
            key={p.id}
            href={`/profile/${p.id}`}
            className={`flex items-center gap-2.5 py-2 transition-colors hover:bg-bg/60 ${i > 0 ? "border-t border-rule-soft" : ""}`}
          >
            <Avatar url={p.avatarUrl} hue={p.hue} name={p.name} size={30} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-ink">{p.name}</span>
              <span className="block truncate text-[11.5px] text-mute">{p.context}</span>
            </span>
            <ChevronRight size={14} className="shrink-0 text-faint" />
          </Link>
        ))}
      </div>
    </div>
  );
}

export function DiscoverEvents({ events, compact }: { events: DiscoverEvent[]; compact?: boolean }) {
  if (!events.length) return null;
  return (
    <div className={`rounded-[18px] border border-rule bg-surface ${compact ? "p-3.5" : "p-4"}`}>
      <p className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[.14em] text-faint">
        <CalendarDays size={12} /> Upcoming near you
      </p>
      <div className="mt-2">
        {events.map((e, i) => (
          <Link
            key={e.id}
            href={`/events/${e.id}`}
            className={`flex items-center gap-2.5 py-2 transition-colors hover:bg-bg/60 ${i > 0 ? "border-t border-rule-soft" : ""}`}
          >
            {e.sport ? (
              <SportIcon sport={e.sport} variant="badge" size={22} />
            ) : (
              <span className="grid h-[22px] w-[22px] place-items-center rounded-lg bg-tint-brand text-brand-deep">
                <Compass size={13} />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-ink">{e.title}</span>
              <span className="block truncate text-[11.5px] text-mute">{e.whenLabel}</span>
            </span>
            <ChevronRight size={14} className="shrink-0 text-faint" />
          </Link>
        ))}
      </div>
    </div>
  );
}
