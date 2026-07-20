import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { ListingForm, type ListingInitial } from "@/components/listing-form";

export const metadata: Metadata = { title: "Edit listing — Second Serve" };

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/marketplace/${id}/edit`);

  const { data: l } = await supabase
    .from("marketplace_listings")
    .select("id, kind, title, category, sport_key, condition, mode, price_cents, obo, trade_wants, description, zip, location, meet_court_ids, photos, listed_by")
    .eq("id", id)
    .maybeSingle();
  if (!l || l.kind !== "gear" || l.listed_by !== user.id) notFound();

  const initial: ListingInitial = {
    id: l.id,
    title: l.title,
    category: l.category ?? "racquets",
    sport: l.sport_key ?? "multi",
    condition: l.condition ?? "Good",
    mode: (l.mode as ListingInitial["mode"]) ?? "sale",
    price: l.price_cents != null ? String(Math.round(l.price_cents / 100)) : "",
    obo: l.obo,
    tradeWants: l.trade_wants ?? "",
    description: l.description ?? "",
    zip: l.zip ?? "",
    locationLabel: l.location ?? "",
    meetCourtIds: l.meet_court_ids ?? [],
    photos: (l.photos ?? []).map((p) => ({ path: p, url: supabase.storage.from("listing-photos").getPublicUrl(p).data.publicUrl })),
  };

  return (
    <div className="mx-auto max-w-[880px] px-[30px] pb-16 pt-[22px]">
      <div className="mt-4">
        <PageHeader kicker="Marketplace — Edit listing" title={l.title} sub="Changes go live immediately when you save." />
      </div>
      <div className="mt-6">
        <ListingForm formMode="edit" initial={initial} />
      </div>
    </div>
  );
}
