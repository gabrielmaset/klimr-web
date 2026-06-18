import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CourtsExplorer, type ExplorerCourt } from "./courts-explorer";

export const metadata: Metadata = { title: "Courts" };

type Row = {
  id: string;
  name: string;
  sports: string[];
  neighborhood: string | null;
  city: string | null;
  amenities: string[];
  lat: number | null;
  lng: number | null;
};

export default async function CourtsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/courts");

  const { data } = await supabase
    .from("courts")
    .select("id, name, sports, neighborhood, city, amenities, lat, lng")
    .order("name");
  const rows = (data as Row[] | null) ?? [];

  // Aggregate review ratings per court.
  const avg = new Map<string, number>();
  const count = new Map<string, number>();
  const ids = rows.map((c) => c.id);
  if (ids.length) {
    const { data: reviews } = await supabase.from("court_reviews").select("court_id, rating").in("court_id", ids);
    const sum = new Map<string, number>();
    for (const r of reviews ?? []) {
      sum.set(r.court_id, (sum.get(r.court_id) ?? 0) + r.rating);
      count.set(r.court_id, (count.get(r.court_id) ?? 0) + 1);
    }
    for (const [cid, s] of sum) avg.set(cid, s / (count.get(cid) ?? 1));
  }

  const courts: ExplorerCourt[] = rows.map((c) => ({
    ...c,
    rating: avg.get(c.id) ?? 0,
    reviews: count.get(c.id) ?? 0,
  }));

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? null;

  return (
    <div className="mx-auto max-w-2xl px-5 py-8 sm:py-10">
      <div className="mb-4">
        <h1 className="font-display text-4xl leading-none text-ink sm:text-5xl">Courts</h1>
        <p className="mt-1 text-sm text-mute">Where the Westside plays. Reviews come from verified members.</p>
      </div>
      <CourtsExplorer courts={courts} mapboxToken={mapboxToken} />
    </div>
  );
}
