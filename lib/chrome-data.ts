// Shared fetch for the global TopBar's data. Used by the signed-in AppShell and
// by the workspace layouts (team / tournament) so the top information bar is
// present and consistent everywhere — workspaces render their own left sidebar
// but still get the same global bar across the top of the content column.
//
// Read-only: the presence heartbeat and the avatar/admin lookups stay in
// AppShell (those drive the personal SideNav, which workspaces don't show).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { NextMatch } from "@/components/top-bar";
import type { PresenceMode } from "@/app/account/presence";

type SupabaseServerClient = SupabaseClient<Database>;

export type ChromeTeam = { id: string; name: string; sport_key: string; category: string };

export type TopBarData = {
  presenceMode: PresenceMode;
  teams: ChromeTeam[];
  chatUnread: number;
  unread: number;
  nextMatch: NextMatch;
};

export async function getTopBarData(supabase: SupabaseServerClient, userId: string): Promise<TopBarData> {
  // Presence preference — read on its own so the bar still loads if migration
  // 0047 hasn't been applied yet (missing column → defaults to "auto").
  let presenceMode: PresenceMode = "auto";
  const { data: pm } = await supabase.from("profiles").select("presence_mode").eq("id", userId).maybeSingle();
  if (pm?.presence_mode) presenceMode = pm.presence_mode as PresenceMode;

  // Teams the user belongs to → the account/team switcher.
  let teams: ChromeTeam[] = [];
  const { data: tm } = await supabase.from("team_members").select("team_id").eq("user_id", userId);
  const tIds = [...new Set((tm ?? []).map((r) => r.team_id))];
  if (tIds.length) {
    const { data: ts } = await supabase.from("teams").select("id, name, sport_key, category").in("id", tIds);
    teams = (ts as ChromeTeam[] | null) ?? [];
  }

  const { count } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);
  const unread = count ?? 0;

  const { data: cu } = await supabase.rpc("chat_unread_count");
  const chatUnread = typeof cu === "number" ? cu : 0;

  // Next scheduled match → top-bar reminder chip.
  let nextMatch: NextMatch = null;
  const { data: parts } = await supabase.from("match_participants").select("match_id").eq("user_id", userId);
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

  return { presenceMode, teams, chatUnread, unread, nextMatch };
}
