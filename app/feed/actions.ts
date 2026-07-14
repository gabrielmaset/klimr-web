"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notify";

/** Share a post with players nearby. Invite-only community → auto-approved;
 *  the 0112 trigger emits the regional feed card. */
export async function createFeedPost(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const body = String(formData.get("body") ?? "").trim().slice(0, 500);
  if (body.length < 2) return;
  const sport = String(formData.get("sport") ?? "").trim() || null;
  await supabase.from("posts").insert({ author_id: user.id, body, sport_key: sport, moderation_status: "approved" });
  revalidatePath("/feed");
}

/** Remove your own post — the trigger clears its feed card. */
export async function deleteOwnPost(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const postId = String(formData.get("post_id") ?? "");
  if (!postId) return;
  await supabase.from("posts").delete().eq("id", postId).eq("author_id", user.id);
  revalidatePath("/feed");
}

/** Heart / unheart a post. Notifies the author (guarded, never self). */
export async function togglePostLike(postId: string): Promise<{ ok: boolean; liked: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, liked: false, error: "Sign in first." };

  const { data: mine } = await supabase.from("post_likes").select("post_id").eq("post_id", postId).eq("user_id", user.id).maybeSingle();
  if (mine) {
    await supabase.from("post_likes").delete().eq("post_id", postId).eq("user_id", user.id);
    return { ok: true, liked: false };
  }
  const { error } = await supabase.from("post_likes").insert({ post_id: postId, user_id: user.id });
  if (error) return { ok: false, liked: false, error: error.message };

  const { data: post } = await supabase.from("posts").select("author_id").eq("id", postId).maybeSingle();
  if (post && post.author_id !== user.id) {
    const admin = createAdminClient();
    const { data: recent } = await admin
      .from("notifications")
      .select("id")
      .eq("user_id", post.author_id)
      .eq("link_url", "/feed")
      .gte("created_at", new Date(Date.now() - 60 * 60000).toISOString())
      .limit(1);
    if (!recent?.length) {
      const { data: me } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
      await createNotification({ userId: post.author_id, kind: "system", title: `${me?.display_name ?? "A member"} liked your post`, linkUrl: "/feed" });
    }
  }
  return { ok: true, liked: true };
}
