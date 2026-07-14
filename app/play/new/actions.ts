"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { SPORT_KEYS } from "@/lib/sports";
import { accountActive } from "@/lib/guards";
import { upsertGoogleCourt } from "@/app/courts/search-actions";

export type CreateState = { error?: string } | undefined;

export async function createMatch(_prev: CreateState, formData: FormData): Promise<CreateState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in to organize a match." };
  if (!(await accountActive(supabase, user.id))) return { error: "Your account is restricted right now." };

  const sport = String(formData.get("sport") ?? "");
  const format = String(formData.get("format") ?? "singles");
  const location = String(formData.get("location") ?? "").trim();
  const when = String(formData.get("scheduled_at") ?? "").trim();
  const slotsRaw = parseInt(String(formData.get("slots") ?? ""), 10);
  const recurring = formData.get("recurring") === "on";
  const recurrenceRaw = String(formData.get("recurrence") ?? "");
  const recurrence = recurring && ["weekly", "biweekly", "monthly"].includes(recurrenceRaw) ? recurrenceRaw : null;

  if (!SPORT_KEYS.includes(sport)) return { error: "Pick a sport." };
  if (format !== "singles" && format !== "doubles") return { error: "Pick a format." };
  const slots = Number.isFinite(slotsRaw) ? Math.min(8, Math.max(2, slotsRaw)) : format === "doubles" ? 4 : 2;

  let scheduledAt: string | null = null;
  if (when) {
    const d = new Date(when);
    if (!Number.isNaN(d.getTime())) scheduledAt = d.toISOString();
  }

  // Resolve the chosen court: an existing directory row, or a Google place we
  // persist now. Either way it's optional — location_text is the free-text note.
  let courtId: string | null = null;
  const rawCourt = String(formData.get("court_payload") ?? "");
  if (rawCourt) {
    try {
      const p = JSON.parse(rawCourt);
      if (p?.courtId && typeof p.courtId === "string") {
        courtId = p.courtId;
      } else if (p?.placeId && p?.name) {
        const r = await upsertGoogleCourt({
          placeId: String(p.placeId),
          name: String(p.name),
          address: p.address ?? null,
          lat: typeof p.lat === "number" ? p.lat : null,
          lng: typeof p.lng === "number" ? p.lng : null,
          rating: typeof p.rating === "number" ? p.rating : null,
          ratingCount: typeof p.ratingCount === "number" ? p.ratingCount : null,
          private: p.private === true,
          website: typeof p.website === "string" ? p.website : null,
          sport,
        });
        courtId = r.courtId;
      }
    } catch {
      // Malformed payload — fall back to free-text location only.
    }
  }

  const { data: match, error } = await supabase
    .from("matches")
    .insert({
      sport_key: sport,
      format,
      organizer_id: user.id,
      scheduled_at: scheduledAt,
      location_text: location || null,
      court_id: courtId,
      total_slots: slots,
      status: "open",
      recurring,
      recurrence,
    })
    .select("id")
    .single();

  if (error || !match) return { error: error?.message ?? "Could not create the match. Please try again." };

  // The organizer takes the first slot.
  await supabase.from("match_participants").insert({
    match_id: match.id,
    user_id: user.id,
    slot: 1,
    is_organizer: true,
    confirmed: true,
  });

  revalidatePath("/play");
  redirect(`/play/${match.id}`);
}

/** Before-you-create crosscheck: open matches nearby (same sport, seats free,
 *  upcoming or anytime, not yours) the person could join instead. */
export async function findOpenMatches(sport: string, zip: string): Promise<
  { id: string; scheduledAt: string | null; courtName: string | null; distanceMi: number | null; seated: number; total: number; organizer: string }[]
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !sport) return [];

  const { lookupZip } = await import("@/lib/us-places");
  const pt = zip ? lookupZip(zip) : null;

  const { data: ms } = await supabase
    .from("matches")
    .select("id, sport_key, scheduled_at, court_id, location_text, total_slots, organizer_id, status")
    .eq("sport_key", sport)
    .eq("status", "open")
    .neq("organizer_id", user.id)
    .or(`scheduled_at.is.null,scheduled_at.gte.${new Date().toISOString()}`)
    .order("scheduled_at", { ascending: true, nullsFirst: false })
    .limit(30);
  const cands = ms ?? [];
  if (!cands.length) return [];

  const ids = cands.map((m) => m.id);
  const courtIds = [...new Set(cands.map((m) => m.court_id).filter((x): x is string => !!x))];
  const [{ data: parts }, { data: courts }, { data: orgs }] = await Promise.all([
    supabase.from("match_participants").select("match_id, user_id").in("match_id", ids),
    courtIds.length ? supabase.from("courts").select("id, name, lat, lng").in("id", courtIds) : Promise.resolve({ data: [] as { id: string; name: string; lat: number | null; lng: number | null }[] }),
    supabase.from("profiles").select("id, display_name").in("id", [...new Set(cands.map((m) => m.organizer_id).filter((x): x is string => !!x))]),
  ]);
  const seatCount = new Map<string, number>();
  const iAmIn = new Set<string>();
  for (const p of parts ?? []) {
    seatCount.set(p.match_id, (seatCount.get(p.match_id) ?? 0) + 1);
    if (p.user_id === user.id) iAmIn.add(p.match_id);
  }
  const courtById = new Map((courts ?? []).map((c) => [c.id, c]));
  const orgName = new Map((orgs ?? []).map((o) => [o.id, o.display_name]));
  const R = 3958.8;
  const dist = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  };

  return cands
    .filter((m) => !iAmIn.has(m.id))
    .map((m) => {
      const seated = seatCount.get(m.id) ?? 0;
      const total = m.total_slots ?? 2;
      const c = m.court_id ? courtById.get(m.court_id) : null;
      const mi = pt && c?.lat != null && c?.lng != null ? Math.round(dist({ lat: pt.lat, lng: pt.lng }, { lat: c.lat, lng: c.lng }) * 10) / 10 : null;
      return {
        id: m.id,
        scheduledAt: m.scheduled_at,
        courtName: c?.name ?? m.location_text ?? null,
        distanceMi: mi,
        seated,
        total,
        organizer: (m.organizer_id ? orgName.get(m.organizer_id) : null) ?? "a member",
      };
    })
    .filter((m) => m.seated < m.total && (m.distanceMi == null || m.distanceMi <= 15))
    .slice(0, 3);
}
