"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { lookupZip } from "@/lib/us-places";
import { createAdminClient } from "@/lib/supabase/admin";
import { ageFromDob } from "@/lib/age";

export type PrefState = { ok?: boolean; error?: string } | undefined;
export type DeleteState = { error?: string } | undefined;

const DIGEST = ["none", "daily", "weekly"];
const VIS = ["public", "members"];
const PREC = ["city", "neighborhood", "zip"];
const INVITE = ["anyone", "verified", "nobody"];

const pick = (v: FormDataEntryValue | null, allow: string[], fallback: string) =>
  allow.includes(String(v)) ? String(v) : fallback;
const bool = (v: FormDataEntryValue | null) => v === "true" || v === "on";

export async function savePreferences(_prev: PrefState, formData: FormData): Promise<PrefState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in." };

  const row = {
    user_id: user.id,
    notif_match_invites: bool(formData.get("notif_match_invites")),
    notif_ranking_changes: bool(formData.get("notif_ranking_changes")),
    notif_region_challenges: bool(formData.get("notif_region_challenges")),
    notif_marketplace_events: bool(formData.get("notif_marketplace_events")),
    email_digest: pick(formData.get("email_digest"), DIGEST, "weekly"),
    profile_visibility: pick(formData.get("profile_visibility"), VIS, "members"),
    location_precision: pick(formData.get("location_precision"), PREC, "neighborhood"),
    who_can_invite: pick(formData.get("who_can_invite"), INVITE, "anyone"),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("user_preferences").upsert(row, { onConflict: "user_id" });
  if (error) {
    console.error("[settings] save failed", error.code, error.message);
    return { error: `Couldn't save${error.code ? ` (${error.code})` : ""}. Please try again.` };
  }
  revalidatePath("/settings");
  return { ok: true };
}

export async function unblockPlayer(formData: FormData) {
  const target = String(formData.get("userId"));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("blocks").delete().eq("blocker_id", user.id).eq("blocked_id", target);
  revalidatePath("/settings");
  revalidatePath("/settings/blocked");
}

export async function deleteAccount(_prev: DeleteState, formData: FormData): Promise<DeleteState> {
  const confirm = String(formData.get("confirm") ?? "").trim().toUpperCase();
  if (confirm !== "DELETE") return { error: 'Type DELETE to confirm.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in." };

  // profiles.id references auth.users on delete cascade, and every user-owned table
  // cascades from profiles — so removing the auth user removes all of their data.
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return { error: "Could not delete your account. Please contact hello@klimr.com." };

  await supabase.auth.signOut();
  redirect("/?deleted=1");
}

/* ------------------------------------------------------------------ *
 * Targeted settings editors. Each saves ONLY its own slice of the
 * profile (the onboarding wizard's saveProfile writes the whole record,
 * so it must not be reused here — a partial submit would blank the rest).
 * ------------------------------------------------------------------ */

const LEVELS = new Set(["new", "casual", "competitive", "advanced"]);
const GENDERS = new Set(["woman", "man", "nonbinary", "prefer_not"]);
const FORMATS = new Set(["singles", "doubles", "both"]);
const HANDS = new Set(["right", "left", "either"]);
const DAYS = new Set(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
const TIME_RE = /^([01]\d|2[0-3]):(00|15|30|45)$/;

export type EditState = { ok?: boolean; error?: string } | undefined;

// Profile & details: name, bio, gender, date of birth, home ZIP.
export async function saveProfileBasics(_prev: EditState, formData: FormData): Promise<EditState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in." };

  const firstName = String(formData.get("first_name") || "").trim();
  const lastName = String(formData.get("last_name") || "").trim();
  const timezone = String(formData.get("timezone") || "").slice(0, 64) || null;
  if (firstName.length < 2 || firstName.length > 40) return { error: "Enter your first name." };
  if (lastName.length < 2 || lastName.length > 40) return { error: "Enter your last name." };

  const zip = String(formData.get("zip") || "").trim();
  if (!/^\d{5}$/.test(zip)) return { error: "Enter a 5-digit ZIP code." };

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
  const birthYear = new Date(dobRaw).getFullYear();

  const { data: region } = await supabase
    .from("zip_regions")
    .select("neighborhood, city, state, country")
    .eq("zip", zip)
    .maybeSingle();

  const usFallback = region ? null : lookupZip(zip);
  if (!region && !usFallback) {
    return { error: "Klimr is currently available only in the United States. The ZIP code you entered doesn\u2019t match a U.S. location \u2014 please double-check it or use a valid 5-digit U.S. ZIP. We\u2019re working hard to bring Klimr to more countries soon." };
  }
  if (region?.country && region.country !== "US") {
    return { error: "Klimr is currently available only in the United States. The ZIP code you entered doesn\u2019t match a U.S. location \u2014 please double-check it or use a valid 5-digit U.S. ZIP. We\u2019re working hard to bring Klimr to more countries soon." };
  }

  // Verified identity is immutable: once verification_status = 'verified',
  // legal name and date of birth can only change through support review.
  const { data: current } = await supabase
    .from("profiles")
    .select("verification_status, first_name, last_name, date_of_birth")
    .eq("id", user.id)
    .maybeSingle();
  const identityLocked = current?.verification_status === "verified";
  const lockedFirst = identityLocked ? (current?.first_name ?? firstName) : firstName;
  const lockedLast = identityLocked ? (current?.last_name ?? lastName) : lastName;
  const lockedDob = identityLocked ? (current?.date_of_birth ?? dobRaw) : dobRaw;
  if (identityLocked && (firstName !== lockedFirst || lastName !== lockedLast || dobRaw !== lockedDob)) {
    return { error: "Your identity is verified — name and date of birth are locked. Contact support to correct them." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: lockedFirst,
      first_name: lockedFirst,
      last_name: lockedLast,
      bio,
      gender,
      date_of_birth: lockedDob,
      birth_year: birthYear,
      home_zip: zip,
      timezone,
      neighborhood: region?.neighborhood ?? null,
      city: region?.city ?? usFallback?.city ?? null,
      state: region?.state ?? usFallback?.state ?? null,
      country: region?.country ?? "US",
    })
    .eq("id", user.id);
  if (error) {
    console.error("[settings] profile save failed", error.code, error.message);
    return { error: `Couldn't save${error.code ? ` (${error.code})` : ""}. Please try again.` };
  }
  revalidatePath("/settings");
  revalidatePath("/me");
  return { ok: true };
}

type PickedSport = { key: string; level: string; primary: boolean; rating: string; format?: string; hand?: string };

// Sports & skill levels + which sport is the default.
export async function saveSports(_prev: EditState, formData: FormData): Promise<EditState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in." };

  let picked: PickedSport[];
  try {
    picked = JSON.parse(String(formData.get("sports_json") || "[]"));
  } catch {
    return { error: "Could not read your sports. Try again." };
  }
  if (!Array.isArray(picked) || picked.length === 0) return { error: "Pick at least one sport." };

  const { data: sportRows } = await supabase.from("sports").select("key");
  const validKeys = new Set((sportRows ?? []).map((s) => s.key));

  const ratings = new Map<string, number | null>();
  const fmts = new Map<string, string>();
  const hands = new Map<string, string | null>();
  for (const s of picked) {
    if (!validKeys.has(s.key) || !LEVELS.has(s.level)) return { error: "One of your sports could not be saved." };
    const raw = String(s.rating ?? "").trim();
    if (!raw) ratings.set(s.key, null);
    else {
      const r = Number(raw);
      if (!Number.isFinite(r) || r < 0 || r > 60) return { error: "Ratings look like 3.5 or 18 — or leave them blank." };
      ratings.set(s.key, Math.round(r * 10) / 10);
    }
    fmts.set(s.key, FORMATS.has(String(s.format)) ? String(s.format) : "both");
    hands.set(s.key, HANDS.has(String(s.hand)) ? String(s.hand) : null);
  }
  const primary = picked.find((s) => s.primary)?.key ?? picked[0].key;

  const { error: profErr } = await supabase
    .from("profiles")
    .update({
      primary_sport: primary,
      preferred_format: fmts.get(primary) ?? "both",
      handedness: hands.get(primary) ?? null,
    })
    .eq("id", user.id);
  if (profErr) {
    console.error("[settings] sports profile save failed", profErr.code, profErr.message);
    return { error: `Couldn't save${profErr.code ? ` (${profErr.code})` : ""}. Please try again.` };
  }

  const { error: sErr } = await supabase.from("player_sports").upsert(
    picked.map((s) => ({
      user_id: user.id,
      sport_key: s.key,
      skill_level: s.level,
      skill_rating: ratings.get(s.key),
      preferred_format: fmts.get(s.key) ?? "both",
      handedness: hands.get(s.key) ?? null,
    })),
    { onConflict: "user_id,sport_key" },
  );
  if (sErr) {
    console.error("[settings] sports save failed", sErr.code, sErr.message);
    return { error: `Couldn't save${sErr.code ? ` (${sErr.code})` : ""}. Please try again.` };
  }

  // Preserve stats when a sport is removed: instead of deleting the row (which
  // would drop points, record, and skill), flip an `active` flag. De-selected
  // sports are hidden from the profile but keep every stat, and re-selecting one
  // restores it intact. player_sports guards stats + has no user DELETE policy, so
  // the flag flips run on the admin client, scoped to this user and only the
  // racquet sports this editor manages (never touches beach volleyball).
  const EDITOR_SPORTS = ["tennis", "pickleball", "padel", "racquetball"];
  const kept = picked.map((s) => s.key);
  const keptSet = new Set(kept);
  const toHide = EDITOR_SPORTS.filter((k) => !keptSet.has(k));
  const admin = createAdminClient();
  // Re-activate anything the user picked (covers a previously hidden sport).
  const { error: onErr } = await admin.from("player_sports").update({ active: true }).eq("user_id", user.id).in("sport_key", kept);
  if (onErr) {
    console.error("[settings] sports activate failed", onErr.code, onErr.message);
    return { error: `Couldn't save${onErr.code ? ` (${onErr.code})` : ""}. Please try again.` };
  }
  if (toHide.length) {
    const { error: offErr } = await admin.from("player_sports").update({ active: false }).eq("user_id", user.id).in("sport_key", toHide);
    if (offErr) {
      console.error("[settings] sports hide failed", offErr.code, offErr.message);
      return { error: `Couldn't save${offErr.code ? ` (${offErr.code})` : ""}. Please try again.` };
    }
  }
  revalidatePath("/settings");
  revalidatePath("/me");
  return { ok: true };
}

type Range = { day: string; start: string; end: string };

// Availability schedule: a list of { day, start, end } 15-minute ranges.
export async function saveAvailability(_prev: EditState, formData: FormData): Promise<EditState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in." };

  let parsed: unknown;
  try {
    parsed = JSON.parse(String(formData.get("availability_json") || "[]"));
  } catch {
    parsed = [];
  }
  const availability: Range[] = [];
  if (Array.isArray(parsed)) {
    for (const r of parsed) {
      if (!r || typeof r !== "object") return { error: "Your schedule could not be read." };
      const day = String((r as Range).day);
      const start = String((r as Range).start);
      const end = String((r as Range).end);
      if (!DAYS.has(day) || !TIME_RE.test(start) || !TIME_RE.test(end)) return { error: "Your schedule could not be read." };
      const [sh, sm] = start.split(":").map(Number);
      const [eh, em] = end.split(":").map(Number);
      if (sh * 60 + sm >= eh * 60 + em) return { error: "Each time block needs an end later than its start." };
      availability.push({ day, start, end });
    }
  }

  const { error } = await supabase.from("profiles").update({ availability }).eq("id", user.id);
  if (error) {
    console.error("[settings] availability save failed", error.code, error.message);
    return { error: `Couldn't save${error.code ? ` (${error.code})` : ""}. Please try again.` };
  }
  revalidatePath("/settings");
  return { ok: true };
}
