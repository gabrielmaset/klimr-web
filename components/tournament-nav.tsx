"use client";

import { usePathname } from "next/navigation";
import { SportIcon } from "@/components/sport-icons";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  LayoutDashboard, ClipboardList, CreditCard, CalendarClock, ListChecks,
  Network, Handshake, Megaphone, Settings, Globe, ChevronDown,
  ChevronLeft,
  ChevronRight, Users, Award,
} from "lucide-react";
import { Avatar } from "@/components/avatar";

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
  const roleLabel = role === "owner" ? "Owner" : "Manager";

  // Grouped by what each tool is for, in event-lifecycle order: an overview,
  // then Setup (define the event), Registration (manage entrants), Competition
  // (run the draws & schedule), and Promotion (public-facing). Divisions & fees
  // and Legal live as sections of Settings, so they aren't separate items.
  const groups: { header?: string; items: Item[] }[] = [
    { items: [{ href: base, label: "Dashboard", Icon: LayoutDashboard, exact: true }] },
    {
      header: "Setup",
      items: [
        { href: `${base}/settings`, label: "Settings", Icon: Settings },
        { href: `${base}/form`, label: "Sign-up form", Icon: ClipboardList },
        { href: `${base}/planner`, label: "Day planner", Icon: ListChecks },
      ],
    },
    {
      header: "Registration",
      items: [
        { href: `${base}/registrations`, label: "Registrations", Icon: Users },
        { href: `${base}/payments`, label: "Payments", Icon: CreditCard },
      ],
    },
    {
      header: "Competition",
      items: [
        { href: `${base}/brackets`, label: "Groups & brackets", Icon: Network },
        { href: `${base}/schedule`, label: "Match schedule", Icon: CalendarClock },
      ],
    },
    {
      header: "Promotion",
      items: [
        { href: `${base}/prizes`, label: "Prizes", Icon: Award },
        { href: `${base}/sponsors`, label: "Sponsors", Icon: Handshake },
        { href: `${base}/announcements`, label: "Announcements", Icon: Megaphone },
      ],
    },
  ];
  // Rail collapse — same contract as the main rail: icon-only under 1180px
  // with overlay expansion (page never reflows); persisted choice above it.
  const [railStored, setRailStored] = useState<boolean | null>(null);
  const [railAuto, setRailAuto] = useState(false);
  const overlayMode = railAuto;
  const [overlayOpen, setOverlayOpen] = useState(false);
  const collapsed = overlayMode ? !overlayOpen : (railStored ?? false);
  const asideRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [moreBelow, setMoreBelow] = useState(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const check = () => setMoreBelow(el.scrollTop + el.clientHeight < el.scrollHeight - 6);
    check();
    el.addEventListener("scroll", check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", check);
      ro.disconnect();
    };
  });
  useEffect(() => {
    const saved = window.localStorage.getItem("klimr.trail");
    const raf = requestAnimationFrame(() => {
      if (saved === "1") setRailStored(true);
      else if (saved === "0") setRailStored(false);
    });
    const mq = window.matchMedia("(max-width: 1180px)");
    const update = () => setRailAuto(mq.matches);
    const raf2 = requestAnimationFrame(update);
    mq.addEventListener("change", update);
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(raf2);
      mq.removeEventListener("change", update);
    };
  }, []);

  const toggleRail = () => {
    if (overlayMode) {
      setOverlayOpen((o) => !o);
      return;
    }
    const next = !collapsed;
    setRailStored(next);
    window.localStorage.setItem("klimr.trail", next ? "1" : "0");
  };
  const closeOverlay = () => {
    if (overlayMode) setOverlayOpen(false);
  };
  useEffect(() => {
    if (!(overlayMode && overlayOpen)) return;
    function onDoc(e: MouseEvent) {
      if (asideRef.current?.contains(e.target as Node)) return;
      setOverlayOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOverlayOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [overlayMode, overlayOpen]);

  const allItems = groups.flatMap((g) => g.items);
  const isActive = (href: string, exact?: boolean) => (exact ? pathname === href : pathname === href || pathname.startsWith(href + "/"));

  const renderItem = ({ href, label, Icon, exact, soon }: Item) => {
    if (soon) {
      return (
        <span key={href} aria-disabled title={collapsed ? label : undefined} className={`flex h-11 cursor-default items-center rounded-2xl text-sm font-semibold text-rail-muted/70 whitespace-nowrap ${collapsed ? "justify-center px-0" : "gap-3 px-3 overflow-x-auto [scrollbar-width:none]"}`}>
          <Icon size={18} className="text-rail-muted/60" />
          {collapsed ? null : (
            <>
              {label}
              <span className="ml-auto rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-rail-muted">Soon</span>
            </>
          )}
        </span>
      );
    }
    const active = isActive(href, exact);
    return (
      <Link
        key={href}
        href={href}
        onClick={closeOverlay}
        title={collapsed ? label : undefined}
        aria-current={active ? "page" : undefined}
        className={`flex h-11 items-center rounded-2xl text-sm font-semibold transition-colors ${collapsed ? "justify-center px-0" : "gap-3 px-3"} ${active ? "bg-rail-activebg text-rail-active" : "text-rail-fg hover:bg-rail-hover hover:text-white"}`}
      >
        <Icon size={18} className={active ? "text-brand" : "text-rail-muted"} />
        {collapsed ? null : label}
      </Link>
    );
  };

  return (
    <>
      {/* desktop sidebar */}
      <aside
        ref={asideRef}
        className={`print:hidden relative sticky top-0 z-[45] hidden h-dvh shrink-0 self-start p-3 transition-[width] duration-200 md:block ${collapsed || overlayMode ? "w-[76px]" : "w-64"}`}
      >
        <button
          type="button"
          onClick={toggleRail}
          aria-label={collapsed ? "Expand menu" : "Collapse menu"}
          className="press absolute -right-[11px] top-[22px] z-20 grid h-6 w-6 place-items-center rounded-full border border-rule bg-surface text-mute shadow-e1 transition-colors hover:text-ink"
        >
          {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
        </button>
        <div
          className={`relative flex flex-col overflow-hidden rounded-3xl border border-[#5a2c17] bg-[linear-gradient(180deg,#3a1608,#210c05)] shadow-[0_10px_40px_-15px_rgba(10,10,11,0.5)] ${
            overlayMode && overlayOpen ? "absolute inset-y-3 left-3 z-10 w-[232px] shadow-e3" : collapsed ? "h-full w-auto" : "h-full w-auto"
          }`}
        >
        <div className="relative min-h-0 flex-1">
        <div ref={scrollRef} className={`flex h-full flex-col overflow-y-auto py-5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden ${overlayMode && overlayOpen ? "px-3" : collapsed ? "px-1.5" : "px-3"}`}>
          <div className={`rounded-2xl border border-rail-border bg-white/[0.05] ${collapsed ? "p-1.5" : "p-3"}`}>
            <div className={`flex items-center ${collapsed ? "justify-center" : "gap-3"}`}>
              <span className={`grid shrink-0 place-items-center rounded-2xl bg-white ${collapsed ? "h-10 w-10" : "h-11 w-11"}`} title={collapsed ? tournament.title : undefined}><SportIcon sport={tournament.sport_key} variant="glyph" size={collapsed ? 26 : 30} /></span>
              {collapsed ? null : (
                <div className="min-w-0">
                  <p className="kicker text-rail-muted">Organizer</p>
                  <p className="text-sm font-bold leading-snug text-rail-fg line-clamp-2 [overflow-wrap:anywhere]">{tournament.title}</p>
                </div>
              )}
            </div>
            {collapsed ? null : (
              <span className="mt-2.5 inline-block rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rail-fg">
                {STATUS_LABEL[tournament.status] ?? tournament.status}
              </span>
            )}
          </div>

          {groups.map((g) => {
            if (!g.header) {
              return (
                <nav key="overview" className="mt-5 flex flex-col gap-1" aria-label="Overview">
                  {g.items.map((it) => renderItem(it))}
                </nav>
              );
            }
            return (
              <div key={g.header} className="mt-5">
                {collapsed ? (
                  <div aria-hidden className="mx-2 -mt-2.5 mb-2.5 border-t border-rail-border" />
                ) : (
                  <p className="kicker mb-1 px-3 text-rail-muted">{g.header}</p>
                )}
                <nav className="flex flex-col gap-1" aria-label={g.header}>
                  {g.items.map((it) => renderItem(it))}
                </nav>
              </div>
            );
          })}

        </div>
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-x-0 bottom-0 flex h-12 items-end justify-center pb-1 transition-opacity duration-200 ${moreBelow ? "opacity-100" : "opacity-0"}`}
          style={{ background: "linear-gradient(to bottom, transparent, #2a1006 85%)" }}
        >
          <ChevronDown size={15} className="animate-bounce text-rail-muted" />
        </div>
        </div>
        <div className={`shrink-0 border-t border-rail-border pb-4 pt-3 ${overlayMode && overlayOpen ? "px-3" : collapsed ? "px-1.5" : "px-3"}`}>
            <a
              href={`/e/${tournament.code}`}
              target="_blank"
              rel="noopener noreferrer"
              title={collapsed ? "View public page" : undefined}
              className={`flex h-10 items-center rounded-2xl text-sm font-semibold text-rail-fg transition-colors hover:bg-rail-hover hover:text-white ${collapsed ? "justify-center px-0" : "gap-3 px-3"}`}
            >
              <Globe size={17} className="text-rail-muted" />
              {collapsed ? null : "View public page"}
            </a>
            <Link
              href="/tournaments"
              title={collapsed ? "Back to Klimr" : undefined}
              className={`lift mt-1 flex items-center rounded-2xl bg-white/[0.06] transition-colors hover:bg-white/[0.10] ${collapsed ? "justify-center p-1.5" : "gap-2.5 p-2"}`}
            >
              <Avatar url={personal.url} hue={personal.hue} name={personal.name} size={28} ring />
              {collapsed ? null : (
                <>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-semibold text-rail-fg">{personal.name}</span>
                    <span className="block text-xs text-rail-muted">{roleLabel} · back to Klimr</span>
                  </span>
                  <ChevronLeft size={15} className="shrink-0 text-rail-muted" />
                </>
              )}
            </Link>
        </div>
        </div>
      </aside>

      {/* mobile top bar */}
      <header className="print:hidden pt-safe px-safe sticky top-0 z-40 border-b border-rule bg-surface md:hidden">
        <div className="flex items-center gap-3 px-4 py-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-tint-brand"><SportIcon sport={tournament.sport_key} variant="glyph" size={24} /></span>
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
