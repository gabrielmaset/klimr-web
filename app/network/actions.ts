"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { accountActive } from "@/lib/guards";
import { createNotification } from "@/lib/notify";

async function me() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

async function myName(supabase: Awaited<ReturnType<typeof createClient>>, id: string) {
  const { data } = await supabase.from("profiles").select("display_name").eq("id", id).maybeSingle();
  return data?.display_name || "A player";
}

/** Send a friend request to another verified member. */
export async function sendFriendRequest(formData: FormData) {
  const { supabase, user } = await me();
  if (!user) return;
  const targetId = String(formData.get("userId") ?? "");
  if (!targetId || targetId === user.id) return;
  if (!(await accountActive(supabase, user.id))) return;

  // If a row already exists in either direction, don't duplicate.
  const { data: existing } = await supabase
    .from("friendships")
    .select("id, requester_id, status")
    .or(`and(requester_id.eq.${user.id},addressee_id.eq.${targetId}),and(requester_id.eq.${targetId},addressee_id.eq.${user.id})`)
    .maybeSingle();

  if (existing) {
    // If the other person already invited me, accept instead of creating a dupe.
    if (existing.status === "pending" && existing.requester_id === targetId) {
      await supabase.from("friendships").update({ status: "accepted", responded_at: new Date().toISOString() }).eq("id", existing.id);
      revalidatePath(`/profile/${targetId}`);
    }
    return;
  }

  const { error } = await supabase.from("friendships").insert({ requester_id: user.id, addressee_id: targetId, status: "pending" });
  if (error) {
    console.error("[friends] request failed", error.code, error.message);
    return;
  }
  await createNotification({
    userId: targetId,
    kind: "system",
    title: `${await myName(supabase, user.id)} sent you a friend request`,
    body: "Respond in your invites.",
    linkUrl: "/invites",
  });
  revalidatePath(`/profile/${targetId}`);
}

/** Accept a pending request from `userId` (I'm the addressee). */
export async function acceptFriendRequest(formData: FormData) {
  const { supabase, user } = await me();
  if (!user) return;
  const requesterId = String(formData.get("userId") ?? "");
  if (!requesterId) return;

  const { error } = await supabase
    .from("friendships")
    .update({ status: "accepted", responded_at: new Date().toISOString() })
    .eq("requester_id", requesterId)
    .eq("addressee_id", user.id)
    .eq("status", "pending");
  if (error) {
    console.error("[friends] accept failed", error.code, error.message);
    return;
  }
  await createNotification({
    userId: requesterId,
    kind: "system",
    title: `${await myName(supabase, user.id)} accepted your friend request`,
    body: "You're now connected on Klimr.",
    linkUrl: `/profile/${user.id}`,
  });
  revalidatePath("/invites");
  revalidatePath(`/profile/${requesterId}`);
  revalidatePath("/network");
}

/** Decline / cancel / unfriend — removes the row from either side. */
export async function removeFriend(formData: FormData) {
  const { supabase, user } = await me();
  if (!user) return;
  const otherId = String(formData.get("userId") ?? "");
  if (!otherId) return;

  await supabase
    .from("friendships")
    .delete()
    .or(`and(requester_id.eq.${user.id},addressee_id.eq.${otherId}),and(requester_id.eq.${otherId},addressee_id.eq.${user.id})`);
  revalidatePath("/invites");
  revalidatePath(`/profile/${otherId}`);
  revalidatePath("/network");
}

export async function followUser(formData: FormData) {
  const { supabase, user } = await me();
  if (!user) return;
  const targetId = String(formData.get("userId") ?? "");
  if (!targetId || targetId === user.id) return;
  if (!(await accountActive(supabase, user.id))) return;

  const { error } = await supabase.from("follows").upsert({ follower_id: user.id, followee_id: targetId }, { onConflict: "follower_id,followee_id" });
  if (error) {
    console.error("[follows] follow failed", error.code, error.message);
    return;
  }
  revalidatePath(`/profile/${targetId}`);
  revalidatePath("/network");
}

export async function unfollowUser(formData: FormData) {
  const { supabase, user } = await me();
  if (!user) return;
  const targetId = String(formData.get("userId") ?? "");
  if (!targetId) return;
  await supabase.from("follows").delete().eq("follower_id", user.id).eq("followee_id", targetId);
  revalidatePath(`/profile/${targetId}`);
  revalidatePath("/network");
}
