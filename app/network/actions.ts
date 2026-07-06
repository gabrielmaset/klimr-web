"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createNotification } from "@/lib/notify";
import { requestResultMessage } from "@/lib/social";

// Every graph write goes through the SECURITY DEFINER RPCs from migration 0099:
// self/active/block checks, the decline cooldown, and rate limits all run
// inside one transaction with the pair row locked, and the canonical-pair
// unique index is the race backstop. These actions are thin: call the RPC,
// notify, revalidate.

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

export type SocialActionResult = { ok: boolean; message: string | null; state?: "requested" | "friends" };

/** Send a connection request (auto-accepts if they asked first). */
export async function requestConnection(targetId: string): Promise<SocialActionResult> {
  const { supabase, user } = await me();
  if (!user) return { ok: false, message: "Please sign in first." };
  if (!targetId || targetId === user.id) return { ok: false, message: null };

  const { data: result, error } = await supabase.rpc("request_connection", { p_target: targetId });
  if (error) {
    console.error("[social] request_connection failed", error.code, error.message);
    return { ok: false, message: "That didn't go through — try again." };
  }

  if (result === "requested") {
    await createNotification({
      userId: targetId,
      kind: "friend_request",
      title: `${await myName(supabase, user.id)} wants to connect`,
      body: "Respond in your invites.",
      linkUrl: "/invites",
    });
  } else if (result === "accepted") {
    // They had asked first — sending back sealed it. Tell them.
    await createNotification({
      userId: targetId,
      kind: "friend_accept",
      title: `${await myName(supabase, user.id)} accepted your connection request`,
      body: "You're now connected on Klimr.",
      linkUrl: `/profile/${user.id}`,
    });
  }

  revalidatePath(`/profile/${targetId}`);
  revalidatePath("/network");
  const mapped = requestResultMessage(result ?? "");
  return { ...mapped, state: result === "accepted" || result === "already_connected" ? "friends" : mapped.ok ? "requested" : undefined };
}

/** Accept a pending request from `requesterId` (I'm the addressee). */
export async function acceptConnection(requesterId: string): Promise<SocialActionResult> {
  const { supabase, user } = await me();
  if (!user) return { ok: false, message: "Please sign in first." };
  if (!requesterId) return { ok: false, message: null };

  const { data: ok, error } = await supabase.rpc("accept_connection", { p_requester: requesterId });
  if (error || !ok) {
    if (error) console.error("[social] accept_connection failed", error.code, error.message);
    return { ok: false, message: "Couldn't accept that request — it may have been withdrawn." };
  }
  await createNotification({
    userId: requesterId,
    kind: "friend_accept",
    title: `${await myName(supabase, user.id)} accepted your connection request`,
    body: "You're now connected on Klimr.",
    linkUrl: `/profile/${user.id}`,
  });
  revalidatePath("/invites");
  revalidatePath(`/profile/${requesterId}`);
  revalidatePath("/network");
  return { ok: true, message: null, state: "friends" };
}

/** Decline an incoming request (records a cooldown), cancel a sent one, or unfriend. */
export async function removeConnection(otherId: string, asDecline = false): Promise<SocialActionResult> {
  const { supabase, user } = await me();
  if (!user) return { ok: false, message: "Please sign in first." };
  if (!otherId) return { ok: false, message: null };

  const { error } = await supabase.rpc("remove_connection", { p_other: otherId, p_as_decline: asDecline });
  if (error) {
    console.error("[social] remove_connection failed", error.code, error.message);
    return { ok: false, message: "That didn't go through — try again." };
  }
  revalidatePath("/invites");
  revalidatePath(`/profile/${otherId}`);
  revalidatePath("/network");
  return { ok: true, message: null };
}

export async function follow(targetId: string): Promise<SocialActionResult> {
  const { supabase, user } = await me();
  if (!user) return { ok: false, message: "Please sign in first." };
  const { data: ok, error } = await supabase.rpc("follow_player", { p_target: targetId });
  if (error || !ok) {
    if (error) console.error("[social] follow failed", error.code, error.message);
    return { ok: false, message: "Couldn't follow this player right now." };
  }
  revalidatePath(`/profile/${targetId}`);
  revalidatePath("/network");
  return { ok: true, message: null };
}

export async function unfollow(targetId: string): Promise<SocialActionResult> {
  const { supabase, user } = await me();
  if (!user) return { ok: false, message: "Please sign in first." };
  const { error } = await supabase.rpc("unfollow_player", { p_target: targetId });
  if (error) console.error("[social] unfollow failed", error.code, error.message);
  revalidatePath(`/profile/${targetId}`);
  revalidatePath("/network");
  return { ok: true, message: null };
}

// ---- form-compatible wrappers (return void) — kept name-stable for existing
// <form action> callers like the Invites page. ----

export async function sendFriendRequest(formData: FormData) {
  await requestConnection(String(formData.get("userId") ?? ""));
}
export async function acceptFriendRequest(formData: FormData) {
  await acceptConnection(String(formData.get("userId") ?? ""));
}
/** Decline / cancel / unfriend from a form. Declines pass declined=1 so the
 *  cooldown only applies to true declines, never to cancels or unfriends. */
export async function removeFriend(formData: FormData) {
  await removeConnection(String(formData.get("userId") ?? ""), String(formData.get("declined") ?? "") === "1");
}
export async function followUser(formData: FormData) {
  await follow(String(formData.get("userId") ?? ""));
}
export async function unfollowUser(formData: FormData) {
  await unfollow(String(formData.get("userId") ?? ""));
}
