"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notify";
import { moderateText, moderateImage } from "@/lib/moderation";
import { accountActive } from "@/lib/guards";
import { getPrivilegedClient } from "@/lib/privileged";

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
  const { count: recentComments } = await supabase
    .from("post_comments")
    .select("id", { count: "exact", head: true })
    .eq("author_id", user.id)
    .gte("created_at", new Date(Date.now() - 3_600_000).toISOString());
  if ((recentComments ?? 0) >= 60) return { error: "You've hit the hourly comment limit — back to the court for a bit." };
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
      actorId: user.id,
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
      await createNotification({
        actorId: user.id, userId: post.author_id, kind: "system", title: `${me?.display_name ?? "A member"} aced your post`, linkUrl: "/feed" });
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

/** DISABLED (KCDX-038). Repost machinery exists in three places and the product
 *  says it does not exist in a fourth:
 *
 *    · 0133 creates the schema, the trigger and the unique index
 *    · this action implements the toggle
 *    · 0157's ranking EXCLUDES reposts (`where p.repost_of is null`) and even
 *      indexes on that exclusion
 *    · `feed-post-card.tsx` tells the member "No reposts on Klimr — sharing is
 *      person-to-person"
 *
 *  So a repost created through this path is a real row that no feed will ever
 *  show. Not an error, not a warning: silent, permanent invisibility. The audit
 *  asks to choose one policy and either remove or complete it, and the product
 *  has already chosen — the card states it to members, which is the most
 *  binding of the four.
 *
 *  The SCHEMA stays: 0133's rows may exist in production, and dropping a table
 *  to tidy a contradiction destroys data to make a codebase read better. The
 *  implementation does not stay — it is in git, and a dead function that still
 *  works is an invitation to call it, which is how the contradiction would
 *  return. Re-enabling means removing this guard AND the ranking exclusion AND
 *  the card's copy; one place will not do it, which is exactly the failure being
 *  fixed here. */
export async function toggleRepost(postId: string): Promise<{ ok: boolean; reposted: boolean; error?: string }> {
  void postId;
  return { ok: false, reposted: false, error: "Reposts aren\u2019t part of Klimr — share the link instead." };
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
        actorId: user.id,
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
      actorId: user.id,
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

/** Feed v2 — request a signed upload slot in feed-media for the composer.
 *  Path is always {user.id}/... so the bucket's own-folder RLS holds; the
 *  client uploads directly, then submits the post with the returned path. */
export async function prepareFeedMediaUpload(input: {
  kind: "photo" | "video";
  contentType: string;
  ext: string;
}): Promise<{ ok: boolean; path?: string; token?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in first." };
  if (!(await accountActive(supabase, user.id))) return { ok: false, error: "Account inactive." };
  const { count: recentPosts } = await supabase
    .from("posts")
    .select("id", { count: "exact", head: true })
    .eq("author_id", user.id)
    .gte("created_at", new Date(Date.now() - 3_600_000).toISOString());
  if ((recentPosts ?? 0) >= 15) return { ok: false, error: "You've hit the hourly posting limit." };
  const { data: recentObjects } = await createAdminClient()
    .storage.from("feed-media")
    .list(user.id, { limit: 60, sortBy: { column: "created_at", order: "desc" } });
  const uploadsLastHour = (recentObjects ?? []).filter((o) => o.created_at && Date.parse(o.created_at) > Date.now() - 3_600_000).length;
  if (uploadsLastHour >= 30) return { ok: false, error: "You've hit the hourly upload limit." };
  // KCDX-006: video is disabled until there is a real media safety gate. The
  // boundary is the feed-media MIME allowlist and the posts_reject_video trigger
  // (migration 0195) — this refusal exists so the composer gets a sentence
  // instead of a Storage error, not because it is the thing stopping anyone.
  if (input.kind === "video") return { ok: false, error: "Video posts aren't available yet." };
  const okImage = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!okImage.includes(input.contentType)) return { ok: false, error: "Unsupported file type." };
  const ext = input.ext.replace(/[^a-z0-9]/gi, "").slice(0, 5).toLowerCase() || "bin";
  const path = `${user.id}/${input.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  // KCDX-014: minted by the service role AFTER the checks above (account state,
  // hourly post and upload ceilings, type allowlist). The member no longer holds
  // an INSERT policy on this bucket, so this token is the only way in — which is
  // what makes "every photo is screened" a true statement rather than a hope.
  const { data, error } = await getPrivilegedClient({ reason: "feed:mint-media-upload", actorId: user.id })
    .storage.from("feed-media").createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: "Could not start the upload." };
  return { ok: true, path, token: data.token };
}

/** Feed v2 — typed member posts (post / photo / video / ask / milestone), with
 *  per-post audience and an HONEST result: the composer always learns exactly
 *  what happened. States:
 *    approved — visible per audience rules immediately;
 *    pending  — the safety gate could not run (or a large image awaits review):
 *               only the author sees it, wearing an IN REVIEW chip;
 *    rejected — the classifier flagged it: author-only NOT PUBLISHED chip, and
 *               any uploaded media is deleted on the spot.
 *  Gate-infrastructure labels (moderation_error / moderation_unconfigured /
 *  image_review) route to pending — a broken classifier must never look like
 *  a content verdict. Match reports still come only from create_match_post(). */
export type CreatePostResult = { ok: boolean; status?: "approved" | "pending" | "rejected"; error?: string };

const GATE_DOWN = new Set(["moderation_error", "moderation_unconfigured", "image_review"]);

export async function createTypedFeedPost(formData: FormData): Promise<CreatePostResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in first." };
  if (!(await accountActive(supabase, user.id))) return { ok: false, error: "Your account isn't active." };
  const { count: recentPosts } = await supabase
    .from("posts")
    .select("id", { count: "exact", head: true })
    .eq("author_id", user.id)
    .gte("created_at", new Date(Date.now() - 3_600_000).toISOString());
  if ((recentPosts ?? 0) >= 15) return { ok: false, error: "You've hit the hourly posting limit — let the feed breathe." };

  const rawType = String(formData.get("post_type") ?? "post");
  // KCDX-006: 'video' is deliberately absent from this list. The publish path
  // never ran a classifier for video — it pushed a `media_unscreened` LABEL and
  // no verdict, so the status computed to `approved`. A note to ourselves is not
  // a gate, and the duration and content type were both asserted by the browser.
  const postType = ["post", "photo", "ask", "milestone"].includes(rawType) ? rawType : "post";
  const rawAud = String(formData.get("audience") ?? "public");
  const audience = ["public", "followers", "friends"].includes(rawAud) ? rawAud : "public";
  const body = String(formData.get("body") ?? "").trim().slice(0, 500);
  const sport = String(formData.get("sport") ?? "").trim() || null;
  const mediaPathRaw = String(formData.get("media_path") ?? "").trim();
  const durationRaw = Number(formData.get("media_duration_seconds") ?? 0);
  const milestoneLabel = String(formData.get("milestone_label") ?? "").trim().slice(0, 120);

  const needsMedia = postType === "photo" || postType === "video";
  const mediaPath = mediaPathRaw && mediaPathRaw.startsWith(`${user.id}/`) && !mediaPathRaw.includes("..") ? mediaPathRaw : null;
  if (needsMedia && !mediaPath) return { ok: false, error: "Attach the photo or clip first." };
  if (!needsMedia && body.length < 2) return { ok: false, error: "Write a couple of words first." };
  void durationRaw;
  const duration = null;

  const { data: inserted, error: insErr } = await supabase
    .from("posts")
    .insert({
      author_id: user.id,
      body: body || null,
      sport_key: sport,
      post_type: postType,
      audience,
      media_path: mediaPath,
      media_duration_seconds: duration,
      milestone: postType === "milestone" && milestoneLabel ? { label: milestoneLabel } : null,
    })
    .select("id")
    .maybeSingle();
  if (insErr || !inserted) {
    console.error("[feed] post insert failed", insErr?.message);
    return { ok: false, error: "Could not save the post — try again." };
  }

  const admin = createAdminClient();
  const verdicts = [await moderateText(body || milestoneLabel || postType)];
  const extraLabels: string[] = [];
  if (postType === "photo" && mediaPath) {
    const { data: file } = await admin.storage.from("feed-media").download(mediaPath);
    if (!file) {
      verdicts.push({ allowed: false, categories: ["moderation_error"], reason: "Could not read the upload." });
    } else {
      const buf = Buffer.from(await file.arrayBuffer());
      if (buf.byteLength <= 4_500_000) {
        verdicts.push(await moderateImage(buf.toString("base64"), file.type || "image/jpeg"));
      } else {
        verdicts.push({ allowed: false, categories: ["image_review"], reason: "Large image queued for review." });
      }
    }
  }

  const labels = [...new Set([...verdicts.flatMap((v) => v.categories), ...extraLabels])];
  const flagged = verdicts.some((v) => !v.allowed && v.categories.some((c) => !GATE_DOWN.has(c)));
  const gateDown = !flagged && verdicts.some((v) => !v.allowed);
  const status: "approved" | "pending" | "rejected" = flagged ? "rejected" : gateDown ? "pending" : "approved";

  if (status === "rejected" && mediaPath) {
    await admin.storage.from("feed-media").remove([mediaPath]);
  }
  const { error: pubErr } = await admin
    .from("posts")
    .update({ moderation_status: status, moderation_labels: labels.length ? labels : null })
    .eq("id", inserted.id);
  if (pubErr) {
    // Service-role publish failed (bad env, network) — the row stays pending, the
    // author still sees it with the IN REVIEW chip. Loud in the logs.
    console.error("[feed] moderation publish failed", pubErr.message);
    revalidatePath("/feed");
    return { ok: true, status: "pending" };
  }
  revalidatePath("/feed");
  return { ok: true, status };
}

/** KCDX-034: a member reporting a post from the Feed.
 *
 *  There was no way to do this. Not a slow way or an awkward way — none. Every
 *  other safety control on the Feed is automated detection (the CSAM hash gate,
 *  the classifier, re-moderation on edit, video containment); this is the one
 *  that catches what automation misses, and the active card had no affordance
 *  for it at all.
 *
 *  The command snapshots the body and preserves the media, because the author
 *  can delete the content the moment they suspect a report — and a report that
 *  dies with its subject stops working exactly when someone is trying to escape
 *  it. */
export async function reportPost(
  postId: string,
  reason: string,
  detail?: string,
): Promise<{ ok?: true; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  const { data, error } = await supabase.rpc("report_post", {
    p_post: postId,
    p_reason: reason,
    p_detail: detail ?? null,
  });
  const res = data as { ok?: boolean; error?: string; already_reported?: boolean } | null;
  if (error || !res?.ok) {
    switch (res?.error) {
      case "own_post":
        return { error: "That's your own post — you can delete it instead." };
      case "rate_limited":
        return { error: "You've reported a lot recently. Try again shortly." };
      case "not_found":
        return { error: "That post is no longer here." };
      default:
        return { error: "Couldn't send that report. Please try again." };
    }
  }
  revalidatePath("/feed");
  return { ok: true };
}
