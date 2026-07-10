"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notify";
import { requireAdmin, logAdminAction } from "@/lib/admin";
import { SPORT_KEYS } from "@/lib/sports";

export async function resolveReport(formData: FormData) {
  const { userId } = await requireAdmin("support");
  const reportId = String(formData.get("reportId"));
  const statusRaw = String(formData.get("status"));
  const status = ["reviewing", "actioned", "dismissed", "open"].includes(statusRaw) ? statusRaw : "reviewing";
  const resolution = String(formData.get("resolution") ?? "").trim() || null;

  const admin = createAdminClient();
  const { data: rep } = await admin.from("reports").select("reporter_id").eq("id", reportId).maybeSingle();
  await admin
    .from("reports")
    .update({ status, resolution, reviewed_by: userId, reviewed_at: new Date().toISOString() })
    .eq("id", reportId);
  await logAdminAction(userId, `report:${status}`, null, resolution ?? undefined, reportId);
  if (rep?.reporter_id && (status === "actioned" || status === "dismissed")) {
    await createNotification({
      userId: rep.reporter_id,
      kind: "system",
      title: status === "actioned" ? "Your report led to action \u2014 thank you" : "Your report was reviewed",
      body: status === "actioned" ? "We looked into it and took action." : "We looked into it; no action was needed this time.",
    });
  }
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
  await createNotification({
    userId: target,
    kind: "system",
    title: value === "verified" ? "Your identity is verified \u2713" : "Your verification status changed",
    body: value === "verified" ? "The verified badge now shows on your profile." : `Status: ${value}. Contact support if this looks wrong.`,
    linkUrl: "/me",
  });
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

/** ----- tournament moderation (Trust & Safety) ----- */

/** Suspend a tournament for review: hides its public page; the organizer keeps
 *  workspace access and sees a banner. Reversible via restoreTournament. */
export async function suspendTournament(formData: FormData) {
  const { userId } = await requireAdmin("support");
  const id = String(formData.get("tournamentId"));
  const reason = String(formData.get("reason") ?? "").trim() || null;
  const admin = createAdminClient();
  await admin.from("tournaments").update({ suspended_at: new Date().toISOString(), suspended_by: userId, suspended_reason: reason }).eq("id", id);
  await logAdminAction(userId, "tournament:suspended", null, reason ?? undefined, id);
  revalidatePath("/admin/tournaments");
  revalidatePath("/admin");
}

/** Lift a suspension — the event returns to exactly its prior state. */
export async function restoreTournament(formData: FormData) {
  const { userId } = await requireAdmin("support");
  const id = String(formData.get("tournamentId"));
  const admin = createAdminClient();
  await admin.from("tournaments").update({ suspended_at: null, suspended_by: null, suspended_reason: null }).eq("id", id);
  await logAdminAction(userId, "tournament:restored", null, undefined, id);
  revalidatePath("/admin/tournaments");
  revalidatePath("/admin");
}

/** Permanently delete a tournament (cascades to registrations, divisions, etc.).
 *  Higher bar than a suspension. */
export async function adminDeleteTournament(formData: FormData) {
  const { userId } = await requireAdmin("admin");
  const id = String(formData.get("tournamentId"));
  const admin = createAdminClient();
  await admin.from("tournaments").delete().eq("id", id);
  await logAdminAction(userId, "tournament:deleted", null, undefined, id);
  revalidatePath("/admin/tournaments");
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
    .insert({ kind, title, body, sport_key, link_url, link_label, created_by: userId })
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
  emailedTo?: string;
  emailWarning?: string;
};

export async function generateCodes(
  _prev: GenerateCodesState,
  formData: FormData,
): Promise<GenerateCodesState> {
  const { userId } = await requireAdmin("admin");
  const codeType = String(formData.get("codeType")) === "investor" ? "investor" : "invite";

  // Optional: email the code to one recipient. When set, exactly one code is minted.
  const emailRaw = String(formData.get("email") ?? "").trim();
  const email = emailRaw || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Enter a valid email address, or leave it blank.", codeType };
  }

  let count = parseInt(String(formData.get("count") ?? ""), 10);
  if (!Number.isFinite(count) || count < 1) count = 1;
  count = Math.min(count, 200); // safety cap
  if (email) count = 1; // emailing a code mints exactly one
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

  // If an email was provided, attach it to the (single) code and send it.
  let emailedTo: string | undefined;
  let emailWarning: string | undefined;
  if (email && codes.length === 1) {
    const code = codes[0];
    const table = codeType === "investor" ? "investor_codes" : "invite_codes";
    const { error: updErr } = await admin.from(table).update({ sent_to_email: email }).eq("code", code);
    if (updErr) console.error("[codes] could not attach email to code", updErr.code, updErr.message);

    const origin = (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://klimr.com";
    const sent = await sendAccessCodeEmail(email, code, codeType, origin || "https://klimr.com");
    if (sent) emailedTo = email;
    else emailWarning = "The code was created but the email didn't send — copy it below and share it manually.";
  }

  await logAdminAction(
    userId,
    `codes:generate:${codeType}`,
    null,
    `${codes.length} code(s)${emailedTo ? ` · emailed to ${emailedTo}` : ""}`,
  );
  revalidatePath("/admin/codes");
  return { ok: true, codeType, codes, emailedTo, emailWarning };
}

/** Email a single access code to a recipient via Resend. Returns success. */
async function sendAccessCodeEmail(
  to: string,
  code: string,
  codeType: "invite" | "investor",
  origin: string,
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[codes] RESEND_API_KEY is not set");
    return false;
  }

  const isInvestor = codeType === "investor";
  const link = isInvestor ? `${origin}/gate` : `${origin}/signup?code=${encodeURIComponent(code)}`;
  const subject = isInvestor ? "Your Klimr investor preview code" : "You're invited to Klimr";
  const lead = isInvestor
    ? "Here's your access code for the Klimr investor preview."
    : "You've been invited to Klimr — the ranked ladder for racquet sports. Use the code below to claim your spot.";
  const cta = isInvestor ? "Open the preview" : "Join Klimr";

  const text = [
    lead,
    "",
    `Access code: ${code}`,
    "",
    `${cta}: ${link}`,
    "",
    "If you didn't expect this, you can ignore this email.",
    "— Klimr",
  ].join("\n");

  const html = `<!doctype html><html><body style="margin:0;background:#fafafa;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0a0a0b">
  <div style="max-width:480px;margin:0 auto;padding:32px 24px">
    <div style="font-weight:800;font-size:20px;letter-spacing:-.01em">Klimr</div>
    <p style="margin:20px 0 0;font-size:15px;line-height:1.6;color:#3f3f46">${lead}</p>
    <div style="margin:24px 0;padding:18px;border:1px solid #e4e4e7;border-radius:14px;background:#fff;text-align:center">
      <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#a1a1aa">Access code</div>
      <div style="margin-top:6px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:24px;font-weight:700;letter-spacing:.06em;color:#0a0a0b">${code}</div>
    </div>
    <a href="${link}" style="display:inline-block;background:#0a0a0b;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 20px;border-radius:9999px">${cta}</a>
    <p style="margin:28px 0 0;font-size:12px;line-height:1.6;color:#a1a1aa">If you didn't expect this, you can ignore this email.</p>
  </div></body></html>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Klimr <invites@notifications.klimr.com>",
        to: [to],
        subject,
        text,
        html,
      }),
    });
    if (!res.ok) {
      console.error("[codes] resend failed", res.status, await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error("[codes] resend threw", e);
    return false;
  }
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

  const { data: prof } = await admin.from("profiles").select("display_name, avatar_path, member_no, created_at, archived_at").eq("id", target).single();
  if (prof?.avatar_path) await admin.storage.from("avatars").remove([prof.avatar_path]);

  // The durable identity record survives the purge (CCPA security/fraud/debug
  // exemptions) — written BEFORE deletion so nothing is ever lost to a race.
  const { data: au } = await admin.auth.admin.getUserById(target);
  await admin.from("deleted_users_ledger").upsert(
    {
      user_id: target,
      member_no: prof?.member_no ?? null,
      display_name: prof?.display_name ?? null,
      email: au?.user?.email ?? null,
      account_created_at: prof?.created_at ?? null,
      archived_at: prof?.archived_at ?? null,
      purged_by: userId,
      reason: "admin_purge",
    },
    { onConflict: "user_id" },
  );

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

/** Approve or revoke a class provider (coach). Only approved providers can create classes. */
export async function setClassProvider(formData: FormData) {
  const { userId } = await requireAdmin("admin");
  const target = String(formData.get("userId") ?? "").trim();
  const action = String(formData.get("action") ?? "");
  if (!target) return;

  const admin = createAdminClient();
  if (action === "revoke") {
    await admin.from("class_providers").update({ status: "revoked" }).eq("user_id", target);
    await logAdminAction(userId, "provider:revoke", target);
  } else {
    const headline = String(formData.get("headline") ?? "").trim() || null;
    await admin
      .from("class_providers")
      .upsert(
        { user_id: target, status: "approved", headline, approved_by: userId, approved_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
    await logAdminAction(userId, "provider:approve", target, headline ?? undefined);
  }
  revalidatePath("/admin/providers");
}

/** Approve or reject a professional-status application. Approving grants the role
 *  (and class-creation ability) by upserting the user's class_providers record. */
export async function reviewProviderApplication(formData: FormData) {
  const { userId } = await requireAdmin("admin");
  const appId = String(formData.get("appId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const note = String(formData.get("review_note") ?? "").trim() || null;
  if (!appId || !["approve", "reject"].includes(decision)) return;

  const admin = createAdminClient();
  const { data: app } = await admin
    .from("provider_applications")
    .select("id, user_id, role, headline")
    .eq("id", appId)
    .maybeSingle();
  if (!app) return;

  if (decision === "approve") {
    const { data: existing } = await admin.from("class_providers").select("roles").eq("user_id", app.user_id).maybeSingle();
    const roles = new Set<string>(existing?.roles ?? []);
    roles.add(app.role);
    await admin.from("class_providers").upsert(
      {
        user_id: app.user_id,
        status: "approved",
        roles: [...roles],
        approved_by: userId,
        approved_at: new Date().toISOString(),
        ...(app.headline ? { headline: app.headline } : {}),
      },
      { onConflict: "user_id" },
    );
    await admin
      .from("provider_applications")
      .update({ status: "approved", review_note: note, reviewed_by: userId, reviewed_at: new Date().toISOString() })
      .eq("id", appId);
    await logAdminAction(userId, `provider_app:approve:${app.role}`, app.user_id, note ?? undefined, appId);
    await createNotification({
      userId: app.user_id,
      kind: "system",
      title: "Professional status approved \u2713",
      body: `You're approved as ${app.role}. You can now publish classes and coaching.`,
      linkUrl: "/settings/professional",
    });
  } else {
    await admin
      .from("provider_applications")
      .update({ status: "rejected", review_note: note, reviewed_by: userId, reviewed_at: new Date().toISOString() })
      .eq("id", appId);
    await logAdminAction(userId, `provider_app:reject:${app.role}`, app.user_id, note ?? undefined, appId);
    await createNotification({
      userId: app.user_id,
      kind: "system",
      title: "Professional status \u2014 not approved this time",
      body: note ? `Reviewer note: ${note}` : "You can update your details and apply again.",
      linkUrl: "/settings/professional",
    });
  }
  revalidatePath("/admin/providers");
}
