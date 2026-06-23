"use client";

import { usePathname } from "next/navigation";
import { SideNav } from "@/components/side-nav";
import { MobileTopBar } from "@/components/mobile-top-bar";
import { BottomNav } from "@/components/bottom-nav";
import { SiteFooter } from "@/components/site-footer";
import { TopBar, type NextMatch } from "@/components/top-bar";
import { CommandPalette } from "@/components/command-palette";
import type { PresenceMode } from "@/app/account/presence";

type Team = { id: string; name: string; sport_key: string; category: string };

/**
 * The signed-in chrome (sidebar, top bar, footer). The team (/team/[id]/*) and
 * tournament (/tournament/[id]/*) workspaces render their own chrome via their
 * own layouts, so the personal shell steps aside for them. This decision is made
 * client-side from usePathname so it updates correctly on in-app navigation
 * (e.g. switching out of a Pro workspace into a recreational team page) — doing
 * it in the shared root layout left the chrome stale after a soft navigation.
 */
export function AppChrome({
  children,
  avatarUrl,
  avatarHue,
  avatarName,
  email,
  adminRole,
  presenceMode,
  teams,
  chatUnread,
  unread,
  nextMatch,
}: {
  children: React.ReactNode;
  avatarUrl: string | null;
  avatarHue: number;
  avatarName: string;
  email: string | null;
  adminRole: boolean;
  presenceMode: PresenceMode;
  teams: Team[];
  chatUnread: number;
  unread: number;
  nextMatch: NextMatch;
}) {
  const pathname = usePathname();
  if (pathname.startsWith("/team/") || pathname.startsWith("/tournament/") || pathname.startsWith("/e/")) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-dvh">
      <SideNav
        avatarUrl={avatarUrl}
        avatarHue={avatarHue}
        avatarName={avatarName}
        email={email}
        adminRole={adminRole}
        presenceMode={presenceMode}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar unreadCount={unread} />
        <TopBar chatUnread={chatUnread} unreadCount={unread} presenceMode={presenceMode} nextMatch={nextMatch} teams={teams} />
        <main className="flex-1">{children}</main>
        <SiteFooter authed />
        <BottomNav avatarUrl={avatarUrl} avatarHue={avatarHue} avatarName={avatarName} chatUnread={chatUnread} />
      </div>
      <CommandPalette />
    </div>
  );
}
