"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notify";

/** DM message notification with the standard guards: skip if the other side
 *  read within 90s (they're in the thread) or was pinged in the last 15 min. */
export async function notifyDmMessage(input: { convId: string }): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: conv } = await supabase
    .from("conversations")
    .select("id, kind, created_by, peer_id")
    .eq("id", input.convId)
    .maybeSingle();
  if (conv?.kind !== "dm" || !conv.created_by || !conv.peer_id) return;
  if (user.id !== conv.created_by && user.id !== conv.peer_id) return;
  const other = user.id === conv.created_by ? conv.peer_id : conv.created_by;

  const admin = createAdminClient();
  const [{ data: read }, { data: recent }, { data: me }] = await Promise.all([
    admin.from("conversation_reads").select("last_read_at").eq("user_id", other).eq("conversation_id", conv.id).maybeSingle(),
    admin
      .from("notifications")
      .select("id")
      .eq("user_id", other)
      .eq("link_url", `/messages/${conv.id}`)
      .gte("created_at", new Date(Date.now() - 15 * 60000).toISOString())
      .limit(1),
    admin.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
  ]);
  if (read?.last_read_at && Date.now() - new Date(read.last_read_at).getTime() < 90_000) return;
  if (recent?.length) return;

  await createNotification({
    userId: other,
    kind: "system",
    title: `New message — ${me?.display_name ?? "a Klimr member"}`,
    body: "Open the thread to read it (messages are end-to-end encrypted).",
    linkUrl: `/messages/${conv.id}`,
  });
}
