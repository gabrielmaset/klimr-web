import { KlimrLogo } from "@/components/logo";
import { type NextMatch } from "@/components/top-bar";
import { AppChrome } from "@/components/app-chrome";
import { PublicChrome } from "@/components/public-chrome";
import type { PresenceMode } from "@/app/account/presence";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTopBarData } from "@/lib/chrome-data";
import { isStandalonePath } from "@/lib/nav-chrome";
import { headers } from "next/headers";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The public event page (/e/...) and the team/tournament workspaces are
  // "standalone" — they bring their own chrome — so they must render in every
  // auth state, including for a user who still owes a 2FA step-up. We read the
  // server path here only to let those surfaces skip the MFA gate below; the
  // actual show/hide of the shell is decided client-side (AppChrome /
  // PublicChrome) so it never goes stale on in-app navigation.
  const serverPath = (await headers()).get("x-pathname") ?? "";
  const standalone = isStandalonePath(serverPath);

  // MFA pending (signed in at aal1 but a step-up is required): show ONLY the
  // 2FA challenge — no sidebar, no name, no account chrome.
  if (user && !standalone) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
      return (
        <div className="flex min-h-dvh flex-col">
          <header className="px-5 py-5 sm:px-8">
            <Link href="/" aria-label="Klimr home">
              <KlimrLogo />
            </Link>
          </header>
          <main className="flex flex-1 items-start justify-center px-5">{children}</main>
        </div>
      );
    }
  }

  let avatarUrl: string | null = null;
  let avatarHue = 200;
  let avatarName = user?.email ?? "You";
  let adminRole: string | null = null;
  let unread = 0;
  let chatUnread = 0;
  let presenceMode: PresenceMode = "auto";
  let nextMatch: NextMatch = null;
  let teams: { id: string; name: string; sport_key: string; category: string }[] = [];
  if (user) {
    const { data: p } = await supabase
      .from("profiles")
      .select("display_name, avatar_hue, avatar_path, last_seen_at")
      .eq("id", user.id)
      .single();
    if (p) {
      avatarHue = p.avatar_hue ?? 200;
      avatarName = p.display_name || user.email || "You";
      avatarUrl = p.avatar_path ? supabase.storage.from("avatars").getPublicUrl(p.avatar_path).data.publicUrl : null;
      // Presence heartbeat — touch last_seen at most ~once a minute of activity.
      // eslint-disable-next-line react-hooks/purity
      const nowMs = Date.now();
      const lastSeen = p.last_seen_at ? Date.parse(p.last_seen_at) : 0;
      if (!lastSeen || nowMs - lastSeen > 60_000) {
        await supabase.from("profiles").update({ last_seen_at: new Date(nowMs).toISOString() }).eq("id", user.id);
      }
    }

    // Admin role drives the SideNav admin link (not part of the shared bar).
    const { data: r } = await supabase.rpc("current_admin_role");
    adminRole = typeof r === "string" ? r : null;

    // Everything the global TopBar needs (teams, unread, chat, presence, next
    // match) comes from one shared helper so the workspaces show the same bar.
    const bar = await getTopBarData(supabase, user.id);
    presenceMode = bar.presenceMode;
    teams = bar.teams;
    unread = bar.unread;
    chatUnread = bar.chatUnread;
    nextMatch = bar.nextMatch;
  }

  // Logged-out: a client chrome that shows the slim top bar + footer on normal
  // pages and steps aside on standalone surfaces — decided from the live path so
  // it stays correct across soft navigation.
  if (!user) {
    return <PublicChrome>{children}</PublicChrome>;
  }

  // Signed-in: chrome decided client-side (so it updates across in-app navigation).
  return (
    <AppChrome
      avatarUrl={avatarUrl}
      avatarHue={avatarHue}
      avatarName={avatarName}
      email={user?.email ?? null}
      adminRole={!!adminRole}
      presenceMode={presenceMode}
      teams={teams}
      chatUnread={chatUnread}
      unread={unread}
      nextMatch={nextMatch}
    >
      {children}
    </AppChrome>
  );
}
