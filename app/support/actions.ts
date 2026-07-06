"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/ratelimit";
import { emailSupportInbox, emitTicketWebhook, notifySupportAdmins, ticketRef, type Requester, type TicketSnapshot } from "@/lib/support-events";

export type SupportState = { ok?: boolean; error?: string } | undefined;

const CATEGORIES = ["question", "bug", "account", "safety", "feedback", "other"];

/** Files a support ticket and dispatches it through the integration seam
 *  (lib/support-events): inbox email with reply-to = member, in-app admin
 *  notifications, and the signed webhook if configured. The sender's email is
 *  taken from the authenticated session (never trusted from the form). */
export async function sendSupportMessage(_prev: SupportState, formData: FormData): Promise<SupportState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in first." };

  // Throttle to curb spam/abuse of the outbound mailer.
  const allowed = await rateLimit(`support:${user.id}`, 5, 600); // 5 / 10 min
  if (!allowed) return { error: "You've sent several messages just now — please wait a few minutes before sending another." };

  const categoryRaw = String(formData.get("category") ?? "question");
  const category = CATEGORIES.includes(categoryRaw) ? categoryRaw : "other";
  const subject = String(formData.get("subject") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  if (!subject || subject.length < 3) return { error: "Add a short subject." };
  if (!message || message.length < 10) return { error: "Tell us a little more so we can help." };

  const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  const requester: Requester = {
    external_id: user.id,
    email: user.email ?? null,
    name: profile?.display_name || "A Klimr member",
  };

  // The ticket record comes first: it's what the member tracks on /support and
  // what any future helpdesk sync reads from.
  const admin = createAdminClient();
  const severity = category === "safety" ? "urgent" : "normal";
  let ticket: TicketSnapshot | null = null;
  try {
    const { data, error } = await admin
      .from("support_tickets")
      .insert({ user_id: user.id, source: "form", category, severity, subject, body: message })
      .select("id, source, category, severity, status, subject, body, ai_summary, conversation_id, created_at, updated_at")
      .single();
    if (error) console.error("[support] ticket insert failed", error);
    ticket = data ?? null;
  } catch (e) {
    console.error("[support] ticket insert threw", e);
  }

  // Email is the redundant, can't-miss channel (and the universal helpdesk
  // ingestion path). Best-effort once a ticket exists; the only hard failure is
  // when NEITHER the ticket nor the email got through.
  const emailed = await emailSupportInbox({
    ticket:
      ticket ??
      ({
        id: "00000000-unrecorded",
        source: "form",
        category,
        severity,
        status: "open",
        subject,
        created_at: new Date().toISOString(),
      } as TicketSnapshot),
    requester,
    text: message,
  });
  if (!ticket && !emailed) {
    return { error: "We couldn't send that just now. Please email support@klimr.com directly." };
  }

  if (ticket) {
    await notifySupportAdmins(
      severity === "urgent" ? "\u{1F6A8} Urgent support request" : "New support request",
      `[${ticketRef(ticket.id)}] ${subject}`,
    );
    await emitTicketWebhook("ticket.created", ticket, requester);
  }

  return { ok: true };
}
