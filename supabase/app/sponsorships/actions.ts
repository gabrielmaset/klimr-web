"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function respondToOffer(formData: FormData) {
  const id = String(formData.get("id"));
  const decision = String(formData.get("decision"));
  if (!id || !["accept", "decline"].includes(decision)) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // Only act on my own pending offer.
  const { data: row } = await supabase
    .from("player_sponsorships")
    .select("id, status")
    .eq("id", id)
    .eq("player_id", user.id)
    .maybeSingle();
  if (!row || row.status !== "offered") return;

  if (decision === "accept") {
    await supabase
      .from("player_sponsorships")
      .update({ status: "active", started_at: new Date().toISOString() })
      .eq("id", id)
      .eq("player_id", user.id);
  } else {
    await supabase.from("player_sponsorships").update({ status: "declined" }).eq("id", id).eq("player_id", user.id);
  }
  revalidatePath("/sponsorships");
}
