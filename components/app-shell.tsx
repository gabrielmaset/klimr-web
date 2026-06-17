import { SiteHeader } from "@/components/site-header";
import { SideNav } from "@/components/side-nav";
import { MobileTopBar } from "@/components/mobile-top-bar";
import { BottomNav } from "@/components/bottom-nav";
import { SiteFooter } from "@/components/site-footer";
import { createClient } from "@/lib/supabase/server";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let avatarUrl: string | null = null;
  let avatarHue = 200;
  let avatarName = user?.email ?? "You";
  let adminRole: string | null = null;
  let unread = 0;
  if (user) {
    const { data: p } = await supabase
      .from("profiles")
      .select("display_name, avatar_hue, avatar_path")
      .eq("id", user.id)
      .single();
    if (p) {
      avatarHue = p.avatar_hue ?? 200;
      avatarName = p.display_name || user.email || "You";
      avatarUrl = p.avatar_path ? supabase.storage.from("avatars").getPublicUrl(p.avatar_path).data.publicUrl : null;
    }
    const { data: r } = await supabase.rpc("current_admin_role");
    adminRole = typeof r === "string" ? r : null;
    const { count } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("read_at", null);
    unread = count ?? 0;
  }

  // Logged-out: simple top bar + content + footer (marketing / auth pages).
  if (!user) {
    return (
      <div className="flex min-h-full flex-col">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </div>
    );
  }

  // Signed-in: glassy left sidebar (desktop) + bottom tab bar (mobile).
  return (
    <div className="flex min-h-dvh">
      <SideNav avatarUrl={avatarUrl} avatarHue={avatarHue} avatarName={avatarName} adminRole={!!adminRole} unreadCount={unread} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar unreadCount={unread} />
        <main className="flex-1">{children}</main>
        <SiteFooter />
        <BottomNav avatarUrl={avatarUrl} avatarHue={avatarHue} avatarName={avatarName} />
      </div>
    </div>
  );
}
