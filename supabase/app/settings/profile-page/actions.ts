"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const CATEGORIES = new Set(["racquet", "paddle", "strings", "shoes", "bag", "other"]);

/** Save the public-profile page settings: privacy toggles, gear bag, usual times. */
export async function saveProfilePageSettings(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings/profile-page");

  let gear: { category: string; model: string; spec: string | null }[] = [];
  try {
    const raw = JSON.parse(String(formData.get("gear") ?? "[]"));
    if (Array.isArray(raw)) {
      gear = raw
        .slice(0, 8)
        .map((g) => ({
          category: CATEGORIES.has(String(g?.category)) ? String(g.category) : "other",
          model: String(g?.model ?? "").trim().slice(0, 60),
          spec: String(g?.spec ?? "").trim().slice(0, 40) || null,
        }))
        .filter((g) => g.model.length > 0);
    }
  } catch {
    gear = [];
  }

  await supabase
    .from("profiles")
    .update({
      gear,
      usual_times: String(formData.get("usual_times") ?? "").trim().slice(0, 90) || null,
      show_courts: formData.get("show_courts") === "on",
      show_teams: formData.get("show_teams") === "on",
      show_tournaments: formData.get("show_tournaments") === "on",
    })
    .eq("id", user.id);

  revalidatePath("/settings/profile-page");
  revalidatePath(`/profile/${user.id}`);
  redirect("/settings/profile-page?saved=1");
}
