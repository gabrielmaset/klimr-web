"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type WizardState = { error?: string };

const LEVELS = new Set(["new", "casual", "competitive", "advanced"]);
const GENDERS = new Set(["woman", "man", "nonbinary", "prefer_not"]);
const FORMATS = new Set(["singles", "doubles", "both"]);
const STYLES = new Set(["social", "competitive", "both"]);
const HANDS = new Set(["right", "left", "either"]);
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const SLOT_IDS = new Set(DAYS.flatMap((d) => ["am", "pm", "eve"].map((s) => `${d}-${s}`)));

export async function saveProfile(
  _prev: WizardState,
  formData: FormData,
): Promise<WizardState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  /* ---- parse + validate ---- */
  const displayName = String(formData.get("display_name") || "").trim();
  if (displayName.length < 2 || displayName.length > 40) {
    return { error: "Enter your name (2–40 characters)." };
  }

  const zip = String(formData.get("zip") || "").trim();
  if (!/^\d{5}$/.test(zip)) return { error: "Enter a 5-digit ZIP code." };

  type PickedSport = { key: string; level: string; primary: boolean; rating: string };
  let sportsPicked: PickedSport[];
  try {
    sportsPicked = JSON.parse(String(formData.get("sports_json") || "[]"));
  } catch {
    return { error: "Could not read your sports. Go back a step and try again." };
  }
  if (!Array.isArray(sportsPicked) || sportsPicked.length === 0) {
    return { error: "Pick at least one sport." };
  }
  const { data: sportRows } = await supabase.from("sports").select("key");
  const validKeys = new Set((sportRows ?? []).map((s) => s.key));
  const ratings = new Map<string, number | null>();
  for (const s of sportsPicked) {
    if (!validKeys.has(s.key) || !LEVELS.has(s.level)) {
      return { error: "One of your sports could not be saved. Go back a step and re-pick." };
    }
    const raw = String(s.rating ?? "").trim();
    if (!raw) {
      ratings.set(s.key, null);
    } else {
      const r = Number(raw);
      if (!Number.isFinite(r) || r < 0 || r > 60) {
        return { error: "Ratings look like 3.5 or 18 — or leave them blank." };
      }
      ratings.set(s.key, Math.round(r * 10) / 10);
    }
  }
  const primary = sportsPicked.find((s) => s.primary)?.key ?? sportsPicked[0].key;

  const format = String(formData.get("preferred_format") || "both");
  const style = String(formData.get("play_style") || "both");
  if (!FORMATS.has(format) || !STYLES.has(style)) {
    return { error: "Your play preferences could not be read. Go back a step and re-pick." };
  }
  const handRaw = String(formData.get("handedness") || "").trim();
  const handedness = HANDS.has(handRaw) ? handRaw : null;

  let availability: string[];
  try {
    availability = JSON.parse(String(formData.get("availability_json") || "[]"));
  } catch {
    availability = [];
  }
  if (!Array.isArray(availability) || availability.some((a) => !SLOT_IDS.has(a))) {
    return { error: "Your schedule could not be read. Go back a step and re-tap your times." };
  }

  const bioRaw = String(formData.get("bio") || "").trim();
  const bio = bioRaw ? bioRaw.slice(0, 160) : null;

  const genderRaw = String(formData.get("gender") || "").trim();
  const gender = GENDERS.has(genderRaw) ? genderRaw : null;

  const yearRaw = String(formData.get("birth_year") || "").trim();
  let birthYear: number | null = null;
  if (yearRaw) {
    const y = Number(yearRaw);
    const adultBy = new Date().getFullYear() - 18;
    if (!Number.isInteger(y) || y < 1900 || y > 2020) {
      return { error: "Birth year looks off — four digits, like 1990." };
    }
    if (y > adultBy) {
      return { error: "Klimr is 18+ during the beta. Leave birth year blank if you prefer." };
    }
    birthYear = y;
  }

  const hue = Math.min(360, Math.max(0, Number(formData.get("avatar_hue")) || 200));

  /* ---- region lookup ---- */
  const { data: region } = await supabase
    .from("zip_regions")
    .select("neighborhood, city, state, country")
    .eq("zip", zip)
    .maybeSingle();

  /* ---- writes ---- */
  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      display_name: displayName,
      home_zip: zip,
      neighborhood: region?.neighborhood ?? null,
      city: region?.city ?? null,
      state: region?.state ?? null,
      country: region?.country ?? "US",
      primary_sport: primary,
      bio,
      gender,
      birth_year: birthYear,
      availability,
      avatar_hue: hue,
      preferred_format: format,
      play_style: style,
      handedness,
    })
    .eq("id", user.id);
  if (profileError) {
    return { error: "Could not save your profile. Try again in a moment." };
  }

  // One ranking row per sport. New sports insert with zeroed stats (DB defaults,
  // enforced by RLS); existing rows get level + self-reported rating updated —
  // the stats guard keeps points/wins untouchable from user context either way.
  const { error: sportsError } = await supabase.from("player_sports").upsert(
    sportsPicked.map((s) => ({
      user_id: user.id,
      sport_key: s.key,
      skill_level: s.level,
      skill_rating: ratings.get(s.key),
    })),
    { onConflict: "user_id,sport_key" },
  );
  if (sportsError) {
    return { error: "Could not save your sports. Try again in a moment." };
  }

  const params = new URLSearchParams({ welcome: "1" });
  if (!region) params.set("note", "area");
  redirect(`/account?${params.toString()}`);
}
