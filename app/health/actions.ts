"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notify";
import { emailSupportInbox, emitTicketWebhook, notifySupportAdmins, getRequester, type TicketSnapshot } from "@/lib/support-events";

/** "Message {pro}": open (or reuse) the direct E2E thread with a verified
 *  professional. One thread per pair (DB-unique on the canonical pair). */
export async function messagePro(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/health");

  const proId = String(formData.get("pro_id") || "");
  if (!proId || proId === user.id) redirect("/health");

  const { data: pro } = await supabase
    .from("class_providers")
    .select("user_id, status, credential_expires_at")
    .eq("user_id", proId)
    .maybeSingle();
  const live = pro?.status === "approved" && (!pro.credential_expires_at || new Date(pro.credential_expires_at).getTime() > Date.now());
  if (!live) redirect(`/health?notice=chat`);

  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("kind", "dm")
    .or(`and(created_by.eq.${user.id},peer_id.eq.${proId}),and(created_by.eq.${proId},peer_id.eq.${user.id})`)
    .maybeSingle();
  let convId = existing?.id ?? null;
  if (!convId) {
    const { data: created, error } = await supabase
      .from("conversations")
      .insert({ kind: "dm", created_by: user.id, peer_id: proId })
      .select("id")
      .single();
    if (created) convId = created.id;
    else if (error) {
      const { data: again } = await supabase
        .from("conversations")
        .select("id")
        .eq("kind", "dm")
        .or(`and(created_by.eq.${user.id},peer_id.eq.${proId}),and(created_by.eq.${proId},peer_id.eq.${user.id})`)
        .maybeSingle();
      convId = again?.id ?? null;
    }
  }
  if (!convId) redirect(`/health?pro=${proId}&notice=chat`);
  redirect(`/messages/${convId}`);
}

/** Flag a professional for admin review — flows through the support seam. */
export async function reportProvider(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const proId = String(formData.get("pro_id") || "");
  const reason = String(formData.get("reason") || "").trim().slice(0, 600);
  if (!proId || reason.length < 3) redirect(`/health?pro=${proId}&notice=report-short`);

  const { data: prof } = await supabase.from("profiles").select("display_name").eq("id", proId).maybeSingle();
  const admin = createAdminClient();
  const subject = `Provider report: ${prof?.display_name ?? proId}`.slice(0, 140);
  const body = `Provider: ${proId} (${prof?.display_name ?? "unknown"})\nReporter: ${user.id}\n\nReason:\n${reason}`;
  let ticket: TicketSnapshot | null = null;
  try {
    const { data } = await admin
      .from("support_tickets")
      .insert({ user_id: user.id, source: "form", category: "health", severity: "normal", subject, body })
      .select("id, source, category, severity, status, subject, body, ai_summary, conversation_id, created_at, updated_at")
      .single();
    ticket = data ?? null;
  } catch (e) {
    console.error("[health] provider report ticket failed", e);
  }
  const requester = await getRequester(user.id);
  if (ticket) {
    await emailSupportInbox({ ticket, requester, text: body });
    await emitTicketWebhook("ticket.created", ticket, requester);
    await notifySupportAdmins("Health provider reported", subject);
  }
  await createNotification({ userId: user.id, kind: "system", title: "Report received — thanks", body: "We\u2019re reviewing that professional profile.", linkUrl: `/health?pro=${proId}` });
  revalidatePath("/health");
  redirect(`/health?pro=${proId}&notice=reported`);
}
