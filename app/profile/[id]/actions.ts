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
    // The RPC severs everything at once: block row + friendship + follows in
    // both directions + recommendation caches (migration 0099).
    const { error } = await supabase.rpc("block_player", { p_target: target });
    if (error) console.error("[social] block failed", error.code, error.message);
  }
  revalidatePath(`/profile/${target}`);
  revalidatePath("/network");
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

/** Open (or reuse) the direct E2E thread with this player — same primitive as
 *  Training Room chats (0110). Blocked pairs can't open threads. */
export async function messageMember(formData: FormData) {
  const target = String(formData.get("userId"));
  const { supabase, user } = await ctx();
  if (!user) redirect(`/login?next=/profile/${target}`);
  if (!target || target === user.id) redirect(`/profile/${target}`);

  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("kind", "dm")
    .or(`and(created_by.eq.${user.id},peer_id.eq.${target}),and(created_by.eq.${target},peer_id.eq.${user.id})`)
    .maybeSingle();
  let convId = existing?.id ?? null;
  if (!convId) {
    const { data: created, error } = await supabase
      .from("conversations")
      .insert({ kind: "dm", created_by: user.id, peer_id: target })
      .select("id")
      .single();
    if (created) convId = created.id;
    else if (error) {
      const { data: again } = await supabase
        .from("conversations")
        .select("id")
        .eq("kind", "dm")
        .or(`and(created_by.eq.${user.id},peer_id.eq.${target}),and(created_by.eq.${target},peer_id.eq.${user.id})`)
        .maybeSingle();
      convId = again?.id ?? null;
    }
  }
  if (!convId) redirect(`/profile/${target}?notice=chat`);
  redirect(`/messages/${convId}`);
}
