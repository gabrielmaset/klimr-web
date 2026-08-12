"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
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

  // KRA-021: these two `createNotification` calls are gone. 0212's trigger on
  // `friendships` already enqueues `connection_requested` / `connection_accepted`
  // into `social_outbox`, and `deliver_social_outbox()` writes the SAME
  // notification rows — same kind, same title, same body, same link. Every
  // connection request produced two identical notifications.
  //
  // The outbox is the path that survives: it is trigger-fired inside the same
  // transaction as the friendship row, it retries, and it delivers even if this
  // request dies between the RPC and the notification. The inline call is the one
  // that can silently not happen, so it is the one that goes.

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
  // KRA-021: same duplicate. The trigger fires on the friendship status change,
  // so accepting already enqueues `connection_accepted`.
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

// ---- form-compatible wrappers — kept name-stable for existing <form action>
// callers like the Invites page.
//
// KCDX-062: these used to return `void`, so every result — including `blocked`,
// `rate_limited` and `cooldown` — was discarded before the caller could see it.
// The network browser then applied an optimistic patch and caught-and-ignored,
// so a refused request still rendered as "Requested". They now RETURN the
// result. `<form action>` ignores a return value, so those callers are
// unaffected; the ones that await get the truth. ----

export async function sendFriendRequest(formData: FormData): Promise<SocialActionResult> {
  return requestConnection(String(formData.get("userId") ?? ""));
}
export async function acceptFriendRequest(formData: FormData): Promise<SocialActionResult> {
  return acceptConnection(String(formData.get("userId") ?? ""));
}
/** Decline / cancel / unfriend from a form. Declines pass declined=1 so the
 *  cooldown only applies to true declines, never to cancels or unfriends. */
export async function removeFriend(formData: FormData): Promise<SocialActionResult> {
  return removeConnection(String(formData.get("userId") ?? ""), String(formData.get("declined") ?? "") === "1");
}
export async function followUser(formData: FormData): Promise<SocialActionResult> {
  return follow(String(formData.get("userId") ?? ""));
}
export async function unfollowUser(formData: FormData): Promise<SocialActionResult> {
  return unfollow(String(formData.get("userId") ?? ""));
}

/** KCDX-029: persist a "not this person" so it survives a page refresh.
 *  Expiring (90 days) by design — "not right now" and "never" are different
 *  answers, and one tap should not be permanent. */
export async function dismissSuggestion(targetId: string): Promise<{ ok?: true; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };
  const { error } = await supabase.rpc("pymk_dismiss", { p_target: targetId });
  if (error) return { error: "Couldn\u2019t hide that suggestion." };
  revalidatePath("/network");
  return { ok: true };
}
