import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { GraduationCap, ShoppingBag, Heart, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { sportMeta } from "@/lib/sports";
import { MarketplaceControls } from "./controls";
import { toggleSave } from "./actions";

export const metadata: Metadata = { title: "Marketplace" };

type Listing = {
  id: string;
  kind: string;
  title: string;
  sport_key: string | null;
  category: string | null;
  price_text: string | null;
  condition: string | null;
  location: string | null;
};

const CONDITION: Record<string, string> = { new: "New", like_new: "Like new", good: "Good", fair: "Fair" };
const SELECT = "id, kind, title, sport_key, category, price_text, condition, location";

function ListingCard({ l, saved }: { l: Listing; saved: boolean }) {
  const sub = l.kind === "gear" && l.condition ? CONDITION[l.condition] ?? l.condition : l.category;
  return (
    <div className="relative">
      <Link href={`/marketplace/${l.id}`} className="lift block rounded-2xl border border-rule bg-surface p-4 pr-14">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#f4f4f5]">
            {l.kind === "coaching" ? <GraduationCap size={18} className="text-ink" /> : <ShoppingBag size={18} className="text-ink" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-ink">{l.title}</span>
            <span className="block truncate text-xs text-mute">
              {l.sport_key ? `${sportMeta(l.sport_key).emoji} ` : ""}
              {sub}
              {l.location ? ` · ${l.location}` : ""}
            </span>
          </span>
          {l.price_text ? <span className="shrink-0 text-sm font-bold text-brand-deep tabular">{l.price_text}</span> : null}
        </div>
      </Link>
      <form action={toggleSave} className="absolute right-3 top-1/2 -translate-y-1/2">
        <input type="hidden" name="listingId" value={l.id} />
        <button aria-label={saved ? "Remove from saved" : "Save"} className="press grid h-9 w-9 place-items-center rounded-full border border-rule bg-surface">
          <Heart size={16} className={saved ? "fill-brand text-brand" : "text-faint"} />
        </button>
      </form>
    </div>
  );
}

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; sort?: string; sport?: string; category?: string; condition?: string; location?: string; view?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/marketplace");

  const kind = sp.tab === "gear" ? "gear" : "coaching";
  const savedView = sp.view === "saved";
  const q = (sp.q ?? "").slice(0, 60);
  const sort = sp.sort === "price_asc" || sp.sort === "price_desc" ? sp.sort : "new";

  // my saved ids (for heart state + the saved view)
  const { data: savedRows } = await supabase.from("saved_listings").select("listing_id").eq("user_id", user.id);
  const savedSet = new Set((savedRows ?? []).map((r) => r.listing_id));

  // area options (from all active listings)
  const { data: locRows } = await supabase.from("marketplace_listings").select("location").eq("status", "active").limit(200);
  const locations = [...new Set((locRows ?? []).map((r) => r.location).filter(Boolean))].sort() as string[];

  let listings: Listing[] = [];
  if (savedView) {
    const ids = [...savedSet];
    if (ids.length) {
      const { data } = await supabase.from("marketplace_listings").select(SELECT).in("id", ids).eq("status", "active").order("created_at", { ascending: false });
      listings = (data as Listing[] | null) ?? [];
    }
  } else {
    let query = supabase.from("marketplace_listings").select(SELECT).eq("kind", kind).eq("status", "active");
    // Whitelist to alphanumerics + spaces so no PostgREST filter metacharacters
    // (commas, parens, %, operators) can reach the .or() expression.
    const s = q.replace(/[^a-zA-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
    if (s) query = query.or(`title.ilike.%${s}%,description.ilike.%${s}%`);
    if (sp.sport) query = query.eq("sport_key", sp.sport);
    if (sp.location) query = query.eq("location", sp.location);
    if (kind === "gear" && sp.category) query = query.eq("category", sp.category);
    if (kind === "gear" && sp.condition) query = query.eq("condition", sp.condition);
    if (sort === "price_asc") query = query.order("price_cents", { ascending: true, nullsFirst: false });
    else if (sort === "price_desc") query = query.order("price_cents", { ascending: false, nullsFirst: false });
    else query = query.order("created_at", { ascending: false });
    const { data } = await query;
    listings = (data as Listing[] | null) ?? [];
  }

  const tabLink = (k: string, label: string, Icon: typeof GraduationCap) => {
    const on = !savedView && kind === k;
    return (
      <Link
        href={`/marketplace?tab=${k}`}
        className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold transition-colors ${
          on ? "bg-surface text-ink shadow-sm" : "text-mute hover:text-ink"
        }`}
      >
        <Icon size={15} /> {label}
      </Link>
    );
  };

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl leading-none text-ink sm:text-5xl">Marketplace</h1>
          <p className="mt-1 text-sm text-mute">Local coaching and gear from the Klimr community.</p>
        </div>
        <Link
          href={savedView ? "/marketplace" : "/marketplace?view=saved"}
          className={`press flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold transition-colors ${
            savedView ? "border-brand bg-tint-brand text-brand-deep" : "border-rule text-ink hover:bg-[#f4f4f5]"
          }`}
        >
          <Heart size={14} className={savedView ? "fill-brand text-brand" : ""} /> Saved{savedSet.size ? ` ${savedSet.size}` : ""}
        </Link>
      </div>

      {savedView ? (
        <h2 className="mb-4 text-sm font-semibold text-mute">Your saved listings</h2>
      ) : (
        <>
          <div className="mb-4 flex gap-1 rounded-2xl bg-[#f4f4f5] p-1">
            {tabLink("coaching", "Coaching", GraduationCap)}
            {tabLink("gear", "Gear", ShoppingBag)}
          </div>
          <MarketplaceControls
            kind={kind}
            q={q}
            sort={sort}
            sport={sp.sport ?? ""}
            category={sp.category ?? ""}
            condition={sp.condition ?? ""}
            location={sp.location ?? ""}
            locations={locations}
          />
        </>
      )}

      {listings.length === 0 ? (
        <div className="rounded-2xl border border-rule bg-surface p-10 text-center text-sm text-mute">
          {savedView ? "You haven't saved anything yet. Tap the heart on a listing to save it." : "No listings match — try clearing a filter."}
        </div>
      ) : (
        <div className="space-y-2.5">
          {listings.map((l) => (
            <ListingCard key={l.id} l={l} saved={savedSet.has(l.id)} />
          ))}
        </div>
      )}

      <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-faint">
        <ShieldCheck size={13} className="mt-0.5 shrink-0" />
        Klimr connects you with the lister — arrange lessons or sales directly. No payments are processed on Klimr.
      </p>
    </div>
  );
}
