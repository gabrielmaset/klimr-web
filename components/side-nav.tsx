"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Newspaper, Swords, Trophy, Sparkles, Settings, ShieldCheck, LogOut,
  Users, MapPin, Flag, CalendarDays, ShoppingBag, BookOpen, Radar, Gift,
  User, MessageSquare, HelpCircle, ChevronsUpDown, Contact, Inbox, Medal, IdCard, GraduationCap, ChevronDown,
} from "lucide-react";
import { signOutAction } from "@/app/auth/actions";
import { KlimrLogo } from "@/components/logo";
import { Avatar } from "@/components/avatar";
import type { PresenceMode } from "@/app/account/presence";

type Item = { href: string; label: string; Icon: typeof Newspaper };

// Daylight §2.1 grouping. Invites (Community) and Sponsorships (Discover) are
// live destinations kept beyond the spec's list — flagged in DESIGN_DECISIONS.
const GROUPS: { header?: string; items: Item[] }[] = [
  {
    items: [
      { href: "/feed", label: "Home", Icon: Newspaper },
      { href: "/play", label: "Play", Icon: Swords },
      { href: "/rankings", label: "Rankings", Icon: Trophy },
    ],
  },
  {
    header: "Compete",
    items: [
      { href: "/challenges", label: "Challenges", Icon: Flag },
      { href: "/tournaments", label: "Tournaments", Icon: Medal },
      { href: "/events", label: "Events", Icon: CalendarDays },
    ],
  },
  {
    header: "Community",
    items: [
      { href: "/network", label: "Network", Icon: Contact },
      { href: "/teams", label: "Teams", Icon: Users },
      { href: "/invites", label: "Invites", Icon: Inbox },
    ],
  },
  {
    header: "Discover",
    items: [
      { href: "/discover", label: "Players", Icon: Radar },
      { href: "/courts", label: "Courts", Icon: MapPin },
      { href: "/marketplace", label: "Marketplace", Icon: ShoppingBag },
      { href: "/classes", label: "Classes & Coaching", Icon: GraduationCap },
      { href: "/sponsorships", label: "Sponsorships", Icon: Sparkles },
      { href: "/resources", label: "Playbook", Icon: BookOpen },
    ],
  },
];

const kicker = "font-mono text-[9px] font-semibold uppercase tracking-[.18em] text-faint";

export function SideNav({
  avatarUrl,
  avatarHue,
  avatarName,
  email,
  adminRole,
  presenceMode,
}: {
  avatarUrl: string | null;
  avatarHue: number;
  avatarName: string;
  email: string | null;
  adminRole: boolean;
  presenceMode: PresenceMode;
}) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const presenceDot =
    presenceMode === "away" ? "var(--color-warning)" : presenceMode === "offline" ? "var(--color-faint)" : "var(--color-success)";

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  // On screens too short to show the whole menu at once, collapse the labeled
  // sections into an accordion (one open at a time) so the menu never scrolls.
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-height: 960px)");
    const update = () => setCompact(mq.matches);
    const raf = requestAnimationFrame(update);
    mq.addEventListener("change", update);
    return () => {
      cancelAnimationFrame(raf);
      mq.removeEventListener("change", update);
    };
  }, []);

  const sectionForPath = (p: string) =>
    GROUPS.find((g) => g.header && g.items.some((it) => p === it.href || p.startsWith(it.href + "/")))?.header ?? null;
  const [openSection, setOpenSection] = useState<string | null>(null);
  useEffect(() => {
    const s = sectionForPath(pathname);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (s) setOpenSection(s);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // Daylight §2.1 nav item: 36px, radius 10, mono-quiet idle, flame-tinted active
  // with a 3×16 gradient indicator pill on the left edge.
  const navLink = (active: boolean) =>
    `group relative flex h-9 items-center gap-2.5 rounded-[10px] px-[11px] text-[13px] font-semibold transition-colors ${
      active
        ? "bg-brand/[0.08] text-ink shadow-[inset_0_0_0_1px_rgba(214,58,15,0.12)]"
        : "text-mute hover:bg-[rgba(32,27,18,0.045)] hover:text-ink"
    }`;
  const menuItem = "flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-ink transition-colors hover:bg-bg";

  const renderLink = ({ href, label, Icon }: Item) => {
    const active = isActive(href);
    return (
      <Link key={href} href={href} aria-current={active ? "page" : undefined} className={navLink(active)}>
        {active ? (
          <span
            aria-hidden
            className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full"
            style={{ background: "linear-gradient(180deg, #FF7A4D, #D63A0F)" }}
          />
        ) : null}
        <Icon size={16.5} className={active ? "text-brand-deep" : "text-faint group-hover:text-ink-soft"} />
        {label}
      </Link>
    );
  };

  return (
    <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 self-start py-3.5 pl-3.5 md:block">
      <div className="flex h-full flex-col overflow-hidden rounded-[22px] border border-rule bg-white/[0.66] px-3 pb-3 pt-5 shadow-bar backdrop-blur-[14px]">
        <Link href="/" aria-label="Klimr home" className="shrink-0 px-3">
          <KlimrLogo />
        </Link>

        <div className={`mt-3.5 min-h-0 flex-1 overflow-y-auto scrollbar-hidden ${compact ? "space-y-1" : "space-y-2"}`}>
          {GROUPS.map((g) => {
            if (!g.header) {
              return (
                <nav key="primary" className="flex flex-col gap-0.5" aria-label="Main">
                  {g.items.map(renderLink)}
                </nav>
              );
            }
            const open = !compact || openSection === g.header;
            return (
              <div key={g.header}>
                {compact ? (
                  <button
                    type="button"
                    onClick={() => setOpenSection((cur) => (cur === g.header ? null : g.header!))}
                    aria-expanded={open}
                    className={`${kicker} flex w-full items-center justify-between gap-2 rounded-[10px] px-3 pb-[5px] pt-3 transition-colors hover:text-ink-soft`}
                  >
                    <span>{g.header}</span>
                    <ChevronDown size={13} className={`transition-transform duration-200 ${open ? "" : "-rotate-90"}`} />
                  </button>
                ) : (
                  <p className={`${kicker} px-3 pb-[5px] pt-3`}>{g.header}</p>
                )}
                <div className={`grid transition-[grid-template-rows] duration-200 ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                  <div className="overflow-hidden">
                    <nav className="flex flex-col gap-0.5" aria-label={g.header}>
                      {g.items.map(renderLink)}
                    </nav>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {adminRole ? (
          <div className="mt-2 shrink-0">
            {renderLink({ href: "/admin", label: "Admin", Icon: ShieldCheck })}
          </div>
        ) : null}

        {/* Footer — hairline, invite, then the Daylight user pill. */}
        <div className="mt-2 shrink-0 border-t border-rule-soft pt-2">
          <Link href="/me" aria-current={isActive("/me") ? "page" : undefined} className={navLink(isActive("/me"))}>
            <IdCard size={16.5} className={isActive("/me") ? "text-brand-deep" : "text-faint group-hover:text-ink-soft"} />
            My profile
          </Link>

          <div className="relative mt-1.5">
            {menuOpen ? (
              <div
                ref={menuRef}
                role="menu"
                className="absolute bottom-full left-0 right-0 mb-2 overflow-hidden rounded-2xl border border-rule bg-surface shadow-e3"
              >
                <div className="border-b border-rule-soft px-3.5 py-3">
                  <p className="truncate text-sm font-semibold text-ink">{avatarName}</p>
                  {email ? <p className="truncate text-xs text-faint">{email}</p> : null}
                </div>
                <div className="py-1">
                  <Link href="/account" role="menuitem" onClick={() => setMenuOpen(false)} className={menuItem}>
                    <User size={15} className="text-mute" /> Your account
                  </Link>
                  <Link href="/settings" role="menuitem" onClick={() => setMenuOpen(false)} className={menuItem}>
                    <Settings size={15} className="text-mute" /> Settings
                  </Link>
                  <Link href="/invite" role="menuitem" onClick={() => setMenuOpen(false)} className={menuItem}>
                    <Gift size={15} className="text-mute" /> Invite friends
                    <span className="ml-auto rounded-full bg-bg px-1.5 py-0.5 font-mono text-[8.5px] font-bold uppercase tracking-[.14em] text-faint">Soon</span>
                  </Link>
                </div>
                <div className="border-t border-rule-soft py-1">
                  <a href="mailto:hello@klimr.com?subject=Klimr%20feedback" role="menuitem" className={menuItem}>
                    <MessageSquare size={15} className="text-mute" /> Send feedback
                  </a>
                  <a href="mailto:hello@klimr.com?subject=Klimr%20help" role="menuitem" className={menuItem}>
                    <HelpCircle size={15} className="text-mute" /> Get help
                  </a>
                </div>
                <div className="border-t border-rule-soft py-1">
                  <form action={signOutAction}>
                    <button type="submit" role="menuitem" className={menuItem}>
                      <LogOut size={15} className="text-mute" /> Log out
                    </button>
                  </form>
                </div>
              </div>
            ) : null}
            <button
              ref={btnRef}
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="lift flex w-full items-center gap-2.5 rounded-[13px] border border-rule bg-surface p-2"
            >
              <span className="relative shrink-0">
                <Avatar url={avatarUrl} hue={avatarHue} name={avatarName} size={31} ring />
                <span
                  className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface"
                  style={{ background: presenceDot }}
                  aria-hidden
                />
              </span>
              <span className="min-w-0 flex-1 truncate text-left text-[13px] font-semibold text-ink">{avatarName}</span>
              <ChevronsUpDown size={15} className="shrink-0 text-faint" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
