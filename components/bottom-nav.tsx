"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Newspaper, MessageCircle, Swords, Trophy } from "lucide-react";
import { Avatar } from "@/components/avatar";

const TABS = [
  { href: "/feed", label: "Feed", Icon: Newspaper },
  { href: "/chats", label: "Chats", Icon: MessageCircle },
  { href: "/play", label: "Play", Icon: Swords },
  { href: "/rankings", label: "Rankings", Icon: Trophy },
];

// Secondary destinations all live under the "You" tab (account screen).
const YOU = ["/me", "/calendar", "/account", "/settings", "/sponsorships", "/teams", "/courts", "/challenges", "/events", "/marketplace", "/resources", "/discover", "/invite", "/network", "/invites"];

export function BottomNav({
  avatarUrl,
  avatarHue,
  avatarName,
  chatUnread,
}: {
  avatarUrl: string | null;
  avatarHue: number;
  avatarName: string;
  chatUnread: number;
}) {
  const pathname = usePathname();
  // Full-screen chat thread: hide app nav like WhatsApp / IG DMs do.
  if (pathname.startsWith("/chats/")) return null;

  const youActive = YOU.some((p) => pathname === p || pathname.startsWith(p + "/"));
  const tabMatch = TABS.findIndex((t) => pathname === t.href || pathname.startsWith(t.href + "/"));
  const activeIndex = youActive ? 4 : tabMatch;

  return (
    <>
      {/* reserve space so the fixed bar never covers content (incl. the home-indicator inset) */}
      <div className="md:hidden" style={{ height: "calc(var(--bottom-nav-h) + env(safe-area-inset-bottom))" }} aria-hidden />
      <nav
        className="pb-safe px-safe fixed bottom-0 left-0 right-0 z-40 border-t border-rule/70 bg-white/80 backdrop-blur-xl backdrop-saturate-150 md:hidden"
        aria-label="Primary"
      >
        <div className="relative mx-auto grid max-w-2xl grid-cols-5">
          {/* highlight that slides to the active tab */}
          <span
            className="pointer-events-none absolute top-1.5 h-9 rounded-2xl bg-tint-brand transition-all duration-300 ease-out"
            style={{ left: `calc(${activeIndex * 20}% + 0.375rem)`, width: "calc(20% - 0.75rem)", opacity: activeIndex < 0 ? 0 : 1 }}
            aria-hidden
          />
          {TABS.map(({ href, label, Icon }, i) => {
            const active = activeIndex === i;
            const badge = href === "/chats" ? chatUnread : 0;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className="relative z-10 flex flex-col items-center gap-0.5 pb-2 pt-2.5 text-[11px] font-semibold"
              >
                <span className="relative">
                  <Icon size={20} className={active ? "text-brand-deep" : "text-mute"} />
                  {badge > 0 ? (
                    <span className="absolute -right-2 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[9px] font-bold text-white">
                      {badge > 9 ? "9+" : badge}
                    </span>
                  ) : null}
                </span>
                <span className={active ? "text-brand-deep" : "text-mute"}>{label}</span>
              </Link>
            );
          })}
          <Link
            href="/me"
            aria-current={youActive ? "page" : undefined}
            className="relative z-10 flex flex-col items-center gap-0.5 pb-2 pt-2.5 text-[11px] font-semibold"
          >
            <span className={youActive ? "ring-2 ring-brand rounded-full" : ""}>
              <Avatar url={avatarUrl} hue={avatarHue} name={avatarName} size={20} />
            </span>
            <span className={youActive ? "text-brand-deep" : "text-mute"}>You</span>
          </Link>
        </div>
      </nav>
    </>
  );
}
