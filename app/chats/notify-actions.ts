"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notify";

/** Notify the other match participants about a new (encrypted) message —
 *  never its content. Same guards as the marketplace threads: skip anyone who
 *  read the thread in the last 90s, or was pinged for it in the last 15 min. */
export async function notifyMatchThreadMessage(input: { matchId: string; convId: string }): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: parts } = await supabase.from("match_participants").select("user_id").eq("match_id", input.matchId);
  const ids = (parts ?? []).map((p) => p.user_id);
  if (!ids.includes(user.id)) return;
  const others = ids.filter((id) => id !== user.id);
  if (!others.length) return;

  const admin = createAdminClient();
  const [{ data: match }, { data: me }, { data: reads }, { data: recent }] = await Promise.all([
    admin.from("matches").select("sport_key, format").eq("id", input.matchId).maybeSingle(),
    admin.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    admin.from("conversation_reads").select("user_id, last_read_at").eq("conversation_id", input.convId).in("user_id", others),
    admin
      .from("notifications")
      .select("user_id")
      .in("user_id", others)
      .eq("link_url", `/chats/${input.matchId}`)
      .gte("created_at", new Date(Date.now() - 15 * 60000).toISOString()),
  ]);

  const readRecently = new Set(
    (reads ?? []).filter((r) => r.last_read_at && Date.now() - new Date(r.last_read_at).getTime() < 90_000).map((r) => r.user_id),
  );
  const pinged = new Set((recent ?? []).map((n) => n.user_id));
  const label = match ? `${match.sport_key} \u00b7 ${match.format}` : "your match";

  await Promise.all(
    others
      .filter((id) => !readRecently.has(id) && !pinged.has(id))
      .map((id) =>
        createNotification({
          userId: id,
          kind: "system",
          title: `New message \u2014 ${label}`,
          body: `From ${me?.display_name || "a player"}`,
          linkUrl: `/chats/${input.matchId}`,
        }),
      ),
  );
}
