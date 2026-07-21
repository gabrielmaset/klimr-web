"use client";

import { usePathname } from "next/navigation";
import { AutoBreadcrumbs } from "@/components/auto-breadcrumbs";
import { SideNav } from "@/components/side-nav";
import { MobileTopBar } from "@/components/mobile-top-bar";
import { BottomNav } from "@/components/bottom-nav";
import { SiteFooter } from "@/components/site-footer";
import { TopBar, type NextMatch } from "@/components/top-bar";
import { CommandPalette } from "@/components/command-palette";
import type { PresenceMode } from "@/app/account/presence";
import { isStandalonePath } from "@/lib/nav-chrome";

type Team = { id: string; name: string; sport_key: string; category: string };

/**
 * The signed-in chrome (sidebar, top bar, footer). Standalone surfaces — the
 * public event page (/e/...) and the /team/[id] and /tournament/[id] workspaces,
 * which supply their own chrome — step aside via the shared isStandalonePath
 * rule. The check runs client-side from usePathname so it is re-evaluated on
 * every in-app navigation; doing it server-side in the shared root layout left
 * the shell stale after a soft navigation (e.g. arriving at /teams from a public
 * event page showed no sidebar).
 */
export function AppChrome({
  children,
  avatarUrl,
  avatarHue,
  avatarName,
  email,
  adminRole,
  showBusiness = false,
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
  showBusiness?: boolean;
  presenceMode: PresenceMode;
  teams: Team[];
  chatUnread: number;
  unread: number;
  nextMatch: NextMatch;
}) {
  const pathname = usePathname();
  if (isStandalonePath(pathname)) return <>{children}</>;

  return (
    <div className="flex min-h-dvh">
      <SideNav
        avatarUrl={avatarUrl}
        avatarHue={avatarHue}
        avatarName={avatarName}
        email={email}
        adminRole={adminRole}
        showBusiness={showBusiness}
        presenceMode={presenceMode}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar unreadCount={unread} avatarUrl={avatarUrl} avatarHue={avatarHue} avatarName={avatarName} adminRole={adminRole} />
        <TopBar chatUnread={chatUnread} unreadCount={unread} presenceMode={presenceMode} nextMatch={nextMatch} teams={teams} />
        <main className="flex-1"><AutoBreadcrumbs />{children}</main>
        <SiteFooter authed />
        <BottomNav avatarUrl={avatarUrl} avatarHue={avatarHue} avatarName={avatarName} chatUnread={chatUnread} />
      </div>
      <CommandPalette />
    </div>
  );
}
