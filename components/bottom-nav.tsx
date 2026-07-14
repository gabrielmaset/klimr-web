"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Newspaper, MessageCircle, Swords, Trophy } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { CountBadge } from "@/components/count-badge";

const TABS = [
  { href: "/feed", label: "Feed", Icon: Newspaper },
  { href: "/chats", label: "Chats", Icon: MessageCircle },
  { href: "/play", label: "Play", Icon: Swords },
  { href: "/rankings", label: "Rankings", Icon: Trophy },
];

// Secondary destinations all live under the "You" tab (account screen).
const YOU = ["/me", "/calendar", "/account", "/settings", "/sponsorships", "/teams", "/courts", "/challenges", "/events", "/marketplace", "/resources", "/discover", "/invite", "/network", "/invites"];

/* Active treatment (Material-3 style): every tab has a fixed 56×30 icon slot,
   and ONE sliding pill sized to exactly that slot — geometric identity, so the
   highlight can never intersect the label. Labels just change color. */
const SLOT = "grid h-[30px] w-14 place-items-center";

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
        className="pb-safe px-safe fixed bottom-0 left-0 right-0 z-40 border-t border-rule/70 bg-[#FFFDF8] md:hidden"
        aria-label="Primary"
      >
        <div className="relative mx-auto grid max-w-2xl grid-cols-5">
          {/* the one highlight: a pill that slides between icon slots */}
          <span
            className="pointer-events-none absolute top-1.5 h-[30px] w-14 -translate-x-1/2 rounded-full bg-tint-brand transition-[left,opacity] duration-300 ease-out"
            style={{ left: `${activeIndex * 20 + 10}%`, opacity: activeIndex < 0 ? 0 : 1 }}
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
                className="relative z-10 flex flex-col items-center gap-0.5 pb-2 pt-1.5 text-[11px] font-semibold"
              >
                <span className={`relative ${SLOT}`}>
                  <Icon size={20} className={active ? "text-brand-deep" : "text-mute"} />
                  <CountBadge count={badge} className="absolute -right-2 -top-1 ring-2 ring-surface" />
                </span>
                <span className={active ? "text-flame-text" : "text-mute"}>{label}</span>
              </Link>
            );
          })}
          <Link
            href="/me"
            aria-current={youActive ? "page" : undefined}
            className="relative z-10 flex flex-col items-center gap-0.5 pb-2 pt-1.5 text-[11px] font-semibold"
          >
            <span className={SLOT}>
              <span className={youActive ? "rounded-full ring-2 ring-brand" : ""} style={{ display: "grid" }}>
                <Avatar url={avatarUrl} hue={avatarHue} name={avatarName} size={20} />
              </span>
            </span>
            <span className={youActive ? "text-flame-text" : "text-mute"}>You</span>
          </Link>
        </div>
      </nav>
    </>
  );
}
