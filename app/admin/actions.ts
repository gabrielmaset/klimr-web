"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin, logAdminAction } from "@/lib/admin";
import { SPORT_KEYS } from "@/lib/sports";

export async function resolveReport(formData: FormData) {
  const { userId } = await requireAdmin("support");
  const reportId = String(formData.get("reportId"));
  const statusRaw = String(formData.get("status"));
  const status = ["reviewing", "actioned", "dismissed", "open"].includes(statusRaw) ? statusRaw : "reviewing";
  const resolution = String(formData.get("resolution") ?? "").trim() || null;

  const admin = createAdminClient();
  await admin
    .from("reports")
    .update({ status, resolution, reviewed_by: userId, reviewed_at: new Date().toISOString() })
    .eq("id", reportId);
  await logAdminAction(userId, `report:${status}`, null, resolution ?? undefined, reportId);
  revalidatePath("/admin/reports");
  revalidatePath("/admin");
}

/** Passwordless account recovery: email the user a fresh magic sign-in link
 *  (Klimr has no passwords, so this is the equivalent of a password reset). */
export async function sendSignInLink(
  _prev: { ok?: boolean; error?: string } | null,
  formData: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  const { userId } = await requireAdmin("admin");
  const target = String(formData.get("userId") ?? "");
  if (!target) return { error: "Missing user." };

  const admin = createAdminClient();
  const { data: authData, error: getErr } = await admin.auth.admin.getUserById(target);
  const email = authData?.user?.email;
  if (getErr || !email) return { error: "Couldn't find that account's email." };

  // Same flow as /login: token-hash magic link → /auth/confirm.
  const origin = (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const anon = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: otpErr } = await anon.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${origin}/auth/confirm?next=/account` },
  });
  if (otpErr) return { error: "Couldn't send the sign-in link. Try again." };

  await logAdminAction(userId, "auth:signin_link", target);
  return { ok: true };
}

export async function setVerification(formData: FormData) {
  const { userId } = await requireAdmin("admin");
  const target = String(formData.get("userId"));
  const value = String(formData.get("value")) === "verified" ? "verified" : "unverified";

  const admin = createAdminClient();
  await admin.from("profiles").update({ verification_status: value }).eq("id", target);
  await logAdminAction(userId, `verification:${value}`, target);
  revalidatePath(`/admin/users/${target}`);
}

export async function setAccountStatus(formData: FormData) {
  const target = String(formData.get("userId"));
  const statusRaw = String(formData.get("status"));
  const status = ["active", "suspended", "banned"].includes(statusRaw) ? statusRaw : "active";
  // Banning requires a higher level than a temporary suspension.
  const { userId } = await requireAdmin(status === "banned" ? "admin" : "support");

  const days = parseInt(String(formData.get("days") ?? ""), 10);
  const suspended_until =
    status === "suspended" && Number.isFinite(days) && days > 0
      ? new Date(Date.now() + days * 86_400_000).toISOString()
      : null;

  const admin = createAdminClient();
  await admin.from("profiles").update({ account_status: status, suspended_until }).eq("id", target);
  await logAdminAction(userId, `account:${status}`, target, suspended_until ? `until ${suspended_until}` : undefined);
  revalidatePath(`/admin/users/${target}`);
  revalidatePath("/admin");
}

export async function removePost(formData: FormData) {
  const { userId } = await requireAdmin("support");
  const postId = String(formData.get("postId"));
  const admin = createAdminClient();
  await admin.from("posts").update({ moderation_status: "rejected" }).eq("id", postId);
  await logAdminAction(userId, "post:removed", null, undefined, postId);
  revalidatePath("/feed");
  revalidatePath(`/admin/users/${String(formData.get("authorId") ?? "")}`);
}

export async function removeComment(formData: FormData) {
  const { userId } = await requireAdmin("support");
  const commentId = String(formData.get("commentId"));
  const admin = createAdminClient();
  await admin.from("post_comments").update({ moderation_status: "rejected" }).eq("id", commentId);
  await logAdminAction(userId, "comment:removed", null, undefined, commentId);
  revalidatePath("/feed");
}

export async function createFeedItem(
  _prev: { ok?: boolean; error?: string } | null,
  formData: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  const { userId } = await requireAdmin("admin");
  const kindRaw = String(formData.get("kind") ?? "announcement");
  const kind = ["announcement", "news", "result", "update"].includes(kindRaw) ? kindRaw : "announcement";
  const title = String(formData.get("title") ?? "").trim() || null;
  const body = String(formData.get("body") ?? "").trim();
  const sportRaw = String(formData.get("sport_key") ?? "");
  const sport_key = SPORT_KEYS.includes(sportRaw) ? sportRaw : null;
  const link_url = String(formData.get("link_url") ?? "").trim() || null;
  const link_label = String(formData.get("link_label") ?? "").trim() || null;
  if (!body) return { error: "Write something to publish." };

  const admin = createAdminClient();
  const { data: inserted, error } = await admin
    .from("feed_items")
    .insert({ kind, title, body, sport_key, link_url, link_label, created_by: userId, published_at: new Date().toISOString() })
    .select("id")
    .single();
  if (error || !inserted) {
    console.error("[feed] publish failed", error?.code, error?.message);
    return { error: `Couldn't publish${error?.code ? ` (${error.code})` : ""}.` };
  }
  await logAdminAction(userId, `feed:create:${kind}`, null, `${title ?? "(untitled)"} · #${inserted.id.slice(0, 8)}`, inserted.id);
  revalidatePath("/admin/updates");
  revalidatePath("/feed");
  return { ok: true };
}

export async function deleteFeedItem(formData: FormData) {
  const { userId } = await requireAdmin("admin");
  const id = String(formData.get("id"));
  const admin = createAdminClient();
  await admin.from("feed_items").delete().eq("id", id);
  await logAdminAction(userId, "feed:delete", null, id);
  revalidatePath("/admin/updates");
  revalidatePath("/feed");
}

/* ---------------- Code management (invite + investor) ---------------- */

export type GenerateCodesState = {
  ok?: boolean;
  error?: string;
  codeType?: "invite" | "investor";
  codes?: string[];
};

export async function generateCodes(
  _prev: GenerateCodesState,
  formData: FormData,
): Promise<GenerateCodesState> {
  const { userId } = await requireAdmin("admin");
  const codeType = String(formData.get("codeType")) === "investor" ? "investor" : "invite";
  let count = parseInt(String(formData.get("count") ?? ""), 10);
  if (!Number.isFinite(count) || count < 1) count = 1;
  count = Math.min(count, 200); // safety cap
  const note = String(formData.get("note") ?? "").trim() || null;

  const admin = createAdminClient();
  let raw: unknown = [];
  if (codeType === "investor") {
    const { data, error } = await admin.rpc("generate_investor_codes", { p_count: count, p_note: note });
    if (error) return { error: "Could not generate investor codes. Try again.", codeType };
    raw = data;
  } else {
    let maxUses = parseInt(String(formData.get("maxUses") ?? ""), 10);
    if (!Number.isFinite(maxUses) || maxUses < 1) maxUses = 1;
    const { data, error } = await admin.rpc("generate_invite_codes", {
      p_count: count,
      p_max_uses: maxUses,
      p_note: note,
    });
    if (error) return { error: "Could not generate invite codes. Try again.", codeType };
    raw = data;
  }

  // setof text comes back as string[]; tolerate the {column: value}[] shape too.
  const codes = ((raw as unknown[]) ?? [])
    .map((r) => (typeof r === "string" ? r : String(Object.values(r as Record<string, unknown>)[0] ?? "")))
    .filter(Boolean);

  await logAdminAction(userId, `codes:generate:${codeType}`, null, `${codes.length} code(s)`);
  revalidatePath("/admin/codes");
  return { ok: true, codeType, codes };
}

export async function setInviteCodeActive(formData: FormData) {
  const { userId } = await requireAdmin("admin");
  const code = String(formData.get("code"));
  const active = String(formData.get("active")) === "true";
  const admin = createAdminClient();
  await admin.from("invite_codes").update({ active }).eq("code", code);
  await logAdminAction(userId, `invite:${active ? "enable" : "disable"}`, null, undefined, code);
  revalidatePath("/admin/codes");
}

export async function deleteInviteCode(formData: FormData) {
  const { userId } = await requireAdmin("superadmin");
  const code = String(formData.get("code"));
  const admin = createAdminClient();
  await admin.from("invite_codes").delete().eq("code", code);
  await logAdminAction(userId, "invite:delete", null, undefined, code);
  revalidatePath("/admin/codes");
}

export async function setInvestorCodeActive(formData: FormData) {
  const { userId } = await requireAdmin("admin");
  const code = String(formData.get("code"));
  const active = String(formData.get("active")) === "true";
  const admin = createAdminClient();
  await admin.from("investor_codes").update({ active }).eq("code", code);
  await logAdminAction(userId, `investor:${active ? "enable" : "disable"}`, null, undefined, code);
  revalidatePath("/admin/codes");
}

export async function deleteInvestorCode(formData: FormData) {
  const { userId } = await requireAdmin("superadmin");
  const code = String(formData.get("code"));
  const admin = createAdminClient();
  await admin.from("investor_codes").delete().eq("code", code);
  await logAdminAction(userId, "investor:delete", null, undefined, code);
  revalidatePath("/admin/codes");
}

/* ---------------- Account lifecycle: archive → recover → purge (superadmin) ---------------- */

/**
 * Soft-delete. The account is hidden and a 30-day clock starts; a nightly
 * pg_cron job hard-deletes anything past 30 days (cascading through all owned
 * data). Recoverable until then. An `archived` flag is mirrored into auth
 * metadata so middleware can block the account immediately. Guarded: superadmin
 * only, never self, never another staff account (strip the admin role first).
 */
export async function archiveUser(formData: FormData) {
  const { userId } = await requireAdmin("superadmin");
  const target = String(formData.get("userId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!target || target === userId) redirect(`/admin/users/${target}`);
  if (!reason) redirect(`/admin/users/${target}`); // reason is required (client also enforces)

  const admin = createAdminClient();
  const { data: staff } = await admin.from("admin_users").select("role").eq("user_id", target).maybeSingle();
  if (staff) redirect(`/admin/users/${target}`);

  const { data: prof } = await admin.from("profiles").select("display_name").eq("id", target).single();
  const { data: authData } = await admin.auth.admin.getUserById(target);
  const email = authData?.user?.email ?? "unknown email";

  await admin
    .from("profiles")
    .update({ account_status: "archived", archived_at: new Date().toISOString() })
    .eq("id", target);
  // Ban the auth user so existing sessions are rejected and they can't sign back
  // in while archived (~100 years; cleared on recover). Cleaner than session juggling.
  await admin.auth.admin.updateUserById(target, { ban_duration: "876000h" });
  await logAdminAction(userId, "user:delete", target, `${prof?.display_name ?? "user"} · ${email} · reason: ${reason}`);
  revalidatePath("/admin/users");
  revalidatePath("/admin/users/archived");
  revalidatePath("/admin");
  redirect("/admin/users/archived");
}

/** Restore an archived account before the 30-day purge. */
export async function recoverUser(formData: FormData) {
  const { userId } = await requireAdmin("superadmin");
  const target = String(formData.get("userId") ?? "");
  if (!target) redirect("/admin/users/archived");

  const admin = createAdminClient();
  const { data: prof } = await admin.from("profiles").select("display_name").eq("id", target).single();
  await admin.from("profiles").update({ account_status: "active", archived_at: null }).eq("id", target);
  await admin.auth.admin.updateUserById(target, { ban_duration: "none" });
  await logAdminAction(userId, "user:recover", target, `recovered ${prof?.display_name ?? "user"}`);
  revalidatePath("/admin/users");
  revalidatePath("/admin/users/archived");
  revalidatePath(`/admin/users/${target}`);
  redirect(`/admin/users/${target}`);
}

/**
 * Delete an archived account now, without waiting out the 30 days — for clearing
 * test accounts. Same cascade as the scheduled purge. The audit log survives
 * (its target is set null on cascade, so the durable record lives in detail).
 */
export async function purgeUserNow(formData: FormData) {
  const { userId } = await requireAdmin("superadmin");
  const target = String(formData.get("userId") ?? "");
  if (!target || target === userId) redirect("/admin/users/archived");

  const admin = createAdminClient();
  const { data: staff } = await admin.from("admin_users").select("role").eq("user_id", target).maybeSingle();
  if (staff) redirect("/admin/users/archived");

  const { data: prof } = await admin.from("profiles").select("display_name, avatar_path").eq("id", target).single();
  if (prof?.avatar_path) await admin.storage.from("avatars").remove([prof.avatar_path]);

  const { error } = await admin.auth.admin.deleteUser(target);
  if (error) {
    revalidatePath("/admin/users/archived");
    redirect("/admin/users/archived");
  }
  await logAdminAction(userId, "user:purge", null, `purged ${prof?.display_name ?? "user"} (${target})`, target);
  revalidatePath("/admin/users/archived");
  revalidatePath("/admin");
  redirect("/admin/users/archived");
}
