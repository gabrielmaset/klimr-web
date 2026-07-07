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

// Grouped by intent — Home essentials, then Compete, Community, and Discover.
const GROUPS: { header?: string; items: Item[] }[] = [
  {
    items: [
      { href: "/me", label: "My profile", Icon: IdCard },
      { href: "/feed", label: "Feed", Icon: Newspaper },
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
      { href: "/invites", label: "Invites", Icon: Inbox },
      { href: "/teams", label: "Teams", Icon: Users },
    ],
  },
  {
    header: "Discover",
    items: [
      { href: "/discover", label: "Players", Icon: Radar },
      { href: "/courts", label: "Courts", Icon: MapPin },
      { href: "/marketplace", label: "Marketplace", Icon: ShoppingBag },
      { href: "/classes", label: "Classes", Icon: GraduationCap },
      { href: "/sponsorships", label: "Sponsorships", Icon: Sparkles },
      { href: "/resources", label: "Resources", Icon: BookOpen },
    ],
  },
];

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
  const presenceDot = presenceMode === "away" ? "#f59e0b" : presenceMode === "offline" ? "#a1a1aa" : "#16a34a";

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  // On screens too short to show the whole menu at once, collapse the labeled
  // sections into an accordion (one open at a time) so the menu never scrolls.
  // Tall displays keep every section expanded. Threshold ≈ the full menu's height.
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-height: 1180px)");
    const update = () => setCompact(mq.matches);
    const raf = requestAnimationFrame(update);
    mq.addEventListener("change", update);
    return () => {
      cancelAnimationFrame(raf);
      mq.removeEventListener("change", update);
    };
  }, []);

  // Which labeled section is expanded in compact mode (one at a time). Defaults to
  // the section holding the current page and follows navigation, so where you are
  // is always visible.
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

  const navLink = (active: boolean) =>
    `group flex ${compact ? "h-10" : "h-11"} items-center gap-3 rounded-2xl px-3 text-sm font-semibold transition-colors ${
      active ? "bg-rail-activebg text-rail-active" : "text-rail-fg hover:bg-rail-hover hover:text-white"
    }`;
  const footerLink = (active: boolean) =>
    `group flex h-10 items-center gap-3 rounded-2xl px-3 text-sm font-semibold transition-colors ${
      active ? "bg-rail-activebg text-rail-active" : "text-rail-fg hover:bg-rail-hover hover:text-white"
    }`;
  const menuItem = "flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-ink transition-colors hover:bg-bg";

  const renderLink = ({ href, label, Icon }: Item) => {
    const active = isActive(href);
    return (
      <Link key={href} href={href} aria-current={active ? "page" : undefined} className={navLink(active)}>
        <Icon size={18} className={active ? "text-rail-active" : "text-rail-muted group-hover:text-white"} />
        {label}
      </Link>
    );
  };

  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 self-start p-3 md:block lg:w-64">
      <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-rail-border bg-[linear-gradient(180deg,#0e2c3a,#0a212c)] px-3 py-5 shadow-[0_10px_40px_-15px_rgba(10,10,11,0.5)]">
        <Link href="/" aria-label="Klimr home" className="shrink-0 px-3">
          <KlimrLogo tone="light" />
        </Link>

        {/* The menu never scrolls. On short screens the labeled sections collapse
            into an accordion (one open at a time); the account block stays pinned. */}
        <div className={`mt-7 min-h-0 flex-1 overflow-hidden ${compact ? "space-y-1.5" : "space-y-6"}`}>
          {GROUPS.map((g) => {
            // Primary essentials are always visible in both modes.
            if (!g.header) {
              return (
                <nav key="primary" className="flex flex-col gap-1" aria-label="Main">
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
                    className="kicker flex w-full items-center justify-between gap-2 rounded-xl px-3 py-1.5 text-rail-muted transition-colors hover:text-white"
                  >
                    <span>{g.header}</span>
                    <ChevronDown size={13} className={`transition-transform duration-200 ${open ? "" : "-rotate-90"}`} />
                  </button>
                ) : (
                  <p className="kicker mb-1 px-3 text-rail-muted">{g.header}</p>
                )}
                <div className={`grid transition-[grid-template-rows] duration-200 ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                  <div className="overflow-hidden">
                    <nav className="flex flex-col gap-1 pt-0.5" aria-label={g.header}>
                      {g.items.map(renderLink)}
                    </nav>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Admin — special destination above the account divider. */}
        {adminRole ? (
          <Link href="/admin" aria-current={isActive("/admin") ? "page" : undefined} className={`shrink-0 mt-4 ${footerLink(isActive("/admin"))}`}>
            <ShieldCheck size={17} className={isActive("/admin") ? "text-rail-active" : "text-rail-muted group-hover:text-white"} />
            Admin
          </Link>
        ) : null}

        {/* Account / footer */}
        <div className="shrink-0 mt-3 border-t border-rail-border pt-3">
          <p className="kicker mb-1 px-3 text-rail-muted">Account</p>
          <Link href="/invite" aria-current={isActive("/invite") ? "page" : undefined} className={footerLink(isActive("/invite"))}>
            <Gift size={17} className={isActive("/invite") ? "text-rail-active" : "text-rail-muted group-hover:text-white"} />
            Invite friends
            <span className="ml-auto rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-rail-muted">Soon</span>
          </Link>

          {/* User menu — opens upward, Claude-style */}
          <div className="relative mt-1">
            {menuOpen ? (
              <div
                ref={menuRef}
                role="menu"
                className="absolute bottom-full left-0 right-0 mb-2 overflow-hidden rounded-2xl border border-rule bg-white shadow-[0_18px_50px_-12px_rgba(10,10,11,0.4)]"
              >
                <div className="border-b border-rule px-3.5 py-3">
                  <p className="truncate text-sm font-semibold text-ink">{avatarName}</p>
                  {email ? <p className="truncate text-xs text-faint">{email}</p> : null}
                </div>
                <div className="py-1">
                  <Link href="/me" role="menuitem" onClick={() => setMenuOpen(false)} className={menuItem}>
                    <IdCard size={15} className="text-mute" /> My profile
                  </Link>
                  <Link href="/account" role="menuitem" onClick={() => setMenuOpen(false)} className={menuItem}>
                    <User size={15} className="text-mute" /> Your account
                  </Link>
                  <Link href="/settings" role="menuitem" onClick={() => setMenuOpen(false)} className={menuItem}>
                    <Settings size={15} className="text-mute" /> Settings
                  </Link>
                </div>
                <div className="border-t border-rule py-1">
                  <a href="mailto:hello@klimr.com?subject=Klimr%20feedback" role="menuitem" className={menuItem}>
                    <MessageSquare size={15} className="text-mute" /> Send feedback
                  </a>
                  <a href="mailto:hello@klimr.com?subject=Klimr%20help" role="menuitem" className={menuItem}>
                    <HelpCircle size={15} className="text-mute" /> Get help
                  </a>
                </div>
                <div className="border-t border-rule py-1">
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
              className="lift flex w-full items-center gap-2.5 rounded-2xl bg-white/[0.06] p-2 transition-colors hover:bg-white/[0.10]"
            >
              <span className="relative shrink-0">
                <Avatar url={avatarUrl} hue={avatarHue} name={avatarName} size={30} ring />
                <span
                  className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface"
                  style={{ background: presenceDot }}
                  aria-hidden
                />
              </span>
              <span className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-rail-fg">{avatarName}</span>
              <ChevronsUpDown size={15} className="shrink-0 text-rail-muted" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
