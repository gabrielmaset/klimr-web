"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard, ClipboardList, CreditCard, CalendarClock, ListChecks,
  Network, Handshake, Megaphone, FileText, Settings, Globe, ChevronLeft, Layers, Users,
} from "lucide-react";
import { Avatar } from "@/components/avatar";
import { sportMeta } from "@/lib/sports";

type Tournament = { id: string; code: string; title: string; sport_key: string; status: string };
type Personal = { url: string | null; hue: number; name: string };
type Item = { href: string; label: string; Icon: typeof LayoutDashboard; exact?: boolean; soon?: boolean };

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  published: "Published",
  registration_open: "Registration open",
  registration_closed: "Registration closed",
  in_progress: "In progress",
  completed: "Completed",
  archived: "Archived",
  cancelled: "Cancelled",
};

export function TournamentNav({ tournament, role, personal }: { tournament: Tournament; role: string; personal: Personal }) {
  const pathname = usePathname();
  const base = `/tournament/${tournament.id}`;
  const meta = sportMeta(tournament.sport_key);
  const roleLabel = role === "owner" ? "Owner" : "Manager";

  // Grouped like an event-management console: overview, then registration,
  // competition, promotion, and setup.
  const groups: { header?: string; items: Item[] }[] = [
    { items: [{ href: base, label: "Dashboard", Icon: LayoutDashboard, exact: true }] },
    {
      header: "Registration",
      items: [
        { href: `${base}/divisions`, label: "Divisions", Icon: Layers },
        { href: `${base}/form`, label: "Sign-up form", Icon: ClipboardList },
        { href: `${base}/registrations`, label: "Registrations", Icon: Users },
        { href: `${base}/payments`, label: "Payments", Icon: CreditCard },
      ],
    },
    {
      header: "Competition",
      items: [
        { href: `${base}/schedule`, label: "Schedule", Icon: CalendarClock },
        { href: `${base}/brackets`, label: "Groups & brackets", Icon: Network },
        { href: `${base}/planner`, label: "Day planner", Icon: ListChecks },
      ],
    },
    {
      header: "Promotion",
      items: [
        { href: `${base}/sponsors`, label: "Sponsors", Icon: Handshake },
        { href: `${base}/announcements`, label: "Announcements", Icon: Megaphone },
      ],
    },
    {
      header: "Setup",
      items: [
        { href: `${base}/legal`, label: "Legal", Icon: FileText },
        { href: `${base}/settings`, label: "Settings", Icon: Settings },
      ],
    },
  ];
  const allItems = groups.flatMap((g) => g.items);
  const isActive = (href: string, exact?: boolean) => (exact ? pathname === href : pathname === href || pathname.startsWith(href + "/"));

  const renderItem = ({ href, label, Icon, exact, soon }: Item) => {
    if (soon) {
      return (
        <span key={href} aria-disabled className="flex h-11 cursor-default items-center gap-3 rounded-2xl px-3 text-sm font-semibold text-rail-muted/70">
          <Icon size={18} className="text-rail-muted/60" />
          {label}
          <span className="ml-auto rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-rail-muted">Soon</span>
        </span>
      );
    }
    const active = isActive(href, exact);
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        className={`flex h-11 items-center gap-3 rounded-2xl px-3 text-sm font-semibold transition-colors ${active ? "bg-rail-activebg text-rail-active" : "text-rail-fg hover:bg-rail-hover hover:text-white"}`}
      >
        <Icon size={18} className={active ? "text-brand" : "text-rail-muted"} />
        {label}
      </Link>
    );
  };

  return (
    <>
      {/* desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 self-start p-3 md:block">
        <div className="flex h-full flex-col overflow-y-auto rounded-3xl border border-rail-border bg-[linear-gradient(180deg,#0e2c3a,#0a212c)] px-3 py-5 shadow-[0_10px_40px_-15px_rgba(10,10,11,0.5)]">
          <div className="rounded-2xl border border-rail-border bg-white/[0.05] p-3">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white text-2xl">{meta.emoji}</span>
              <div className="min-w-0">
                <p className="kicker text-rail-muted">Organizer</p>
                <p className="text-sm font-bold leading-snug text-rail-fg line-clamp-2 [overflow-wrap:anywhere]">{tournament.title}</p>
              </div>
            </div>
            <span className="mt-2.5 inline-block rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rail-fg">
              {STATUS_LABEL[tournament.status] ?? tournament.status}
            </span>
          </div>

          {groups.map((g, gi) => (
            <div key={g.header ?? "overview"} className={gi === 0 ? "mt-5" : "mt-5"}>
              {g.header ? <p className="kicker mb-1 px-3 text-rail-muted">{g.header}</p> : null}
              <nav className="flex flex-col gap-1" aria-label={g.header ?? "Overview"}>
                {g.items.map((it) => renderItem(it))}
              </nav>
            </div>
          ))}

          <div className="flex-1" />

          <div className="mt-6 border-t border-rail-border pt-3">
            <a
              href={`/e/${tournament.code}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-10 items-center gap-3 rounded-2xl px-3 text-sm font-semibold text-rail-fg transition-colors hover:bg-rail-hover hover:text-white"
            >
              <Globe size={17} className="text-rail-muted" />
              View public page
            </a>
            <Link href="/tournaments" className="lift mt-1 flex items-center gap-2.5 rounded-2xl bg-white/[0.06] p-2 transition-colors hover:bg-white/[0.10]">
              <Avatar url={personal.url} hue={personal.hue} name={personal.name} size={28} ring />
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm font-semibold text-rail-fg">{personal.name}</span>
                <span className="block text-xs text-rail-muted">{roleLabel} · back to Klimr</span>
              </span>
              <ChevronLeft size={15} className="shrink-0 text-rail-muted" />
            </Link>
          </div>
        </div>
      </aside>

      {/* mobile top bar */}
      <header className="sticky top-0 z-40 border-b border-rule/70 bg-bg/80 backdrop-blur-xl backdrop-saturate-150 md:hidden">
        <div className="flex items-center gap-3 px-4 py-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-tint-brand text-lg">{meta.emoji}</span>
          <div className="min-w-0 flex-1">
            <p className="kicker leading-tight text-brand-deep">Organizer</p>
            <p className="truncate text-sm font-bold leading-tight text-ink">{tournament.title}</p>
          </div>
          <Link href="/tournaments" aria-label="Back to Klimr" className="press inline-flex items-center gap-1 rounded-full border border-rule bg-surface px-3 py-1.5 text-xs font-semibold text-ink">
            <ChevronLeft size={14} /> Exit
          </Link>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2" aria-label="Tournament">
          {allItems.map(({ href, label, Icon, exact, soon }) => {
            if (soon) {
              return (
                <span key={href} aria-disabled className="inline-flex shrink-0 cursor-default items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-faint">
                  <Icon size={15} /> {label}
                </span>
              );
            }
            const active = isActive(href, exact);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${active ? "bg-tint-brand text-brand-deep" : "text-mute hover:text-ink"}`}
              >
                <Icon size={15} /> {label}
              </Link>
            );
          })}
        </nav>
      </header>
    </>
  );
}
