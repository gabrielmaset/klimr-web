"use server";

import { revalidatePath } from "next/cache";
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

export async function createFeedItem(formData: FormData) {
  const { userId } = await requireAdmin("admin");
  const kindRaw = String(formData.get("kind") ?? "announcement");
  const kind = ["announcement", "news", "result", "update"].includes(kindRaw) ? kindRaw : "announcement";
  const title = String(formData.get("title") ?? "").trim() || null;
  const body = String(formData.get("body") ?? "").trim();
  const sportRaw = String(formData.get("sport_key") ?? "");
  const sport_key = SPORT_KEYS.includes(sportRaw) ? sportRaw : null;
  const link_url = String(formData.get("link_url") ?? "").trim() || null;
  const link_label = String(formData.get("link_label") ?? "").trim() || null;
  if (!body) return;

  const admin = createAdminClient();
  await admin.from("feed_items").insert({ kind, title, body, sport_key, link_url, link_label, created_by: userId });
  await logAdminAction(userId, `feed:create:${kind}`, null, title ?? undefined);
  revalidatePath("/admin/updates");
  revalidatePath("/feed");
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
