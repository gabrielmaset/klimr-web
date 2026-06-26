"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const ALLOWED = new Set(["image/webp", "image/jpeg", "image/png"]);

/**
 * Issue a single-use signed upload URL for the caller's own avatar.
 * Security: the path is built server-side from auth.uid() — the client never
 * supplies it — and storage RLS independently restricts writes to avatars/<uid>/…,
 * so even a tampered request can't write outside the user's own folder.
 */
export async function createAvatarUploadUrl(contentType: string) {
  if (!ALLOWED.has(contentType)) throw new Error("Unsupported image type");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const ext = contentType === "image/jpeg" ? "jpg" : contentType === "image/png" ? "png" : "webp";
  const path = `${user.id}/${randomUUID()}.${ext}`;

  const { data, error } = await supabase.storage.from("avatars").createSignedUploadUrl(path);
  if (error) throw error;

  return { path, token: data.token };
}

/**
 * Point the profile at the freshly uploaded object and remove the previous one.
 * Returns the public URL for immediate display.
 */
export async function commitAvatar(path: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  if (!path.startsWith(`${user.id}/`)) throw new Error("That path is not yours");

  const { data: prev } = await supabase
    .from("profiles")
    .select("avatar_path")
    .eq("id", user.id)
    .single();

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_path: path })
    .eq("id", user.id);
  if (error) throw error;

  if (prev?.avatar_path && prev.avatar_path !== path) {
    await supabase.storage.from("avatars").remove([prev.avatar_path]); // best-effort cleanup
  }

  revalidatePath("/account");
  const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
  return { url: pub.publicUrl };
}

/** Remove the avatar and fall back to the gradient. */
export async function removeAvatar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { data: prev } = await supabase.from("profiles").select("avatar_path").eq("id", user.id).single();
  await supabase.from("profiles").update({ avatar_path: null }).eq("id", user.id);
  if (prev?.avatar_path) {
    await supabase.storage.from("avatars").remove([prev.avatar_path]);
  }
  revalidatePath("/account");
  revalidatePath("/me");
}

/* ---------- cover photo (reuses the avatars bucket, covers/<uid>/…) ---------- */

export async function createCoverUploadUrl(contentType: string) {
  if (!ALLOWED.has(contentType)) throw new Error("Unsupported image type");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const ext = contentType === "image/jpeg" ? "jpg" : contentType === "image/png" ? "png" : "webp";
  const path = `${user.id}/cover-${randomUUID()}.${ext}`;
  const { data, error } = await supabase.storage.from("avatars").createSignedUploadUrl(path);
  if (error) throw error;
  return { path, token: data.token };
}

export async function commitCover(path: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  if (!path.startsWith(`${user.id}/`)) throw new Error("That path is not yours");

  const { data: prev } = await supabase.from("profiles").select("cover_path").eq("id", user.id).single();
  const { error } = await supabase.from("profiles").update({ cover_path: path }).eq("id", user.id);
  if (error) throw error;

  if (prev?.cover_path && prev.cover_path !== path) {
    await supabase.storage.from("avatars").remove([prev.cover_path]); // best-effort cleanup
  }
  revalidatePath("/me");
  const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
  return { url: pub.publicUrl };
}

export async function removeCover() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { data: prev } = await supabase.from("profiles").select("cover_path").eq("id", user.id).single();
  await supabase.from("profiles").update({ cover_path: null }).eq("id", user.id);
  if (prev?.cover_path) {
    await supabase.storage.from("avatars").remove([prev.cover_path]);
  }
  revalidatePath("/me");
}
