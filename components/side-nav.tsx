"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Newspaper, MessageCircle, Swords, Trophy, Sparkles, Settings, ShieldCheck, LogOut, Bell, Users, MapPin, Flag, CalendarDays, ShoppingBag, BookOpen, Radar, Gift } from "lucide-react";
import { signOutAction } from "@/app/auth/actions";
import { KlimrLogo } from "@/components/logo";
import { Avatar } from "@/components/avatar";

const MAIN = [
  { href: "/feed", label: "Feed", Icon: Newspaper },
  { href: "/chats", label: "Chats", Icon: MessageCircle },
  { href: "/notifications", label: "Notifications", Icon: Bell },
  { href: "/play", label: "Play", Icon: Swords },
  { href: "/discover", label: "Discover", Icon: Radar },
  { href: "/rankings", label: "Rankings", Icon: Trophy },
];

const EXPLORE = [
  { href: "/challenges", label: "Challenges", Icon: Flag },
  { href: "/teams", label: "Teams", Icon: Users },
  { href: "/courts", label: "Courts", Icon: MapPin },
  { href: "/events", label: "Events", Icon: CalendarDays },
  { href: "/marketplace", label: "Marketplace", Icon: ShoppingBag },
  { href: "/sponsorships", label: "Sponsorships", Icon: Sparkles },
  { href: "/resources", label: "Resources", Icon: BookOpen },
];

const SLOT = 48; // 44px item (h-11) + 4px gap

export function SideNav({
  avatarUrl,
  avatarHue,
  avatarName,
  adminRole,
  unreadCount,
}: {
  avatarUrl: string | null;
  avatarHue: number;
  avatarName: string;
  adminRole: boolean;
  unreadCount: number;
}) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const main = adminRole ? [...MAIN, { href: "/admin", label: "Admin", Icon: ShieldCheck }] : MAIN;
  const activeIndex = main.findIndex((i) => isActive(i.href));

  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col self-start overflow-y-auto border-r border-rule/70 bg-white/65 px-3 py-5 backdrop-blur-xl backdrop-saturate-150 md:flex">
      <Link href="/" aria-label="Klimr home" className="px-3">
        <KlimrLogo />
      </Link>

      <nav className="relative mt-7 flex flex-col gap-1" aria-label="Main">
        {/* highlight that slides to the active item */}
        <span
          className="pointer-events-none absolute left-0 right-0 h-11 rounded-2xl bg-tint-brand transition-all duration-300 ease-out"
          style={{ top: activeIndex * SLOT, opacity: activeIndex < 0 ? 0 : 1 }}
          aria-hidden
        />
        {main.map(({ href, label, Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`relative z-10 flex h-11 items-center gap-3 rounded-2xl px-3 text-sm font-semibold transition-colors ${
                active ? "text-brand-deep" : "text-ink hover:text-brand-deep"
              }`}
            >
              <Icon size={18} className={active ? "text-brand" : "text-mute"} />
              {label}
              {href === "/notifications" && unreadCount > 0 ? (
                <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1.5 text-[10px] font-bold text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <p className="kicker mb-1 mt-6 px-3 text-faint">Explore</p>
      <nav className="flex flex-col gap-1" aria-label="Explore">
        {EXPLORE.map(({ href, label, Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex h-11 items-center gap-3 rounded-2xl px-3 text-sm font-semibold transition-colors ${
                active ? "bg-tint-brand text-brand-deep" : "text-ink hover:text-brand-deep"
              }`}
            >
              <Icon size={18} className={active ? "text-brand" : "text-mute"} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="flex-1" />

      <div className="flex flex-col gap-0.5">
        <Link
          href="/invite"
          className={`flex h-10 items-center gap-3 rounded-2xl px-3 text-sm font-semibold transition-colors ${
            isActive("/invite") ? "text-brand-deep" : "text-ink hover:text-brand-deep"
          }`}
        >
          <Gift size={17} className={isActive("/invite") ? "text-brand" : "text-mute"} />
          Invite friends
          <span className="ml-auto rounded-full bg-[#f4f4f5] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-faint">Soon</span>
        </Link>
        <Link
          href="/settings"
          className={`flex h-10 items-center gap-3 rounded-2xl px-3 text-sm font-semibold transition-colors ${
            isActive("/settings") ? "text-brand-deep" : "text-ink hover:text-brand-deep"
          }`}
        >
          <Settings size={17} className={isActive("/settings") ? "text-brand" : "text-mute"} />
          Settings
        </Link>

        <Link href="/account" className="lift mt-1 flex items-center gap-2.5 rounded-2xl border border-rule bg-surface/70 p-2">
          <Avatar url={avatarUrl} hue={avatarHue} name={avatarName} size={32} ring />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{avatarName}</span>
        </Link>
        <form action={signOutAction}>
          <button className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-sm font-semibold text-mute transition-colors hover:text-ink">
            <LogOut size={16} className="text-faint" />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
