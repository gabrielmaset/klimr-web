import { SiteHeader } from "@/components/site-header";
import { SideNav } from "@/components/side-nav";
import { MobileTopBar } from "@/components/mobile-top-bar";
import { BottomNav } from "@/components/bottom-nav";
import { SiteFooter } from "@/components/site-footer";
import { KlimrLogo } from "@/components/logo";
import { TopBar, type NextMatch } from "@/components/top-bar";
import { CommandPalette } from "@/components/command-palette";
import type { PresenceMode } from "@/app/account/presence";
import { headers } from "next/headers";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // MFA pending (signed in at aal1 but a step-up is required): show ONLY the
  // 2FA challenge — no sidebar, no name, no account chrome.
  if (user) {
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

  // The team (/team/[id]/*) and tournament (/tournament/[id]/*) workspaces render
  // their own chrome — see their layouts — so the personal shell steps aside here.
  // (MFA gating above still applies before we get here.)
  const pathname = (await headers()).get("x-pathname") ?? "";
  if (user && (pathname.startsWith("/team/") || pathname.startsWith("/tournament/"))) {
    return <>{children}</>;
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

    // Presence preference — read separately so the shell still loads if
    // migration 0047 hasn't been applied yet (missing column → defaults to "auto").
    const { data: pm } = await supabase.from("profiles").select("presence_mode").eq("id", user.id).maybeSingle();
    if (pm?.presence_mode) presenceMode = pm.presence_mode as PresenceMode;

    // Teams the user belongs to → the account switcher.
    const { data: tm } = await supabase.from("team_members").select("team_id").eq("user_id", user.id);
    const tIds = [...new Set((tm ?? []).map((r) => r.team_id))];
    if (tIds.length) {
      const { data: ts } = await supabase.from("teams").select("id, name, sport_key, category").in("id", tIds);
      teams = (ts as { id: string; name: string; sport_key: string; category: string }[] | null) ?? [];
    }

    const { data: r } = await supabase.rpc("current_admin_role");
    adminRole = typeof r === "string" ? r : null;
    const { count } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("read_at", null);
    unread = count ?? 0;
    const { data: cu } = await supabase.rpc("chat_unread_count");
    chatUnread = typeof cu === "number" ? cu : 0;

    // Next scheduled match → top-bar reminder chip.
    const { data: parts } = await supabase.from("match_participants").select("match_id").eq("user_id", user.id);
    const mIds = [...new Set((parts ?? []).map((x) => x.match_id))];
    if (mIds.length) {
      const { data: nm } = await supabase
        .from("matches")
        .select("id, sport_key, scheduled_at, location_text, court_id")
        .in("id", mIds)
        .in("status", ["open", "scheduled"])
        .gte("scheduled_at", new Date().toISOString())
        .order("scheduled_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (nm) {
        let place: string | null = nm.location_text ?? null;
        if (nm.court_id) {
          const { data: c } = await supabase.from("courts").select("name").eq("id", nm.court_id).maybeSingle();
          if (c?.name) place = c.name;
        }
        nextMatch = { id: nm.id, sportKey: nm.sport_key, scheduledAt: nm.scheduled_at, place };
      }
    }
  }

  // Logged-out: simple top bar + content + footer (marketing / auth pages).
  if (!user) {
    return (
      <div className="flex min-h-full flex-col">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter authed={false} />
      </div>
    );
  }

  // Signed-in: glassy left sidebar (desktop) + bottom tab bar (mobile).
  return (
    <div className="flex min-h-dvh">
      <SideNav avatarUrl={avatarUrl} avatarHue={avatarHue} avatarName={avatarName} email={user?.email ?? null} adminRole={!!adminRole} presenceMode={presenceMode} teams={teams} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar unreadCount={unread} />
        <TopBar chatUnread={chatUnread} unreadCount={unread} presenceMode={presenceMode} nextMatch={nextMatch} />
        <main className="flex-1">{children}</main>
        <SiteFooter authed />
        <BottomNav avatarUrl={avatarUrl} avatarHue={avatarHue} avatarName={avatarName} chatUnread={chatUnread} />
      </div>
      <CommandPalette />
    </div>
  );
}
