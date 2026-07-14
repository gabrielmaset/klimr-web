"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X, ShieldCheck, IdCard, User, Settings, Gift, LogOut } from "lucide-react";
import { NAV_GROUPS, type NavItem } from "@/lib/nav";
import { Avatar } from "@/components/avatar";
import { signOutAction } from "@/app/auth/actions";

/** The phone menu — a right-edge drawer (the ☰ lives top-right) that slides
 *  over the page: the desktop rail's anatomy (list rows, mono kickers, flame
 *  active state), none of its footprint. Every row closes it; so do the
 *  scrim, the X, and Escape. */
export function MobileMenu({
  open,
  onClose,
  avatarUrl,
  avatarHue,
  avatarName,
  adminRole,
}: {
  open: boolean;
  onClose: () => void;
  avatarUrl: string | null;
  avatarHue: number;
  avatarName: string;
  adminRole: boolean;
}) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const row = (active: boolean) =>
    `group relative flex h-10 items-center gap-3 rounded-[10px] px-3 text-[13.5px] font-semibold transition-colors ${
      active ? "bg-brand/[0.08] text-ink shadow-[inset_0_0_0_1px_rgba(214,58,15,0.12)]" : "text-mute active:bg-[rgba(32,27,18,0.05)]"
    }`;

  const renderItem = ({ href, label, Icon }: NavItem) => {
    const active = isActive(href);
    return (
      <Link key={href} href={href} onClick={onClose} aria-current={active ? "page" : undefined} className={row(active)}>
        {active ? (
          <span aria-hidden className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full" style={{ background: "linear-gradient(180deg, #FF7A4D, #D63A0F)" }} />
        ) : null}
        <Icon size={17} className={active ? "text-brand-deep" : "text-faint"} />
        {label}
      </Link>
    );
  };

  return (
    <div className="md:hidden" aria-hidden={!open}>
      <div
        onClick={onClose}
        aria-hidden
        className={`fixed inset-0 z-[58] bg-ink/30 transition-opacity duration-200 ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className={`pt-safe pb-safe fixed inset-y-0 right-0 z-[59] flex w-[302px] max-w-[86vw] transform flex-col border-l border-rule bg-[#FFFDF8] shadow-e3 transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-rule-soft px-4 py-3.5">
          <Avatar url={avatarUrl} hue={avatarHue} name={avatarName} size={34} ring />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-ink">{avatarName}</p>
            <p className="font-mono text-[8.5px] font-bold uppercase tracking-[.18em] text-faint">Menu</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="press grid h-9 w-9 place-items-center rounded-full border border-rule bg-surface text-mute"
          >
            <X size={16} />
          </button>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2" aria-label="Main">
          {NAV_GROUPS.map((g) => (
            <div key={g.header ?? "primary"}>
              {g.header ? (
                <p className="px-3 pb-1 pt-3.5 font-mono text-[9px] font-bold uppercase tracking-[.18em] text-faint">{g.header}</p>
              ) : null}
              <div className="flex flex-col gap-0.5">{g.items.map(renderItem)}</div>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-rule-soft px-3 py-2">
          {adminRole ? renderItem({ href: "/admin", label: "Admin", Icon: ShieldCheck }) : null}
          {renderItem({ href: "/me", label: "My profile", Icon: IdCard })}
          {renderItem({ href: "/account", label: "Account", Icon: User })}
          {renderItem({ href: "/settings", label: "Settings", Icon: Settings })}
          <Link href="/invite" onClick={onClose} className={row(isActive("/invite"))}>
            <Gift size={17} className="text-faint" />
            Invite friends
            <span className="ml-auto rounded-full bg-bg px-1.5 py-0.5 font-mono text-[8.5px] font-bold uppercase tracking-[.14em] text-faint">Soon</span>
          </Link>
          <form action={signOutAction}>
            <button type="submit" className={`${row(false)} w-full`}>
              <LogOut size={17} className="text-faint" />
              Sign out
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
