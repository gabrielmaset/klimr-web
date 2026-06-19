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
  chatUnread,
}: {
  avatarUrl: string | null;
  avatarHue: number;
  avatarName: string;
  adminRole: boolean;
  unreadCount: number;
  chatUnread: number;
}) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const activeIndex = MAIN.findIndex((i) => isActive(i.href));

  const footerLink = (active: boolean) =>
    `flex h-10 items-center gap-3 rounded-2xl px-3 text-sm font-semibold transition-colors ${
      active ? "bg-tint-brand text-brand-deep" : "text-ink hover:text-brand-deep"
    }`;

  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 self-start p-3 md:block">
      <div className="flex h-full flex-col overflow-y-auto rounded-3xl border border-rule/60 bg-white/70 px-3 py-5 shadow-[0_10px_40px_-15px_rgba(10,10,11,0.2)] backdrop-blur-2xl backdrop-saturate-150">
        <Link href="/" aria-label="Klimr home" className="px-3">
          <KlimrLogo />
        </Link>

        <p className="kicker mb-1 mt-7 px-3 text-faint">Main</p>
        <nav className="relative flex flex-col gap-1" aria-label="Main">
          {/* highlight that slides to the active item */}
          <span
            className="pointer-events-none absolute left-0 right-0 h-11 rounded-2xl bg-tint-brand transition-all duration-300 ease-out"
            style={{ top: activeIndex * SLOT, opacity: activeIndex < 0 ? 0 : 1 }}
            aria-hidden
          />
          {MAIN.map(({ href, label, Icon }) => {
            const active = isActive(href);
            const badge = href === "/chats" ? chatUnread : href === "/notifications" ? unreadCount : 0;
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
                {badge > 0 ? (
                  <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1.5 text-[10px] font-bold text-white">
                    {badge > 99 ? "99+" : badge}
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

        {/* Admin — a special destination, on its own line above the account
            divider, with guaranteed space from Explore on short screens. */}
        {adminRole ? (
          <Link href="/admin" aria-current={isActive("/admin") ? "page" : undefined} className={`mt-6 ${footerLink(isActive("/admin"))}`}>
            <ShieldCheck size={17} className={isActive("/admin") ? "text-brand" : "text-mute"} />
            Admin
          </Link>
        ) : null}

        {/* Account / footer — separated from the menu with a hairline so it reads
            as a footer, and styled to sit on the glass panel rather than as a box. */}
        <div className="mt-3 border-t border-rule/60 pt-3">
          <p className="kicker mb-1 px-3 text-faint">Account</p>
          <nav className="flex flex-col gap-0.5" aria-label="Account">
            <Link href="/settings" aria-current={isActive("/settings") ? "page" : undefined} className={footerLink(isActive("/settings"))}>
              <Settings size={17} className={isActive("/settings") ? "text-brand" : "text-mute"} />
              Settings
            </Link>
            <Link href="/invite" aria-current={isActive("/invite") ? "page" : undefined} className={footerLink(isActive("/invite"))}>
              <Gift size={17} className={isActive("/invite") ? "text-brand" : "text-mute"} />
              Invite friends
              <span className="ml-auto rounded-full bg-[#f4f4f5] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-faint">Soon</span>
            </Link>
          </nav>

          <Link
            href="/account"
            aria-current={isActive("/account") ? "page" : undefined}
            className="lift mt-2 flex items-center gap-2.5 rounded-2xl bg-black/[0.04] p-2 transition-colors hover:bg-black/[0.07]"
          >
            <Avatar url={avatarUrl} hue={avatarHue} name={avatarName} size={30} ring />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{avatarName}</span>
          </Link>
          <form action={signOutAction}>
            <button
              type="submit"
              className="press mt-0.5 flex w-full items-center gap-2 rounded-xl px-3 py-1.5 text-left text-xs font-medium text-faint transition-colors hover:bg-black/[0.04] hover:text-ink"
            >
              <LogOut size={14} className="text-faint" />
              Sign out
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
