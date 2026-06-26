"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function toggleSave(formData: FormData) {
  const listingId = String(formData.get("listingId"));
  if (!listingId) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/marketplace/${listingId}`);

  const { data: existing } = await supabase
    .from("saved_listings")
    .select("listing_id")
    .eq("user_id", user.id)
    .eq("listing_id", listingId)
    .maybeSingle();

  if (existing) {
    await supabase.from("saved_listings").delete().eq("user_id", user.id).eq("listing_id", listingId);
  } else {
    await supabase.from("saved_listings").insert({ user_id: user.id, listing_id: listingId });
  }
  revalidatePath("/marketplace");
  revalidatePath(`/marketplace/${listingId}`);
}
