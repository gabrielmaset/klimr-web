"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin";
import { sendEmail } from "@/lib/email";

const AUDIENCES = ["all", "organizers", "tournament_directors", "providers"] as const;
type Audience = (typeof AUDIENCES)[number];

function renderHtml(subject: string, body: string): string {
  const paras = body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;font-size:14px;line-height:1.65;color:#3f3a30;">${p.replace(/\n/g, "<br/>").replace(/</g, "&lt;").replace(/&lt;br\/>/g, "<br/>")}</p>`)
    .join("");
  return `<div style="background:#F7F3EA;padding:28px 16px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#FFFDF8;border:1px solid #E7DFC9;border-radius:16px;padding:26px 26px 20px;">
    <p style="margin:0 0 18px;font-size:19px;font-weight:800;color:#201B12;">klimr<span style="color:#E23E0D;">.</span></p>
    <p style="margin:0 0 14px;font-size:16px;font-weight:700;color:#201B12;">${subject.replace(/</g, "&lt;")}</p>
    ${paras}
    <p style="margin:18px 0 0;border-top:1px solid #EFE8D6;padding-top:12px;font-size:11px;line-height:1.6;color:#8a8272;">
      You're receiving this service announcement because you have a Klimr account.<br/>© Klimr · Los Angeles
    </p>
  </div>
</div>`;
}

/** Admin broadcast: resolves the audience (profile filter ∩ auth emails via
 *  paginated listUsers — an explicit, bounded admin job, not a hot path),
 *  sends through the existing Resend helper, and records an audit row. */
export async function sendBroadcast(formData: FormData) {
  const supabase = await createClient();
  const admin = createAdminClient();
  await requireAdmin("admin");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not authorized." };

  const subject = String(formData.get("subject") ?? "").trim().slice(0, 140);
  const body = String(formData.get("body") ?? "").trim().slice(0, 8000);
  const audience = (AUDIENCES.includes(formData.get("audience") as Audience) ? formData.get("audience") : "all") as Audience;
  const confirm = String(formData.get("confirm") ?? "").trim();
  if (!subject || !body) return { ok: false as const, error: "Subject and message are both required." };
  if (confirm !== "SEND") return { ok: false as const, error: 'Type SEND in the confirmation box to broadcast.' };

  let allowed: Set<string> | null = null;
  if (audience !== "all") {
    const { data: provs } = await admin.from("class_providers").select("user_id, roles, status").eq("status", "approved");
    const ids = (provs ?? [])
      .filter((p) => {
        const roles: string[] = Array.isArray(p.roles) ? p.roles : [];
        if (audience === "organizers") return roles.includes("organizer");
        if (audience === "tournament_directors") return roles.includes("tournament_director");
        return roles.some((r) => r !== "organizer" && r !== "tournament_director");
      })
      .map((p) => p.user_id);
    allowed = new Set(ids);
    if (allowed.size === 0) return { ok: false as const, error: "That audience has no members yet." };
  }

  const recipients: string[] = [];
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return { ok: false as const, error: `Couldn't list users: ${error.message}` };
    for (const u of data.users) {
      if (!u.email) continue;
      if (u.email.endsWith("@klimr.test")) continue; // seed accounts
      if (allowed && !allowed.has(u.id)) continue;
      recipients.push(u.email);
    }
    if (data.users.length < 200) break;
    page += 1;
    if (page > 200) break; // hard safety ceiling
  }
  if (recipients.length === 0) return { ok: false as const, error: "No recipients matched." };

  const html = renderHtml(subject, body);
  let sent = 0;
  for (const to of recipients) {
    const ok = await sendEmail({ to, subject, html });
    if (ok) sent += 1;
  }

  await admin.from("broadcasts").insert({
    subject,
    body,
    audience: { audience },
    recipient_count: sent,
    sent_by: user.id,
  });
  revalidatePath("/admin/broadcast");
  return { ok: true as const, sent, matched: recipients.length };
}

export async function sendBroadcastState(_prev: unknown, formData: FormData) {
  return sendBroadcast(formData);
}
