"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { SPORT_KEYS } from "@/lib/sports";
import { accountActive } from "@/lib/guards";

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

  if (!SPORT_KEYS.includes(sport)) return { error: "Pick a sport." };
  if (format !== "singles" && format !== "doubles") return { error: "Pick a format." };
  const slots = Number.isFinite(slotsRaw) ? Math.min(8, Math.max(2, slotsRaw)) : format === "doubles" ? 4 : 2;

  let scheduledAt: string | null = null;
  if (when) {
    const d = new Date(when);
    if (!Number.isNaN(d.getTime())) scheduledAt = d.toISOString();
  }

  const { data: match, error } = await supabase
    .from("matches")
    .insert({
      sport_key: sport,
      format,
      organizer_id: user.id,
      scheduled_at: scheduledAt,
      location_text: location || null,
      total_slots: slots,
      status: "open",
      recurring,
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
