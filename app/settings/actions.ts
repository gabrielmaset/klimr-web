"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
  if (error) return { error: "Could not save your settings. Please try again." };
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
