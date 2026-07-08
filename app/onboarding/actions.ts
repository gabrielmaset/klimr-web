"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { lookupZip } from "@/lib/us-places";
import { ageFromDob } from "@/lib/age";

export type WizardState = { error?: string };

const LEVELS = new Set(["new", "casual", "competitive", "advanced"]);
const GENDERS = new Set(["woman", "man", "nonbinary", "prefer_not"]);
const FORMATS = new Set(["singles", "doubles", "both"]);
const STYLES = new Set(["social", "competitive", "both"]);
const HANDS = new Set(["right", "left", "either"]);
const DAYS = new Set(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
const TIME_RE = /^([01]\d|2[0-3]):(00|15|30|45)$/;

type PickedSport = {
  key: string;
  level: string;
  primary: boolean;
  rating: string;
  format?: string;
  hand?: string;
};
type Range = { day: string; start: string; end: string };

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
  const firstName = String(formData.get("first_name") || "").trim();
  const lastName = String(formData.get("last_name") || "").trim();
  if (firstName.length < 2 || firstName.length > 40) return { error: "Enter your first name." };
  if (lastName.length < 2 || lastName.length > 40) return { error: "Enter your last name." };
  const displayName = firstName;

  const zip = String(formData.get("zip") || "").trim();
  if (!/^\d{5}$/.test(zip)) return { error: "Enter a 5-digit ZIP code." };

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
  const fmts = new Map<string, string>();
  const hands = new Map<string, string | null>();
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
    fmts.set(s.key, FORMATS.has(String(s.format)) ? String(s.format) : "both");
    hands.set(s.key, HANDS.has(String(s.hand)) ? String(s.hand) : null);
  }
  const primary = sportsPicked.find((s) => s.primary)?.key ?? sportsPicked[0].key;

  const style = String(formData.get("play_style") || "both");
  if (!STYLES.has(style)) {
    return { error: "Your play preferences could not be read. Go back a step and re-pick." };
  }

  // availability is a list of { day, start, end } ranges, times on 15-min steps.
  let parsedAvail: unknown;
  try {
    parsedAvail = JSON.parse(String(formData.get("availability_json") || "[]"));
  } catch {
    parsedAvail = [];
  }
  const availability: Range[] = [];
  if (Array.isArray(parsedAvail)) {
    for (const r of parsedAvail) {
      if (!r || typeof r !== "object") {
        return { error: "Your schedule could not be read. Go back a step and re-add your times." };
      }
      const day = String((r as Range).day);
      const start = String((r as Range).start);
      const end = String((r as Range).end);
      if (!DAYS.has(day) || !TIME_RE.test(start) || !TIME_RE.test(end)) {
        return { error: "Your schedule could not be read. Go back a step and re-add your times." };
      }
      const [sh, sm] = start.split(":").map(Number);
      const [eh, em] = end.split(":").map(Number);
      if (sh * 60 + sm >= eh * 60 + em) {
        return { error: "Each time block needs an end later than its start." };
      }
      availability.push({ day, start, end });
    }
  }

  const bioRaw = String(formData.get("bio") || "").trim();
  const bio = bioRaw ? bioRaw.slice(0, 160) : null;

  const genderRaw = String(formData.get("gender") || "").trim();
  const gender = GENDERS.has(genderRaw) ? genderRaw : null;

  const dobRaw = String(formData.get("dob") || "").trim();
  if (!dobRaw) return { error: "Enter your date of birth." };
  const age = ageFromDob(dobRaw);
  if (age === null) return { error: "Enter a valid date of birth." };
  if (age < 18) return { error: "Klimr is 18+ during the beta." };
  if (age > 120) return { error: "Enter a valid date of birth." };
  const dateOfBirth = dobRaw; // YYYY-MM-DD
  const birthYear = new Date(dobRaw).getFullYear();

  const hue = Math.min(360, Math.max(0, Number(formData.get("avatar_hue")) || 200));

  /* ---- region lookup ---- */
  const { data: region } = await supabase
    .from("zip_regions")
    .select("neighborhood, city, state, country")
    .eq("zip", zip)
    .maybeSingle();

  /* US-only gate: the ZIP must resolve to a U.S. location — either in our own
     zip_regions table or the bundled US dataset. Unknown/foreign codes are
     rejected with a clear note (Klimr is US-only for now). */
  const usFallback = region ? null : lookupZip(zip);
  if (!region && !usFallback) {
    return { error: "Klimr is currently available only in the United States. The ZIP code you entered doesn\u2019t match a U.S. location \u2014 please double-check it or use a valid 5-digit U.S. ZIP. We\u2019re working hard to bring Klimr to more countries soon." };
  }
  if (region?.country && region.country !== "US") {
    return { error: "Klimr is currently available only in the United States. The ZIP code you entered doesn\u2019t match a U.S. location \u2014 please double-check it or use a valid 5-digit U.S. ZIP. We\u2019re working hard to bring Klimr to more countries soon." };
  }

  /* ---- writes ---- */
  // profiles keeps a convenience mirror of the PRIMARY sport's format + hand;
  // play_style stays profile-level. The per-sport source of truth is player_sports.
  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      display_name: displayName,
      first_name: firstName,
      last_name: lastName,
      home_zip: zip,
      neighborhood: region?.neighborhood ?? null,
      city: region?.city ?? usFallback?.city ?? null,
      state: region?.state ?? usFallback?.state ?? null,
      country: region?.country ?? "US",
      primary_sport: primary,
      bio,
      gender,
      birth_year: birthYear,
      date_of_birth: dateOfBirth,
      availability,
      avatar_hue: hue,
      preferred_format: fmts.get(primary) ?? "both",
      play_style: style,
      handedness: hands.get(primary) ?? null,
    })
    .eq("id", user.id);
  if (profileError) {
    return { error: "Could not save your profile. Try again in a moment." };
  }

  // One ranking row per sport, each carrying its own format + hand. New sports
  // insert with zeroed stats (DB defaults, enforced by RLS); existing rows get
  // level / rating / format / hand updated. The stats guard keeps
  // points / wins / matches untouchable from user context either way.
  const { error: sportsError } = await supabase.from("player_sports").upsert(
    sportsPicked.map((s) => ({
      user_id: user.id,
      sport_key: s.key,
      skill_level: s.level,
      skill_rating: ratings.get(s.key),
      preferred_format: fmts.get(s.key) ?? "both",
      handedness: hands.get(s.key) ?? null,
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
