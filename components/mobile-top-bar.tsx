"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Search, CalendarRange } from "lucide-react";
import { KlimrLogo } from "@/components/logo";

export function MobileTopBar({ unreadCount }: { unreadCount: number }) {
  const pathname = usePathname();
  // Full-screen chat thread has its own header.
  if (pathname.startsWith("/chats/")) return null;

  const active = pathname === "/notifications" || pathname.startsWith("/notifications/");
  const calActive = pathname === "/calendar" || pathname.startsWith("/calendar/");

  return (
    <header className="pt-safe px-safe sticky top-0 z-40 border-b border-rule/70 bg-white/80 backdrop-blur-xl backdrop-saturate-150 md:hidden">
      <div className="flex items-center justify-between px-5 py-3">
        <Link href="/" aria-label="Klimr home">
          <KlimrLogo />
        </Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Search"
            onClick={() => window.dispatchEvent(new Event("klimr:open-search"))}
            className="press grid h-9 w-9 place-items-center rounded-full border border-rule bg-white/60 text-ink"
          >
            <Search size={17} />
          </button>
          <Link
            href="/calendar"
            aria-label="Calendar"
            className="press relative grid h-9 w-9 place-items-center rounded-full border border-rule bg-white/60"
          >
            <CalendarRange size={17} className={calActive ? "text-brand-deep" : "text-ink"} />
          </Link>
          <Link
            href="/notifications"
            aria-label="Notifications"
            className="press relative grid h-9 w-9 place-items-center rounded-full border border-rule bg-white/60"
          >
            <Bell size={17} className={active ? "text-brand-deep" : "text-ink"} />
            {unreadCount > 0 ? (
              <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[9px] font-bold text-white shadow-md shadow-brand/25">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            ) : null}
          </Link>
        </div>
      </div>
    </header>
  );
}
