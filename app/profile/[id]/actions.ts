"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const REASONS = ["harassment", "cheating", "no_show", "inappropriate", "fake_profile", "other"] as const;
type Reason = (typeof REASONS)[number];

async function ctx() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function blockUser(formData: FormData) {
  const target = String(formData.get("userId"));
  const { supabase, user } = await ctx();
  if (!user) redirect(`/login?next=/profile/${target}`);
  if (target && target !== user.id) {
    await supabase.from("blocks").insert({ blocker_id: user.id, blocked_id: target });
  }
  revalidatePath(`/profile/${target}`);
}

export async function unblockUser(formData: FormData) {
  const target = String(formData.get("userId"));
  const { supabase, user } = await ctx();
  if (!user) redirect(`/login?next=/profile/${target}`);
  await supabase.from("blocks").delete().eq("blocker_id", user.id).eq("blocked_id", target);
  revalidatePath(`/profile/${target}`);
}

export async function reportUser(formData: FormData) {
  const target = String(formData.get("userId"));
  const reasonRaw = String(formData.get("reason") ?? "other");
  const reason: Reason = (REASONS as readonly string[]).includes(reasonRaw) ? (reasonRaw as Reason) : "other";
  const context = String(formData.get("context") ?? "").trim();
  const { supabase, user } = await ctx();
  if (!user) redirect(`/login?next=/profile/${target}`);
  if (target && target !== user.id) {
    await supabase.from("reports").insert({
      reporter_id: user.id,
      reported_id: target,
      reason,
      context: context || null,
    });
  }
  revalidatePath(`/profile/${target}`);
}
