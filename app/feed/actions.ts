"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notify";
import { moderateText } from "@/lib/moderation";
import { accountActive } from "@/lib/guards";

/** Share a post with players nearby. The 0006 trigger forces every user-client
 *  insert to `pending`; the AI text gate (lib/moderation) then decides, and the
 *  service role — the only principal allowed to change moderation_status —
 *  publishes or rejects. `approved` is what makes the 0112 trigger emit the
 *  feed card, so blocked content never surfaces anywhere. */
export async function createFeedPost(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  if (!(await accountActive(supabase, user.id))) return;
  const body = String(formData.get("body") ?? "").trim().slice(0, 500);
  if (body.length < 2) return;
  const sport = String(formData.get("sport") ?? "").trim() || null;
  const { data: inserted } = await supabase
    .from("posts")
    .insert({ author_id: user.id, body, sport_key: sport })
    .select("id")
    .maybeSingle();
  if (!inserted) return;
  const v = await moderateText(body);
  const admin = createAdminClient();
  await admin
    .from("posts")
    .update({ moderation_status: v.allowed ? "approved" : "rejected", moderation_labels: v.categories.length ? v.categories : null })
    .eq("id", inserted.id);
  revalidatePath("/feed");
}

/** Comment on a post — flat threads with exactly one reply level (0132 trigger
 *  is the backstop; we validate first for friendly errors). Same honest
 *  moderation pipeline as posts. Notifies the post author on publish. */
export async function addPostComment(input: {
  postId: string;
  body: string;
  parentId?: string | null;
}): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in to comment." };
  if (!(await accountActive(supabase, user.id))) return { error: "Your account can't comment right now." };
  const body = input.body.trim().slice(0, 500);
  if (body.length < 1) return { error: "Write something first." };
  const postId = input.postId;
  const parentId = input.parentId || null;

  if (parentId) {
    const { data: parent } = await supabase
      .from("post_comments")
      .select("id, post_id, parent_comment_id")
      .eq("id", parentId)
      .maybeSingle();
    if (!parent) return { error: "That comment is gone." };
    if (parent.post_id !== postId) return { error: "That comment belongs to another post." };
    if (parent.parent_comment_id) return { error: "Replies go one level deep — reply to the original comment." };
  }

  const { data: inserted, error: insErr } = await supabase
    .from("post_comments")
    .insert({ post_id: postId, author_id: user.id, body, parent_comment_id: parentId })
    .select("id")
    .maybeSingle();
  if (insErr || !inserted) return { error: "Couldn't post your comment." };

  const v = await moderateText(body);
  const admin = createAdminClient();
  await admin
    .from("post_comments")
    .update({ moderation_status: v.allowed ? "approved" : "rejected" })
    .eq("id", inserted.id);
  if (!v.allowed) return { error: v.reason ?? "That comment can't be posted." };

  // Tell the post author (never yourself; light dedupe like the like path).
  const { data: post } = await admin.from("posts").select("author_id").eq("id", postId).maybeSingle();
  if (post && post.author_id !== user.id) {
    const { data: me } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
    await createNotification({
      userId: post.author_id,
      kind: "system",
      title: `${me?.display_name ?? "A member"} commented on your post`,
      body: body.slice(0, 120),
      linkUrl: "/feed",
    });
  }
  revalidatePath("/feed");
  return { ok: true };
}

/** Remove your own comment (replies cascade with it, per 0132). */
export async function deleteOwnComment(commentId: string): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };
  const { error } = await supabase.from("post_comments").delete().eq("id", commentId).eq("author_id", user.id);
  if (error) return { error: "Couldn't delete that comment." };
  revalidatePath("/feed");
  return { ok: true };
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
      await createNotification({ userId: post.author_id, kind: "system", title: `${me?.display_name ?? "A member"} aced your post`, linkUrl: "/feed" });
    }
  }
  return { ok: true, liked: true };
}

export type ThreadComment = {
  id: string;
  parentId: string | null;
  body: string;
  authorName: string;
  mine: boolean;
  createdAt: string;
};

/** Approved comments for one post, oldest-first — the thread loads lazily when
 *  a member expands it, so the Wire's 45 blocks never pay for threads nobody
 *  opened. `mine` is computed server-side so the client needs no identity. */
export async function listPostComments(postId: string): Promise<{ comments: ThreadComment[]; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { comments: [], error: "Sign in to read comments." };
  const { data: rows, error } = await supabase
    .from("post_comments")
    .select("id, author_id, body, parent_comment_id, created_at")
    .eq("post_id", postId)
    .eq("moderation_status", "approved")
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) return { comments: [], error: "Couldn't load comments." };
  const authorIds = [...new Set((rows ?? []).map((r) => r.author_id))];
  const names = new Map<string, string>();
  if (authorIds.length) {
    const { data: profs } = await supabase.from("profiles").select("id, display_name").in("id", authorIds);
    for (const p of (profs ?? []) as { id: string; display_name: string }[]) names.set(p.id, p.display_name);
  }
  return {
    comments: (rows ?? []).map((r) => ({
      id: r.id,
      parentId: r.parent_comment_id,
      body: r.body,
      authorName: names.get(r.author_id) ?? "A member",
      mine: r.author_id === user.id,
      createdAt: r.created_at,
    })),
  };
}

/** One-tap repost toggle. A repost is a post with `repost_of` set and no body
 *  (commentary is schema-ready for later). The 0133 trigger enforces the rules
 *  (published originals only, no repost-of-repost, one per member); the unique
 *  index makes the toggle deterministic. No AI pass needed — there is no new
 *  text — so the service role approves directly and the feed card emits. */
export async function toggleRepost(postId: string): Promise<{ ok: boolean; reposted: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reposted: false, error: "Sign in first." };
  if (!(await accountActive(supabase, user.id))) return { ok: false, reposted: false, error: "Your account can't repost right now." };

  const { data: mine } = await supabase
    .from("posts")
    .select("id")
    .eq("author_id", user.id)
    .eq("repost_of", postId)
    .maybeSingle();
  if (mine) {
    await supabase.from("posts").delete().eq("id", mine.id).eq("author_id", user.id);
    revalidatePath("/feed");
    return { ok: true, reposted: false };
  }

  const { data: original } = await supabase
    .from("posts")
    .select("id, author_id, repost_of, moderation_status")
    .eq("id", postId)
    .maybeSingle();
  if (!original || original.moderation_status !== "approved") return { ok: false, reposted: false, error: "That post isn't available." };
  if (original.repost_of) return { ok: false, reposted: false, error: "Repost the original instead." };

  const { data: inserted, error: insErr } = await supabase
    .from("posts")
    .insert({ author_id: user.id, repost_of: postId })
    .select("id")
    .maybeSingle();
  if (insErr || !inserted) return { ok: false, reposted: false, error: "Couldn't repost." };

  const admin = createAdminClient();
  await admin.from("posts").update({ moderation_status: "approved" }).eq("id", inserted.id);

  if (original.author_id !== user.id) {
    const { data: recent } = await admin
      .from("notifications")
      .select("id")
      .eq("user_id", original.author_id)
      .eq("link_url", "/feed")
      .gte("created_at", new Date(Date.now() - 60 * 60000).toISOString())
      .limit(1);
    if (!recent?.length) {
      const { data: me } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
      await createNotification({
        userId: original.author_id,
        kind: "system",
        title: `${me?.display_name ?? "A member"} reposted your post`,
        linkUrl: "/feed",
      });
    }
  }
  revalidatePath("/feed");
  return { ok: true, reposted: true };
}

/* ============ Recap tag consent (decision #4: pending until approved) ============ */

/** Tag players on your own post. RLS enforces authorship; the 0134 triggers
 *  refuse self-tags and blocked pairs. Each tagged player gets a notification
 *  and their name stays private until they approve. */
export async function tagPlayersOnPost(postId: string, userIds: string[]): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in first." };
  const ids = [...new Set(userIds)].filter((id) => id && id !== user.id).slice(0, 8);
  if (!ids.length) return { ok: false, error: "Pick at least one player." };
  const { error } = await supabase
    .from("post_tags")
    .insert(ids.map((uid) => ({ post_id: postId, user_id: uid, tagged_by: user.id })));
  if (error) return { ok: false, error: "Couldn't add those tags." };
  const { data: me } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  await Promise.all(
    ids.map((uid) =>
      createNotification({
        userId: uid,
        kind: "system",
        title: `${me?.display_name ?? "A member"} tagged you in a recap`,
        body: "Your name shows only if you approve.",
        linkUrl: "/feed",
      }),
    ),
  );
  revalidatePath("/feed");
  return { ok: true };
}

/** Approve or decline your tag — form action (one response ever, per trigger). */
export async function respondToTag(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const tagId = String(formData.get("tagId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!tagId || (decision !== "approved" && decision !== "declined")) return;
  const { data: tag } = await supabase
    .from("post_tags")
    .select("id, tagged_by")
    .eq("id", tagId)
    .eq("user_id", user.id)
    .maybeSingle();
  const { error } = await supabase.from("post_tags").update({ status: decision }).eq("id", tagId).eq("user_id", user.id);
  if (!error && decision === "approved" && tag && tag.tagged_by !== user.id) {
    const { data: me } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
    await createNotification({
      userId: tag.tagged_by,
      kind: "system",
      title: `${me?.display_name ?? "A member"} approved your tag`,
      linkUrl: "/feed",
    });
  }
  revalidatePath("/feed");
}

/** Retract a tag you created (any status). */
export async function retractTag(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const tagId = String(formData.get("tagId") ?? "");
  if (!tagId) return;
  await supabase.from("post_tags").delete().eq("id", tagId).eq("tagged_by", user.id);
  revalidatePath("/feed");
}
