"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { moderateText } from "@/lib/moderation";
import { accountActive } from "@/lib/guards";
import { SPORT_KEYS } from "@/lib/sports";

export type PostState = { ok?: boolean; error?: string } | undefined;
export type CommentState = { ok?: boolean; error?: string } | undefined;

export async function createPost(_prev: PostState, formData: FormData): Promise<PostState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in." };
  if (!(await accountActive(supabase, user.id)))
    return { error: "Your account is restricted and can't post right now." };

  const body = String(formData.get("body") ?? "").trim().slice(0, 1000);
  const sportRaw = String(formData.get("sport") ?? "");
  const sport_key = SPORT_KEYS.includes(sportRaw) ? sportRaw : null;

  if (!body) return { error: "Write something to post." };

  // Screen text before publish. Image uploads are intentionally disabled in the
  // feed for now; the media-safety pipeline stays in the codebase for later.
  const v = await moderateText(body);
  if (!v.allowed) {
    return { error: `Your post was blocked by our safety check${v.reason ? `: ${v.reason}` : "."}` };
  }

  // Publish via the service role (the only role allowed to set 'approved').
  const admin = createAdminClient();
  const { error } = await admin.from("posts").insert({
    author_id: user.id,
    body,
    sport_key,
    moderation_status: "approved",
    moderation_labels: v.categories.length ? v.categories : null,
  });
  if (error) return { error: "Could not publish your post. Please try again." };

  revalidatePath("/feed");
  revalidatePath("/");
  return { ok: true };
}

export async function toggleLike(formData: FormData) {
  const postId = String(formData.get("postId"));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { data: existing } = await supabase
    .from("post_likes")
    .select("post_id")
    .eq("post_id", postId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing) {
    await supabase.from("post_likes").delete().eq("post_id", postId).eq("user_id", user.id);
  } else {
    await supabase.from("post_likes").insert({ post_id: postId, user_id: user.id });
  }
  revalidatePath("/feed");
}

export async function addComment(_prev: CommentState, formData: FormData): Promise<CommentState> {
  const postId = String(formData.get("postId"));
  const body = String(formData.get("body") ?? "").trim().slice(0, 500);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in." };
  if (!(await accountActive(supabase, user.id)))
    return { error: "Your account is restricted and can't comment right now." };
  if (!body) return { error: "Write a comment first." };

  const v = await moderateText(body);
  if (!v.allowed) return { error: `Your comment was blocked by our safety check${v.reason ? `: ${v.reason}` : "."}` };

  const admin = createAdminClient();
  const { error } = await admin
    .from("post_comments")
    .insert({ post_id: postId, author_id: user.id, body, moderation_status: "approved" });
  if (error) return { error: "Could not post your comment." };

  revalidatePath("/feed");
  return { ok: true };
}
