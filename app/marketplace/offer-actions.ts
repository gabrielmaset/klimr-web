"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createNotification } from "@/lib/notify";

type Res = { error?: string };

async function loadContext(listingId: string, buyerId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." } as const;
  const { data: l } = await supabase
    .from("marketplace_listings")
    .select("id, title, mode, status, listed_by")
    .eq("id", listingId)
    .maybeSingle();
  if (!l || !l.listed_by) return { error: "Listing not found." } as const;
  const sellerId = l.listed_by;
  if (user.id !== buyerId && user.id !== sellerId) return { error: "Not your thread." } as const;
  return { supabase, me: user.id, listing: l, sellerId } as const;
}

function threadLink(convId: string) {
  return `/marketplace/messages/${convId}`;
}

export async function makeOffer(input: {
  listingId: string;
  buyerId: string;
  convId: string;
  amount: string;
  note?: string;
  parentOfferId?: string | null;
}): Promise<Res> {
  const ctx = await loadContext(input.listingId, input.buyerId);
  if ("error" in ctx) return ctx;
  const { supabase, me, listing, sellerId } = ctx;
  if (listing.mode !== "sale") return { error: "Offers apply to sale listings \u2014 message about trades and freebies instead." };
  if (!["active", "pending"].includes(listing.status)) return { error: "This listing is closed." };

  const amountCents = Math.round(parseFloat(String(input.amount).replace(/[^0-9.]/g, "") || "0") * 100);
  if (!amountCents || amountCents < 100) return { error: "Offer at least $1." };
  const note = String(input.note ?? "").trim().slice(0, 240) || null;

  if (input.parentOfferId) {
    const { data: parent } = await supabase
      .from("listing_offers")
      .select("id, actor_id, status, expires_at")
      .eq("id", input.parentOfferId)
      .eq("listing_id", input.listingId)
      .maybeSingle();
    if (!parent || parent.status !== "open") return { error: "That offer isn\u2019t open anymore." };
    if (parent.actor_id === me) return { error: "You can withdraw your own offer instead of countering it." };
    await supabase.from("listing_offers").update({ status: "declined", decided_at: new Date().toISOString() }).eq("id", parent.id);
  } else {
    // One open offer per buyer per listing (DB-enforced too).
    const { data: open } = await supabase
      .from("listing_offers")
      .select("id, actor_id")
      .eq("listing_id", input.listingId)
      .eq("buyer_id", input.buyerId)
      .eq("status", "open")
      .maybeSingle();
    if (open) return { error: open.actor_id === me ? "You already have an open offer \u2014 withdraw it to change it." : "Respond to the open offer first." };
  }

  const { error } = await supabase.from("listing_offers").insert({
    listing_id: input.listingId,
    buyer_id: input.buyerId,
    actor_id: me,
    amount_cents: amountCents,
    note,
    parent_offer_id: input.parentOfferId ?? null,
  });
  if (error) return { error: "Couldn\u2019t send the offer \u2014 try again." };

  const other = me === sellerId ? input.buyerId : sellerId;
  await createNotification({
    userId: other,
    kind: "system",
    title: input.parentOfferId ? "Counter-offer on your gear thread" : `New offer: ${listing.title}`,
    body: `$${Math.round(amountCents / 100)}${note ? ` \u00b7 \u201C${note}\u201D` : ""}`,
    linkUrl: threadLink(input.convId),
  });
  revalidatePath(threadLink(input.convId));
  return {};
}

export async function respondOffer(input: { offerId: string; convId: string; decision: "accept" | "decline" }): Promise<Res> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  const { data: o } = await supabase
    .from("listing_offers")
    .select("id, listing_id, buyer_id, actor_id, amount_cents, status, expires_at")
    .eq("id", input.offerId)
    .maybeSingle();
  if (!o) return { error: "Offer not found." };
  const ctx = await loadContext(o.listing_id, o.buyer_id);
  if ("error" in ctx) return ctx;
  const { me, listing, sellerId } = ctx;
  if (o.status !== "open") return { error: "That offer isn\u2019t open anymore." };
  if (new Date(o.expires_at).getTime() < Date.now()) return { error: "That offer expired." };
  if (o.actor_id === me) return { error: "You made this offer \u2014 you can withdraw it." };

  await supabase
    .from("listing_offers")
    .update({ status: input.decision === "accept" ? "accepted" : "declined", decided_at: new Date().toISOString() })
    .eq("id", o.id);

  if (input.decision === "accept" && listing.status === "active") {
    await supabase.from("marketplace_listings").update({ status: "pending" }).eq("id", listing.id);
  }

  await createNotification({
    userId: o.actor_id,
    kind: "system",
    title: input.decision === "accept" ? `Offer accepted \u2014 ${listing.title}` : `Offer declined \u2014 ${listing.title}`,
    body: input.decision === "accept" ? "Propose a court and time to meet." : undefined,
    linkUrl: threadLink(input.convId),
  });
  void sellerId;
  revalidatePath(threadLink(input.convId));
  revalidatePath(`/marketplace/${listing.id}`);
  return {};
}

export async function withdrawOffer(input: { offerId: string; convId: string }): Promise<Res> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };
  const { data: o } = await supabase.from("listing_offers").select("id, actor_id, status").eq("id", input.offerId).maybeSingle();
  if (!o || o.actor_id !== user.id || o.status !== "open") return { error: "Nothing to withdraw." };
  await supabase.from("listing_offers").update({ status: "withdrawn", decided_at: new Date().toISOString() }).eq("id", o.id);
  revalidatePath(threadLink(input.convId));
  return {};
}

export async function proposeMeetup(input: {
  listingId: string;
  buyerId: string;
  convId: string;
  courtId?: string | null;
  placeText?: string | null;
  startsAtIso: string;
}): Promise<Res> {
  const ctx = await loadContext(input.listingId, input.buyerId);
  if ("error" in ctx) return ctx;
  const { supabase, me, listing, sellerId } = ctx;

  const starts = new Date(input.startsAtIso);
  if (!Number.isFinite(starts.getTime()) || starts.getTime() < Date.now() - 60000) return { error: "Pick a future time." };
  if (!input.courtId && !String(input.placeText ?? "").trim()) return { error: "Pick a court or name a public place." };

  const { data: accepted } = await supabase
    .from("listing_offers")
    .select("id")
    .eq("listing_id", input.listingId)
    .eq("buyer_id", input.buyerId)
    .eq("status", "accepted")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (listing.mode === "sale" && !accepted && listing.status !== "pending") {
    return { error: "Agree on an offer first, then plan the meetup." };
  }

  const { error } = await supabase.from("listing_meetups").insert({
    listing_id: input.listingId,
    offer_id: accepted?.id ?? null,
    proposed_by: me,
    buyer_id: input.buyerId,
    court_id: input.courtId ?? null,
    place_text: String(input.placeText ?? "").trim().slice(0, 120) || null,
    starts_at: starts.toISOString(),
  });
  if (error) return { error: "Couldn\u2019t propose the meetup \u2014 try again." };

  const other = me === sellerId ? input.buyerId : sellerId;
  await createNotification({
    userId: other,
    kind: "system",
    title: `Meetup proposed \u2014 ${listing.title}`,
    body: starts.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
    linkUrl: threadLink(input.convId),
  });
  revalidatePath(threadLink(input.convId));
  return {};
}

export async function respondMeetup(input: { meetupId: string; convId: string; decision: "accept" | "decline" | "cancel" }): Promise<Res> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };
  const { data: m } = await supabase
    .from("listing_meetups")
    .select("id, listing_id, buyer_id, proposed_by, status")
    .eq("id", input.meetupId)
    .maybeSingle();
  if (!m) return { error: "Meetup not found." };
  const ctx = await loadContext(m.listing_id, m.buyer_id);
  if ("error" in ctx) return ctx;
  const { supabase: sb, me, listing, sellerId } = ctx;
  if (m.status !== "proposed") return { error: "That plan was already settled." };

  if (input.decision === "cancel") {
    if (m.proposed_by !== me) return { error: "Only the proposer can cancel." };
    await sb.from("listing_meetups").update({ status: "cancelled" }).eq("id", m.id);
  } else {
    if (m.proposed_by === me) return { error: "The other player responds to this one." };
    await sb.from("listing_meetups").update({ status: input.decision === "accept" ? "accepted" : "declined" }).eq("id", m.id);
  }

  const other = me === sellerId ? m.buyer_id : sellerId;
  await createNotification({
    userId: input.decision === "cancel" ? other : m.proposed_by,
    kind: "system",
    title:
      input.decision === "accept"
        ? `Meetup confirmed \u2014 ${listing.title}`
        : input.decision === "decline"
          ? `Meetup declined \u2014 ${listing.title}`
          : `Meetup cancelled \u2014 ${listing.title}`,
    linkUrl: threadLink(input.convId),
  });
  revalidatePath(threadLink(input.convId));
  return {};
}
