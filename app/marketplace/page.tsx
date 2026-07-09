import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { zipDistanceMi, isExpired, soldGraceOver } from "@/lib/marketplace";
import { SecondServeBrowser, type BrowseListing } from "@/components/second-serve-browser";

export const metadata: Metadata = { title: "Second Serve — Marketplace" };
export const dynamic = "force-dynamic";

const SELECT =
  "id, title, sport_key, category, mode, obo, trade_wants, price_cents, condition, status, photos, zip, description, listed_by, created_at, renewed_at, expires_at, sold_at";

export default async function MarketplacePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/marketplace");

  const [{ data: rows }, { data: saves }, { data: me }] = await Promise.all([
    supabase
      .from("marketplace_listings")
      .select(SELECT)
      .eq("kind", "gear")
      .in("status", ["active", "pending", "sold"])
      .order("renewed_at", { ascending: false })
      .limit(400),
    supabase.from("saved_listings").select("listing_id").eq("user_id", user.id),
    supabase.from("profiles").select("home_zip").eq("id", user.id).maybeSingle(),
  ]);

  // Server component reads the clock once per request.
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const viewerZip = me?.home_zip ?? null;

  const live = (rows ?? []).filter((l) => !isExpired(l, nowMs) && !soldGraceOver(l, nowMs));

  // Seller identities (name + verified) in one pass.
  const sellerIds = [...new Set(live.map((l) => l.listed_by).filter(Boolean))] as string[];
  const sellers = new Map<string, { name: string; hue: number; verified: boolean }>();
  if (sellerIds.length) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_hue, verification_status")
      .in("id", sellerIds);
    for (const p of profs ?? []) {
      sellers.set(p.id, { name: p.display_name || "Player", hue: p.avatar_hue ?? 20, verified: p.verification_status === "verified" });
    }
  }

  // Photo URLs (public bucket) resolved server-side.
  const coverUrl = (l: { photos: string[] }) =>
    l.photos?.[0] ? supabase.storage.from("listing-photos").getPublicUrl(l.photos[0]).data.publicUrl : null;

  const listings: BrowseListing[] = live.map((l) => {
    const seller = (l.listed_by && sellers.get(l.listed_by)) || { name: "Player", hue: 20, verified: false };
    return {
      id: l.id,
      title: l.title,
      sport: l.sport_key ?? "multi",
      category: l.category ?? "court",
      mode: (l.mode as BrowseListing["mode"]) ?? "sale",
      obo: l.obo,
      tradeWants: l.trade_wants,
      priceCents: l.price_cents,
      condition: l.condition,
      status: l.status as BrowseListing["status"],
      cover: coverUrl(l),
      distanceMi: zipDistanceMi(viewerZip, l.zip),
      postedDaysAgo: Math.max(0, Math.floor((nowMs - new Date(l.renewed_at).getTime()) / 86400000)),
      sellerName: seller.name,
      sellerHue: seller.hue,
      sellerVerified: seller.verified,
      yours: l.listed_by === user.id,
      saved: false,
    };
  });

  const savedSet = new Set((saves ?? []).map((s) => s.listing_id));
  for (const l of listings) l.saved = savedSet.has(l.id);

  return <SecondServeBrowser listings={listings} viewerZip={viewerZip} />;
}
