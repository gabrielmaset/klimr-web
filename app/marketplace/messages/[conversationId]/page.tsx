import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MarketplaceRoom, type OfferRow, type MeetupRow } from "@/components/marketplace-room";
import { priceLabel } from "@/lib/marketplace";

export const metadata: Metadata = { title: "Gear chat — Second Serve" };
export const dynamic = "force-dynamic";

export default async function ListingThreadPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/marketplace/messages/${conversationId}`);

  const { data: conv } = await supabase
    .from("conversations")
    .select("id, listing_id, created_by, expires_at")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv?.listing_id || !conv.created_by) notFound();

  const { data: l } = await supabase
    .from("marketplace_listings")
    .select("id, title, mode, obo, price_cents, status, photos, sport_key, listed_by, meet_court_ids")
    .eq("id", conv.listing_id)
    .maybeSingle();
  if (!l || !l.listed_by) notFound();

  const buyerId = conv.created_by;
  const sellerId = l.listed_by;
  if (user.id !== buyerId && user.id !== sellerId) notFound();
  const otherId = user.id === buyerId ? sellerId : buyerId;

  const [{ data: other }, { data: offers }, { data: meetups }, { data: spots }] = await Promise.all([
    supabase.from("profiles").select("id, display_name, avatar_hue, verification_status").eq("id", otherId).maybeSingle(),
    supabase
      .from("listing_offers")
      .select("id, buyer_id, actor_id, amount_cents, note, parent_offer_id, status, created_at, expires_at")
      .eq("listing_id", l.id)
      .eq("buyer_id", buyerId)
      .order("created_at", { ascending: true }),
    supabase
      .from("listing_meetups")
      .select("id, proposed_by, court_id, place_text, starts_at, status, created_at")
      .eq("listing_id", l.id)
      .eq("buyer_id", buyerId)
      .order("created_at", { ascending: true }),
    (l.meet_court_ids ?? []).length
      ? supabase.from("courts").select("id, name").in("id", l.meet_court_ids ?? [])
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const courtName = new Map((spots ?? []).map((c) => [c.id, c.name]));
  const cover = l.photos?.[0] ? supabase.storage.from("listing-photos").getPublicUrl(l.photos[0]).data.publicUrl : null;

  return (
    <MarketplaceRoom
      convId={conv.id}
      expiresAt={conv.expires_at}
      meId={user.id}
      buyerId={buyerId}
      sellerId={sellerId}
      other={{
        id: otherId,
        name: other?.display_name || "Player",
        hue: other?.avatar_hue ?? 20,
        verified: other?.verification_status === "verified",
      }}
      listing={{
        id: l.id,
        title: l.title,
        mode: l.mode as "sale" | "trade" | "free",
        status: l.status,
        priceText: priceLabel({ mode: l.mode, priceCents: l.price_cents }),
        obo: l.obo,
        cover,
      }}
      initialOffers={(offers ?? []) as OfferRow[]}
      initialMeetups={((meetups ?? []) as MeetupRow[]).map((m) => ({ ...m, courtName: m.court_id ? (courtName.get(m.court_id) ?? null) : null }))}
      meetSpots={(spots ?? []).map((c) => ({ id: c.id, name: c.name }))}
    />
  );
}
