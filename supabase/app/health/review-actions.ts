"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createNotification } from "@/lib/notify";

const PATHS = ["/health", "/classes"];

/** Create or update the caller's review of a verified professional.
 *  One per member per provider (DB-unique), 1–5 stars, no self-reviews
 *  (enforced here AND in RLS). Aggregates update via DB trigger. */
export async function upsertProviderReview(providerUserId: string, rating: number, body: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in to review." };
  if (user.id === providerUserId) return { ok: false as const, error: "You can't review yourself." };
  const stars = Math.round(Number(rating));
  if (!Number.isFinite(stars) || stars < 1 || stars > 5) return { ok: false as const, error: "Pick 1–5 stars." };
  const text = String(body ?? "").trim().slice(0, 1000) || null;

  const { data: existing } = await supabase
    .from("provider_reviews")
    .select("id")
    .eq("provider_user_id", providerUserId)
    .eq("reviewer_id", user.id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("provider_reviews")
      .update({ rating: stars, body: text, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) return { ok: false as const, error: error.message };
  } else {
    const { error } = await supabase
      .from("provider_reviews")
      .insert({ provider_user_id: providerUserId, reviewer_id: user.id, rating: stars, body: text });
    if (error) return { ok: false as const, error: error.message };
    const { data: me } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
    await createNotification({
      userId: providerUserId,
      kind: "system",
      title: `New review — ${"★".repeat(stars)}${"☆".repeat(5 - stars)}`,
      body: `${me?.display_name ?? "A member"} reviewed your professional profile.`,
      linkUrl: "/health",
    });
  }
  for (const p of PATHS) revalidatePath(p);
  return { ok: true as const };
}

/** Remove the caller's review of a provider. */
export async function deleteProviderReview(providerUserId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  const { error } = await supabase
    .from("provider_reviews")
    .delete()
    .eq("provider_user_id", providerUserId)
    .eq("reviewer_id", user.id);
  if (error) return { ok: false as const, error: error.message };
  for (const p of PATHS) revalidatePath(p);
  return { ok: true as const };
}
