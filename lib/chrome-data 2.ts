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

/** KCDX-065: no `userId` parameter any more. `chrome_data()` derives the caller
 *  from `auth.uid()`, so passing an id alongside the session was a second source
 *  of truth about who is asking — and two sources of truth about identity is
 *  exactly the shape that produces a bug nobody can reproduce. */
export async function getTopBarData(supabase: SupabaseServerClient): Promise<TopBarData> {
  // KCDX-065: this ran nine serial reads plus a per-match COUNT loop on EVERY
  // page view, for every signed-in member, to render a header. The loop scaled
  // in the wrong direction — it looked for the first match whose roster is FULL,
  // so the more matches a member had coming up, the more queries their header
  // cost. Active members paid the most.
  //
  // One round trip now; the roster-full test is a grouped join. `chat_unread`
  // stays separate because it is its own RPC with its own visibility rules, and
  // folding it in would mean duplicating those rules in a second place.
  const [{ data: chrome }, { data: cu }] = await Promise.all([
    supabase.rpc("chrome_data"),
    supabase.rpc("chat_unread_count"),
  ]);
  const c = (chrome ?? {}) as {
    presenceMode?: string | null;
    teams?: { id: string; name: string; sport_key: string; category: string }[];
    unread?: number;
    nextMatch?: { id: string; sportKey: string; scheduledAt: string; place: string | null } | null;
  };
  const presenceMode = (c.presenceMode ?? "auto") as PresenceMode;
  const teams = c.teams ?? [];
  const unread = c.unread ?? 0;
  const nextMatch = c.nextMatch ?? null;
  const chatUnread = typeof cu === "number" ? cu : 0;

  return { presenceMode, teams, chatUnread, unread, nextMatch };
}
