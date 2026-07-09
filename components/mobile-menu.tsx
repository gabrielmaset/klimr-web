"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  X, IdCard, Newspaper, Swords, Trophy, Flag, Medal, CalendarDays, Contact, Users, Inbox,
  Radar, MapPin, ShoppingBag, GraduationCap, Sparkles, BookOpen, Settings, User, Gift, ShieldCheck, LogOut, CalendarRange, Bell,
} from "lucide-react";
import { signOutAction } from "@/app/auth/actions";
import { Avatar } from "@/components/avatar";

type Item = { href: string; label: string; Icon: typeof X };

const PRIMARY: Item[] = [
  { href: "/me", label: "My profile", Icon: IdCard },
  { href: "/feed", label: "Home", Icon: Newspaper },
  { href: "/play", label: "Play", Icon: Swords },
  { href: "/rankings", label: "Rankings", Icon: Trophy },
];
const GROUPS: { header: string; items: Item[] }[] = [
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
      { href: "/classes", label: "Classes", Icon: GraduationCap },
      { href: "/sponsorships", label: "Sponsorships", Icon: Sparkles },
      { href: "/resources", label: "Playbook", Icon: BookOpen },
    ],
  },
  {
    header: "Your account",
    items: [
      { href: "/calendar", label: "Calendar", Icon: CalendarRange },
      { href: "/notifications", label: "Notifications", Icon: Bell },
      { href: "/account", label: "Account", Icon: User },
      { href: "/settings", label: "Settings", Icon: Settings },
      { href: "/invite", label: "Invite friends", Icon: Gift },
    ],
  },
];

/** Full-screen mobile navigation sheet (the Facebook pattern): every
 *  destination in one tap-friendly grouped grid. Solid surfaces — no blur —
 *  so it stays fast on mobile WebKit. */
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

  // Close when navigation happens; lock body scroll while open.
  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const tile = (it: Item) => {
    const active = pathname === it.href || pathname.startsWith(it.href + "/");
    return (
      <Link
        key={it.href}
        href={it.href}
        className={`press flex items-center gap-2.5 rounded-[14px] border px-3 py-3 text-[13.5px] font-semibold ${
          active ? "border-tint-brand-bd bg-tint-brand text-flame-text" : "border-rule bg-surface text-ink"
        }`}
      >
        <it.Icon size={17} className={active ? "text-brand-deep" : "text-mute"} />
        {it.label}
      </Link>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
      <div className="pt-safe px-safe border-b border-rule bg-[#FFFDF8]">
        <div className="flex items-center justify-between px-5 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <Avatar url={avatarUrl} hue={avatarHue} name={avatarName} size={34} ring />
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold text-ink">{avatarName}</span>
              <span className="block font-mono text-[9px] font-bold uppercase tracking-[.16em] text-faint">Menu</span>
            </span>
          </div>
          <button type="button" aria-label="Close menu" onClick={onClose} className="press grid h-9 w-9 place-items-center rounded-full border border-rule bg-surface text-ink">
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="px-safe min-h-0 flex-1 overflow-y-auto px-5 pb-10 pt-4">
        <div className="grid grid-cols-2 gap-2">{PRIMARY.map(tile)}</div>
        {GROUPS.map((g) => (
          <div key={g.header} className="mt-5">
            <p className="mb-2 font-mono text-[9px] font-bold uppercase tracking-[.18em] text-faint">{g.header}</p>
            <div className="grid grid-cols-2 gap-2">{g.items.map(tile)}</div>
          </div>
        ))}
        {adminRole ? (
          <div className="mt-5">
            <p className="mb-2 font-mono text-[9px] font-bold uppercase tracking-[.18em] text-faint">Admin</p>
            <div className="grid grid-cols-2 gap-2">{tile({ href: "/admin", label: "Admin", Icon: ShieldCheck })}</div>
          </div>
        ) : null}
        <form action={signOutAction} className="mt-6">
          <button type="submit" className="press flex w-full items-center justify-center gap-2 rounded-[14px] border border-rule bg-surface px-3 py-3 text-[13.5px] font-semibold text-mute">
            <LogOut size={16} /> Log out
          </button>
        </form>
      </div>
    </div>
  );
}
