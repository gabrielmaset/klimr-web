"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notify";

/** Open (or reuse) the buyer's thread with this listing's seller. */
export async function messageSeller(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/marketplace");

  const listingId = String(formData.get("listing_id") || "");
  const { data: l } = await supabase
    .from("marketplace_listings")
    .select("id, kind, listed_by, status")
    .eq("id", listingId)
    .maybeSingle();
  if (!l || l.kind !== "gear" || !l.listed_by || l.listed_by === user.id) return;
  if (!["active", "pending", "sold"].includes(l.status)) return;

  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("listing_id", listingId)
    .eq("created_by", user.id)
    .maybeSingle();

  let convId = existing?.id ?? null;
  if (!convId) {
    const { data: created, error } = await supabase
      .from("conversations")
      .insert({ listing_id: listingId, created_by: user.id, kind: "listing" })
      .select("id")
      .single();
    if (created) convId = created.id;
    else if (error) {
      const { data: again } = await supabase
        .from("conversations")
        .select("id")
        .eq("listing_id", listingId)
        .eq("created_by", user.id)
        .maybeSingle();
      convId = again?.id ?? null;
    }
  }
  if (!convId) return;
  redirect(`/marketplace/messages/${convId}`);
}

/** Notify the other participant about a new (encrypted) message — without its
 *  content. Guards against spam: skipped when they read the thread in the last
 *  90s (they're in the room) or were already pinged for it in the last 15 min. */
export async function notifyThreadMessage(input: { convId: string }): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: conv } = await supabase
    .from("conversations")
    .select("id, listing_id, created_by")
    .eq("id", input.convId)
    .maybeSingle();
  if (!conv?.listing_id || !conv.created_by) return;
  const { data: l } = await supabase
    .from("marketplace_listings")
    .select("id, title, listed_by")
    .eq("id", conv.listing_id)
    .maybeSingle();
  if (!l?.listed_by) return;
  if (user.id !== conv.created_by && user.id !== l.listed_by) return;
  const other = user.id === conv.created_by ? l.listed_by : conv.created_by;

  const admin = createAdminClient();
  const [{ data: read }, { data: recent }, { data: me }] = await Promise.all([
    admin.from("conversation_reads").select("last_read_at").eq("user_id", other).eq("conversation_id", conv.id).maybeSingle(),
    admin
      .from("notifications")
      .select("id")
      .eq("user_id", other)
      .eq("link_url", `/marketplace/messages/${conv.id}`)
      .gte("created_at", new Date(Date.now() - 15 * 60000).toISOString())
      .limit(1),
    admin.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
  ]);
  if (read?.last_read_at && Date.now() - new Date(read.last_read_at).getTime() < 90_000) return;
  if (recent && recent.length > 0) return;

  await createNotification({
    userId: other,
    kind: "system",
    title: `New message — ${l.title}`,
    body: `From ${me?.display_name || "a player"} on Second Serve`,
    linkUrl: `/marketplace/messages/${conv.id}`,
  });
}
