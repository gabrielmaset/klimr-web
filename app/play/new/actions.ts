"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { SPORT_KEYS, matchFormatMeta } from "@/lib/sports";
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
  const format = String(formData.get("format") ?? "");
  const location = String(formData.get("location") ?? "").trim();
  const when = String(formData.get("scheduled_at") ?? "").trim();
  const recurring = formData.get("recurring") === "on";
  const recurrenceRaw = String(formData.get("recurrence") ?? "");
  const recurrence = recurring && ["weekly", "biweekly", "monthly"].includes(recurrenceRaw) ? recurrenceRaw : null;

  if (!SPORT_KEYS.includes(sport)) return { error: "Pick a sport." };
  // The format must exist in the canonical registry FOR THIS SPORT (beach
  // volleyball has no "singles"), and capacity is DERIVED from the spec —
  // server-authoritative, never typed by the client. The DB enforces the
  // same pairing via the sport_formats FK (migration 0164).
  const fmeta = matchFormatMeta(sport, format);
  if (!fmeta) return { error: "Pick a format for this sport." };
  const slots = fmeta.totalPlayers;

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

  const LEVEL_ORDER = ["new", "casual", "competitive", "advanced"] as const;
  type Level = (typeof LEVEL_ORDER)[number];
  const visibilityRaw = String(formData.get("visibility") || "public");
  const visibility = ["public", "followers", "friends"].includes(visibilityRaw) ? visibilityRaw : "public";
  const skillMinRaw = String(formData.get("skill_min") || "");
  const skillMaxRaw = String(formData.get("skill_max") || "");
  const skillMin = (LEVEL_ORDER as readonly string[]).includes(skillMinRaw) ? (skillMinRaw as Level) : null;
  const skillMax = (LEVEL_ORDER as readonly string[]).includes(skillMaxRaw) ? (skillMaxRaw as Level) : null;
  if (skillMin && skillMax && LEVEL_ORDER.indexOf(skillMin) > LEVEL_ORDER.indexOf(skillMax)) {
    return { error: "Skill range: the minimum level is above the maximum." };
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
      visibility,
      skill_min: skillMin,
      skill_max: skillMax,
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
