"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Bell, Search, CalendarRange, Menu } from "lucide-react";
import { MobileMenu } from "@/components/mobile-menu";
import { KlimrLogo } from "@/components/logo";
import { NotificationBadge } from "@/components/notification-badge";

export function MobileTopBar({
  unreadCount,
  avatarUrl,
  avatarHue,
  avatarName,
  adminRole,
}: {
  unreadCount: number;
  avatarUrl: string | null;
  avatarHue: number;
  avatarName: string;
  adminRole: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  // Full-screen chat thread has its own header.
  if (pathname.startsWith("/chats/")) return null;

  const active = pathname === "/notifications" || pathname.startsWith("/notifications/");
  const calActive = pathname === "/calendar" || pathname.startsWith("/calendar/");

  return (
    <header className="pt-safe px-safe sticky top-0 z-40 border-b border-rule/70 bg-[#FFFDF8] md:hidden">
      <div className="flex items-center justify-between px-5 py-3">
        <Link href="/" aria-label="Klimr home">
          <KlimrLogo />
        </Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Search"
            onClick={() => window.dispatchEvent(new Event("klimr:open-search"))}
            className="press grid h-9 w-9 place-items-center rounded-full border border-rule bg-surface text-ink"
          >
            <Search size={17} />
          </button>
          <Link
            href="/calendar"
            aria-label="Calendar"
            className="press relative grid h-9 w-9 place-items-center rounded-full border border-rule bg-surface"
          >
            <CalendarRange size={17} className={calActive ? "text-brand-deep" : "text-ink"} />
          </Link>
          <Link
            href="/notifications"
            aria-label="Notifications"
            className="press relative grid h-9 w-9 place-items-center rounded-full border border-rule bg-surface"
          >
            <Bell size={17} className={active ? "text-brand-deep" : "text-ink"} />
            <NotificationBadge initialCount={unreadCount} className="absolute -right-2 -top-1.5 ring-2 ring-surface" />
          </Link>
          <button
            type="button"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
            className="press grid h-9 w-9 place-items-center rounded-full border border-rule bg-surface text-ink"
          >
            <Menu size={18} />
          </button>
        </div>
      </div>
      <MobileMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        avatarUrl={avatarUrl}
        avatarHue={avatarHue}
        avatarName={avatarName}
        adminRole={adminRole}
      />
    </header>
  );
}
