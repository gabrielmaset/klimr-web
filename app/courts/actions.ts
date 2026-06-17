"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { accountActive } from "@/lib/guards";
import { moderateText } from "@/lib/moderation";

export async function addReview(formData: FormData) {
  const courtId = String(formData.get("courtId"));
  const rating = Math.max(1, Math.min(5, parseInt(String(formData.get("rating") ?? "0"), 10) || 0));
  const body = String(formData.get("body") ?? "").trim().slice(0, 1000);
  if (!courtId || rating < 1) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  if (!(await accountActive(supabase, user.id))) return;

  if (body) {
    const v = await moderateText(body);
    if (!v.allowed) return; // blocked reviews are dropped
  }

  await supabase
    .from("court_reviews")
    .upsert({ court_id: courtId, author_id: user.id, rating, body: body || null }, { onConflict: "court_id,author_id" });
  revalidatePath(`/courts/${courtId}`);
}
