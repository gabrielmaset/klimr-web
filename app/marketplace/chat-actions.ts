"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notify";

async function getOrCreateListingConversation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  listingId: string,
): Promise<string | null> {
  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("listing_id", listingId)
    .eq("created_by", userId)
    .maybeSingle();
  if (existing) return existing.id;
  const { data: created, error } = await supabase
    .from("conversations")
    .insert({ listing_id: listingId, created_by: userId, kind: "listing" })
    .select("id")
    .single();
  if (created) return created.id;
  if (error) {
    const { data: again } = await supabase
      .from("conversations")
      .select("id")
      .eq("listing_id", listingId)
      .eq("created_by", userId)
      .maybeSingle();
    return again?.id ?? null;
  }
  return null;
}

/** Open (or reuse) the buyer's thread with this listing's seller.
 *  Failures land back on the listing with a visible notice — never silence. */
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
  if (!l || l.kind !== "gear" || l.listed_by === user.id) redirect(`/marketplace/${listingId}`);
  if (!l.listed_by || !["active", "pending", "sold"].includes(l.status)) {
    redirect(`/marketplace/${listingId}?notice=chat`);
  }

  const convId = await getOrCreateListingConversation(supabase, user.id, listingId);
  if (!convId) redirect(`/marketplace/${listingId}?notice=chat`);
  redirect(`/marketplace/messages/${convId}`);
}

/** Buy at the asking price: opens the thread and places a full-price offer,
 *  so the standard offer machinery (accept → pending → meetup) takes over.
 *  The listing stays visible until the seller marks it sold. */
export async function buyNow(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/marketplace");

  const listingId = String(formData.get("listing_id") || "");
  const { data: l } = await supabase
    .from("marketplace_listings")
    .select("id, kind, title, listed_by, status, mode, price_cents")
    .eq("id", listingId)
    .maybeSingle();
  if (!l || l.kind !== "gear" || l.listed_by === user.id) redirect(`/marketplace/${listingId}`);
  if (!l.listed_by || l.mode !== "sale" || !l.price_cents || l.price_cents < 100 || l.status !== "active") {
    redirect(`/marketplace/${listingId}?notice=buy`);
  }

  const convId = await getOrCreateListingConversation(supabase, user.id, listingId);
  if (!convId) redirect(`/marketplace/${listingId}?notice=buy`);

  // An open offer already on the table (either side)? The thread is the place.
  const { data: open } = await supabase
    .from("listing_offers")
    .select("id")
    .eq("listing_id", listingId)
    .eq("buyer_id", user.id)
    .eq("status", "open")
    .maybeSingle();
  if (!open) {
    const { error } = await supabase.from("listing_offers").insert({
      listing_id: listingId,
      buyer_id: user.id,
      actor_id: user.id,
      amount_cents: l.price_cents,
      note: "Buying at the asking price",
    });
    if (!error) {
      await createNotification({
        userId: l.listed_by!,
        kind: "system",
        title: `Wants to buy at asking — ${l.title}`,
        body: `$${Math.round((l.price_cents ?? 0) / 100)} · accept to move to pickup`,
        linkUrl: `/marketplace/messages/${convId}`,
      });
    }
  }
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
