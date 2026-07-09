"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { lookupZip } from "@/lib/us-places";
import { CATEGORIES, CONDITIONS, MODES, LISTING_LIFESPAN_DAYS } from "@/lib/marketplace";

const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_ACTIVE_LISTINGS = 20;
const MAX_CREATES_PER_DAY = 5;

export type PickupArea = { zip: string; label: string } | { error: string };

/** ZIP → neighborhood-level label. US-only, same gate as onboarding. */
export async function resolvePickupZip(zip: string): Promise<PickupArea> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in to list gear." };

  const z = String(zip ?? "").trim();
  if (!/^\d{5}$/.test(z)) return { error: "Enter a 5-digit U.S. ZIP." };

  const { data: region } = await supabase.from("zip_regions").select("neighborhood, city, state").eq("zip", z).maybeSingle();
  if (region) return { zip: z, label: [region.neighborhood, region.city, region.state].filter(Boolean).join(", ") };
  const fb = lookupZip(z);
  if (fb) return { zip: z, label: `${fb.city}, ${fb.state}` };
  return { error: "Klimr is currently available only in the United States \u2014 that ZIP doesn\u2019t match a U.S. location." };
}

export type NearbyCourt = { id: string; name: string; distanceMi: number };

/** Nearest courts to a ZIP centroid — the safe-spot suggestions. */
export async function nearbyCourtsForZip(zip: string): Promise<NearbyCourt[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const z = lookupZip(String(zip ?? "").trim());
  if (!z) return [];
  const { data: courts } = await supabase.from("courts").select("id, name, lat, lng").not("lat", "is", null).not("lng", "is", null).limit(500);
  const R = 3958.8;
  const dist = (lat: number, lng: number) => {
    const dLat = ((lat - z.lat) * Math.PI) / 180;
    const dLng = ((lng - z.lng) * Math.PI) / 180;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos((z.lat * Math.PI) / 180) * Math.cos((lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  };
  return (courts ?? [])
    .map((c) => ({ id: c.id, name: c.name, distanceMi: Math.round(dist(c.lat as number, c.lng as number) * 10) / 10 }))
    .filter((c) => c.distanceMi <= 15)
    .sort((a, b) => a.distanceMi - b.distanceMi)
    .slice(0, 8);
}

type ParsedForm = {
  title: string;
  category: string;
  sport: string;
  condition: string;
  mode: string;
  priceCents: number | null;
  obo: boolean;
  tradeWants: string | null;
  description: string;
  zip: string;
  location: string;
  meetCourtIds: string[];
  /** Final photo order as tokens: `e:<path>` (existing) | `n:<newFileIndex>`. */
  photoOrder: string[];
  newFiles: File[];
};

function parseForm(formData: FormData): { ok: true; v: ParsedForm } | { ok: false; error: string } {
  const title = String(formData.get("title") || "").trim().slice(0, 90);
  const category = String(formData.get("category") || "");
  const sport = String(formData.get("sport") || "multi");
  const condition = String(formData.get("condition") || "");
  const mode = String(formData.get("mode") || "sale");
  const priceRaw = String(formData.get("price") || "").replace(/[^0-9.]/g, "");
  const obo = formData.get("obo") === "on";
  const tradeWants = String(formData.get("trade_wants") || "").trim().slice(0, 120) || null;
  const description = String(formData.get("description") || "").trim().slice(0, 1200);
  const zip = String(formData.get("zip") || "").trim();
  const location = String(formData.get("location_label") || "").trim().slice(0, 120);
  const meetCourtIds = formData.getAll("meet_court_ids").map(String).slice(0, 3);
  const photoOrder = String(formData.get("photo_order") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const newFiles = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);

  if (title.length < 4) return { ok: false, error: "Give the listing a title (at least 4 characters)." };
  if (!CATEGORIES.some((c) => c.key === category)) return { ok: false, error: "Pick a category." };
  if (!CONDITIONS.includes(condition as (typeof CONDITIONS)[number])) return { ok: false, error: "Pick a condition." };
  if (!MODES.includes(mode as (typeof MODES)[number])) return { ok: false, error: "Pick sell, trade, or give away." };
  const priceCents = mode === "sale" ? Math.round(parseFloat(priceRaw || "0") * 100) : null;
  if (mode === "sale" && (!priceCents || priceCents < 100)) return { ok: false, error: "Set a price of at least $1 (or choose Give away)." };
  if (mode === "trade" && !tradeWants) return { ok: false, error: "Say what you\u2019d like to trade for." };
  if (!/^\d{5}$/.test(zip) || !location) return { ok: false, error: "Set your pickup area \u2014 enter a ZIP and resolve it." };
  if (formData.get("terms") !== "on") return { ok: false, error: "Please acknowledge the listing terms." };
  if (photoOrder.length > MAX_PHOTOS) return { ok: false, error: `Up to ${MAX_PHOTOS} photos.` };
  for (const tok of photoOrder) {
    if (!/^e:.+|^n:\d+$/.test(tok)) return { ok: false, error: "Photo order was malformed \u2014 refresh and try again." };
  }
  for (const f of newFiles) {
    if (f.size > MAX_PHOTO_BYTES) return { ok: false, error: "Each photo must be under 5 MB." };
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return { ok: false, error: "Photos must be JPEG, PNG, or WebP." };
  }
  return {
    ok: true,
    v: { title, category, sport, condition, mode, priceCents, obo: mode === "sale" ? obo : false, tradeWants: mode === "trade" ? tradeWants : null, description, zip, location, meetCourtIds, photoOrder, newFiles },
  };
}

/** Upload new files, then assemble the final ordered photo paths from tokens. */
async function assemblePhotos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  photoOrder: string[],
  newFiles: File[],
  allowedExisting: string[],
): Promise<string[]> {
  const uploaded = await uploadPhotos(supabase, userId, newFiles);
  const out: string[] = [];
  for (const tok of photoOrder) {
    if (tok.startsWith("e:")) {
      const path = tok.slice(2);
      if (allowedExisting.includes(path)) out.push(path);
    } else {
      const idx = Number(tok.slice(2));
      if (uploaded[idx]) out.push(uploaded[idx]);
    }
  }
  return out.slice(0, MAX_PHOTOS);
}

async function uploadPhotos(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, files: File[]): Promise<string[]> {
  const paths: string[] = [];
  for (const f of files) {
    const ext = f.type === "image/png" ? "png" : f.type === "image/webp" ? "webp" : "jpg";
    const path = `${userId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("listing-photos").upload(path, f, { contentType: f.type, upsert: false });
    if (!error) paths.push(path);
  }
  return paths;
}

export async function createListing(prevState: { error: string } | null, formData: FormData): Promise<{ error: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in to list gear." };

  const parsed = parseForm(formData);
  if (!parsed.ok) return { error: parsed.error };
  const v = parsed.v;

  // Anti-spam caps (server-enforced).
  const [{ count: activeCount }, { count: dayCount }] = await Promise.all([
    supabase.from("marketplace_listings").select("id", { count: "exact", head: true }).eq("listed_by", user.id).in("status", ["active", "pending"]),
    supabase
      .from("marketplace_listings")
      .select("id", { count: "exact", head: true })
      .eq("listed_by", user.id)
      .gte("created_at", new Date(Date.now() - 86400000).toISOString()),
  ]);
  if ((activeCount ?? 0) >= MAX_ACTIVE_LISTINGS) return { error: `You can have up to ${MAX_ACTIVE_LISTINGS} live listings \u2014 close one first.` };
  if ((dayCount ?? 0) >= MAX_CREATES_PER_DAY) return { error: "That\u2019s the daily listing limit \u2014 try again tomorrow." };

  const publish = formData.get("intent") !== "draft";
  const photos = await assemblePhotos(supabase, user.id, v.photoOrder, v.newFiles, []);

  const { data: row, error } = await supabase
    .from("marketplace_listings")
    .insert({
      kind: "gear",
      title: v.title,
      category: v.category,
      sport_key: v.sport === "multi" ? null : v.sport,
      condition: v.condition,
      mode: v.mode,
      price_cents: v.priceCents,
      price_text: null,
      obo: v.obo,
      trade_wants: v.tradeWants,
      description: v.description || null,
      zip: v.zip,
      location: v.location,
      meet_court_ids: v.meetCourtIds,
      photos,
      listed_by: user.id,
      status: publish ? "active" : "draft",
      expires_at: new Date(Date.now() + LISTING_LIFESPAN_DAYS * 86400000).toISOString(),
    })
    .select("id")
    .single();
  if (error || !row) return { error: "Couldn\u2019t save the listing \u2014 please try again." };

  revalidatePath("/marketplace");
  redirect(publish ? `/marketplace/${row.id}` : "/marketplace/mine?tab=draft");
}

export async function updateListing(prevState: { error: string } | null, formData: FormData): Promise<{ error: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  const id = String(formData.get("listing_id") || "");
  const { data: existing } = await supabase.from("marketplace_listings").select("id, listed_by, photos").eq("id", id).maybeSingle();
  if (!existing || existing.listed_by !== user.id) return { error: "That listing isn\u2019t yours." };

  const parsed = parseForm(formData);
  if (!parsed.ok) return { error: parsed.error };
  const v = parsed.v;

  const photos = await assemblePhotos(supabase, user.id, v.photoOrder, v.newFiles, existing.photos ?? []);
  const dropped = (existing.photos ?? []).filter((p) => !photos.includes(p));
  if (dropped.length) await supabase.storage.from("listing-photos").remove(dropped);

  const { error } = await supabase
    .from("marketplace_listings")
    .update({
      title: v.title,
      category: v.category,
      sport_key: v.sport === "multi" ? null : v.sport,
      condition: v.condition,
      mode: v.mode,
      price_cents: v.priceCents,
      obo: v.obo,
      trade_wants: v.tradeWants,
      description: v.description || null,
      zip: v.zip,
      location: v.location,
      meet_court_ids: v.meetCourtIds,
      photos,
    })
    .eq("id", id);
  if (error) return { error: "Couldn\u2019t save changes \u2014 please try again." };

  revalidatePath("/marketplace");
  revalidatePath(`/marketplace/${id}`);
  redirect(`/marketplace/${id}`);
}

/** Soft delete: hidden everywhere; photos removed from storage. */
export async function removeListing(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const id = String(formData.get("listing_id") || "");
  const { data: l } = await supabase.from("marketplace_listings").select("id, listed_by, photos").eq("id", id).maybeSingle();
  if (!l || l.listed_by !== user.id) return;
  if (l.photos?.length) await supabase.storage.from("listing-photos").remove(l.photos);
  await supabase.from("marketplace_listings").update({ status: "removed", photos: [] }).eq("id", id);
  revalidatePath("/marketplace");
  revalidatePath("/marketplace/mine");
}
