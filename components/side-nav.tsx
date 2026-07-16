"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings, ShieldCheck, LogOut, User, Gift, ChevronsUpDown, IdCard, ChevronDown, ChevronLeft, ChevronRight, MessageSquare, HelpCircle } from "lucide-react";
import { signOutAction } from "@/app/auth/actions";
import { NAV_GROUPS, type NavItem } from "@/lib/nav";
import { KlimrLogo } from "@/components/logo";
import { Avatar } from "@/components/avatar";
import type { PresenceMode } from "@/app/account/presence";

type Item = NavItem;

// Daylight §2.1 grouping. Invites (Community) and Sponsorships (Discover) are
// live destinations kept beyond the spec's list — flagged in DESIGN_DECISIONS.
const GROUPS = NAV_GROUPS;

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
  // Rail collapse: icon-only under ~1180px (tablets) unless the user chose;
  // the chevron persists their choice.
  const [railStored, setRailStored] = useState<boolean | null>(null);
  const [railAuto, setRailAuto] = useState(false);
  // ≤1180px: the rail stays icon-width in the flow and EXPANDS AS AN OVERLAY
  // over the page (transient — closes on navigation/outside click), so
  // content never reflows on tablets. >1180px: in-flow, choice persisted.
  const overlayMode = railAuto;
  const [overlayOpen, setOverlayOpen] = useState(false);
  const collapsed = overlayMode ? !overlayOpen : (railStored ?? false);
  const asideRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const saved = window.localStorage.getItem("klimr.rail");
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
    window.localStorage.setItem("klimr.rail", next ? "1" : "0");
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
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        title={collapsed ? label : undefined}
        onClick={closeOverlay}
        className={`${navLink(active)} ${collapsed ? "justify-center px-0" : ""}`}
      >
        {active ? (
          <span
            aria-hidden
            className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full"
            style={{ background: "linear-gradient(180deg, #FF7A4D, #D63A0F)" }}
          />
        ) : null}
        <Icon size={16.5} className={active ? "text-brand-deep" : "text-faint group-hover:text-ink-soft"} />
        <span className={collapsed ? "sr-only" : ""}>{label}</span>
      </Link>
    );
  };

  return (
    <aside ref={asideRef} className={`group/rail relative sticky top-[var(--topbar-h,0px)] z-[45] hidden h-[calc(100dvh-var(--topbar-h,0px))] shrink-0 self-start py-3.5 pl-3.5 transition-[width] duration-200 md:block ${overlayMode ? "w-[76px]" : collapsed ? "w-[76px]" : "w-[248px]"}`}>
      <div
        className={`flex flex-col rounded-[22px] border border-rule bg-white/[0.66] pb-3 pt-5 backdrop-blur-[14px] transition-[width,box-shadow] duration-200 ${collapsed ? "px-2" : "px-3"} ${
          overlayMode && overlayOpen ? "absolute inset-y-3.5 left-3.5 z-10 w-[234px] shadow-e3" : "relative h-full w-auto shadow-bar"
        }`}
      >
        <button
          type="button"
          onClick={toggleRail}
          aria-label={collapsed ? "Expand menu" : "Collapse menu"}
          title={collapsed ? "Expand menu" : "Collapse menu"}
          className="press absolute -right-[11px] top-[22px] z-20 grid h-6 w-6 place-items-center rounded-full border border-rule bg-surface text-mute shadow-e1 transition-colors hover:text-ink"
        >
          {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
        </button>
        <Link href="/" aria-label="Klimr home" className={`shrink-0 ${collapsed ? "self-center px-0" : "px-3"}`}>
          <KlimrLogo textClassName={collapsed ? "hidden" : "text-[26px]"} />
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
            const open = collapsed || !compact || openSection === g.header;
            return (
              <div key={g.header}>
                {collapsed ? (
                  <div aria-hidden className="mx-2 my-2 border-t border-rule-soft" />
                ) : compact ? (
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
          <Link
            href="/me"
            aria-current={isActive("/me") ? "page" : undefined}
            title={collapsed ? "My profile" : undefined}
            onClick={closeOverlay}
            className={`${navLink(isActive("/me"))} ${collapsed ? "justify-center px-0" : ""}`}
          >
            <IdCard size={16.5} className={isActive("/me") ? "text-brand-deep" : "text-faint group-hover:text-ink-soft"} />
            <span className={collapsed ? "sr-only" : ""}>My profile</span>
          </Link>

          <div className="relative mt-1.5">
            {menuOpen ? (
              <div
                ref={menuRef}
                role="menu"
                className={`absolute bottom-full mb-2 overflow-hidden rounded-2xl border border-rule bg-surface shadow-e3 ${collapsed ? "left-0 w-60" : "left-0 right-0"}`}
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
              className={`lift flex w-full items-center rounded-[13px] border border-rule bg-surface p-2 ${collapsed ? "justify-center gap-0" : "gap-2.5"}`}
            >
              <span className="relative shrink-0">
                <Avatar url={avatarUrl} hue={avatarHue} name={avatarName} size={31} ring />
                <span
                  className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface"
                  style={{ background: presenceDot }}
                  aria-hidden
                />
              </span>
              {collapsed ? null : (
                <>
                  <span className="min-w-0 flex-1 truncate text-left text-[13px] font-semibold text-ink">{avatarName}</span>
                  <ChevronsUpDown size={15} className="shrink-0 text-faint" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
