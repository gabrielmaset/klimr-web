"use server";

import { getAdminRole } from "@/lib/admin";
import { evaluateAndPersistCourtFacts } from "@/lib/court-facts";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { accountActive } from "@/lib/guards";
import { moderateText } from "@/lib/moderation";
import { courtReviewEligibility } from "@/lib/court-access";

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

  // Only verified players who've actually been here can review.
  const { eligible } = await courtReviewEligibility(supabase, user.id, courtId);
  if (!eligible) return;

  if (body) {
    const v = await moderateText(body);
    if (!v.allowed) return; // blocked reviews are dropped
  }

  await supabase
    .from("court_reviews")
    .upsert({ court_id: courtId, author_id: user.id, rating, body: body || null }, { onConflict: "court_id,author_id" });
  revalidatePath(`/courts/${courtId}`);
}

// Check in at a court — this is the "I'm actually here" signal that powers busy
// status and unlocks reviewing.
export async function checkInCourt(formData: FormData) {
  const courtId = String(formData.get("courtId"));
  if (!courtId) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/courts/${courtId}`);
  if (!(await accountActive(supabase, user.id))) return;
  await supabase.from("court_checkins").insert({ court_id: courtId, user_id: user.id });
  revalidatePath(`/courts/${courtId}`);
}

/** Admin tool: run the AI facts evaluator for a court right now. The
 *  evaluator only fills NULL fields (per-field confidence >= 0.7) and marks
 *  them AI-inferred; human confirmations always win. */
export async function aiEvaluateCourtFacts(courtId: string): Promise<{ ok: boolean; wrote: string[]; note: string }> {
  const role = await getAdminRole();
  if (!role) return { ok: false, wrote: [], note: "Admins only." };
  const admin = createAdminClient();
  const { data: c } = await admin
    .from("courts")
    .select("id, name, sports, google_place_id, lights, free, indoor, court_count, facts_inferred")
    .eq("id", courtId)
    .maybeSingle();
  if (!c) return { ok: false, wrote: [], note: "Court not found." };
  const result = await evaluateAndPersistCourtFacts(c);
  revalidatePath(`/courts/${courtId}`);
  revalidatePath("/courts");
  return result;
}
