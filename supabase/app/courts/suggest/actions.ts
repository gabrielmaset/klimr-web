"use server";

import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/ratelimit";
import { SPORT_KEYS } from "@/lib/sports";

export type SuggestState = { ok?: boolean; error?: string } | undefined;

const clean = (v: FormDataEntryValue | null, max: number) => {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, max) : null;
};
const urlish = (s: string | null) => !s || /^https?:\/\/\S+$/i.test(s);

export async function createCourtSuggestion(_prev: SuggestState, formData: FormData): Promise<SuggestState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in." };

  const ok = await rateLimit(`court-suggest:${user.id}`, 5, 86_400);
  if (!ok) return { error: "That's plenty for one day — an admin is on it." };

  const name = clean(formData.get("name"), 120);
  const address = clean(formData.get("address"), 200);
  if (!name || name.length < 3) return { error: "Give the court a name." };
  if (!address || address.length < 8) return { error: "We need a findable address." };
  const website_url = clean(formData.get("website_url"), 300);
  const maps_url = clean(formData.get("maps_url"), 400);
  if (!urlish(website_url) || !urlish(maps_url)) return { error: "Links must start with http:// or https://." };
  const sports = formData.getAll("sports").map(String).filter((k) => SPORT_KEYS.includes(k));
  if (sports.length === 0) return { error: "Pick at least one sport this court is for." };

  const { error } = await supabase.from("court_suggestions").insert({
    user_id: user.id,
    name,
    address,
    phone: clean(formData.get("phone"), 30),
    website_url,
    maps_url,
    notes: clean(formData.get("notes"), 500),
    sports,
  });
  if (error) {
    console.error("[courts] suggestion insert failed", error.code, error.message);
    return { error: "Couldn't save that. Please try again." };
  }
  return { ok: true };
}
