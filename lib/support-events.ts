import "server-only";
import { createHmac } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notify";
import { sendEmail } from "@/lib/email";

// The single seam between Klimr's support system and the outside world.
// Every ticket event — from the contact form, the AI assistant, or an admin —
// flows through here, which keeps the site integration-ready by design:
//
//  1) EMAIL INGESTION (universal): every new ticket produces one email to
//     support@klimr.com with reply-to set to the member and a stable
//     "[Klimr #ref]" token in the subject. Point that mailbox's forwarding at
//     Zendesk/Zoho/Intercom/Salesforce's inbound address and tickets flow into
//     any helpdesk with zero code — replies from agents reach the member
//     directly, and the ref token keeps threads correlated.
//
//  2) SIGNED WEBHOOK (automation): if SUPPORT_WEBHOOK_URL is set, a versioned
//     JSON payload is POSTed on every event, HMAC-SHA256-signed with
//     SUPPORT_WEBHOOK_SECRET (Stripe-style "t.body" signing). That's the shape
//     Zapier/Make/n8n and vendor inbound-webhook triggers expect.
//
//  3) VENDOR ADAPTERS (later): direct API pushes (Zendesk Tickets API, Intercom
//     Conversations, Salesforce Cases) get added HERE as adapters — call sites
//     never change. support_tickets.external_ref (migration 0097) is reserved
//     for storing the vendor's ticket id when two-way sync arrives.

export type TicketEventName = "ticket.created" | "ticket.status_changed";

export type TicketSnapshot = {
  id: string;
  source: string;
  category: string;
  severity: string;
  status: string;
  subject: string;
  body?: string | null;
  ai_summary?: string | null;
  conversation_id?: string | null;
  external_ref?: string | null;
  created_at: string;
  updated_at?: string | null;
};

export type Requester = { external_id: string; email: string | null; name: string };

const SITE_URL = "https://klimr.com";

/** Short, human-pasteable ticket reference, stable for the ticket's life. */
export function ticketRef(id: string): string {
  return `Klimr #${id.slice(0, 8)}`;
}

/** The canonical contact shape helpdesks key on: stable external id + email + name. */
export async function getRequester(userId: string): Promise<Requester> {
  const admin = createAdminClient();
  const [{ data: profile }, { data: authUser }] = await Promise.all([
    admin.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
    admin.auth.admin.getUserById(userId),
  ]);
  return {
    external_id: userId,
    email: authUser?.user?.email ?? null,
    name: profile?.display_name ?? "Klimr member",
  };
}

/** In-app fan-out to every administrator. Best-effort, never throws. */
export async function notifySupportAdmins(title: string, body: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: admins } = await admin.from("admin_users").select("user_id");
    await Promise.all(
      (admins ?? []).map((a) => createNotification({ userId: a.user_id, kind: "system", title, body, linkUrl: "/admin/support" })),
    );
  } catch (e) {
    console.error("[support-events] admin fan-out failed", e);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** One email per new ticket into the shared inbox — the universal helpdesk
 *  ingestion path. Reply-to is the member so agent replies reach them directly. */
export async function emailSupportInbox(input: {
  ticket: TicketSnapshot;
  requester: Requester;
  text: string;
}): Promise<boolean> {
  const { ticket, requester, text } = input;
  const urgent = ticket.severity === "urgent";
  const subject = `[${ticketRef(ticket.id)}]${urgent ? " \u{1F6A8}" : ""} ${ticket.subject}`;
  const meta = [
    `Ref: ${ticketRef(ticket.id)}`,
    `Source: ${ticket.source === "ai_chat" ? "AI assistant" : "contact form"} \u00b7 Category: ${ticket.category} \u00b7 Severity: ${ticket.severity}`,
    `From: ${requester.name}${requester.email ? ` <${requester.email}>` : ""} \u00b7 Member ID: ${requester.external_id}`,
    `Admin: ${SITE_URL}/admin/support/${ticket.id}`,
  ].join("\n");
  const html = `<pre style="font-family:inherit;white-space:pre-wrap;margin:0">${escapeHtml(`${meta}\n\n${text}`)}</pre>`;
  return sendEmail({
    to: "support@klimr.com",
    from: "Klimr Support <support@notifications.klimr.com>",
    replyTo: requester.email ?? undefined,
    subject,
    html,
  });
}

/** Signed webhook POST (fire-and-forget with a hard timeout; never throws).
 *  Payload is versioned so future fields never break consumers. */
export async function emitTicketWebhook(event: TicketEventName, ticket: TicketSnapshot, requester: Requester): Promise<void> {
  const url = process.env.SUPPORT_WEBHOOK_URL;
  if (!url) return;
  try {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const body = JSON.stringify({
      version: "1",
      event,
      sent_at: new Date().toISOString(),
      ticket: {
        id: ticket.id,
        ref: ticketRef(ticket.id),
        source: ticket.source,
        category: ticket.category,
        severity: ticket.severity,
        status: ticket.status,
        subject: ticket.subject,
        body: ticket.body ?? null,
        ai_summary: ticket.ai_summary ?? null,
        conversation_id: ticket.conversation_id ?? null,
        external_ref: ticket.external_ref ?? null,
        admin_url: `${SITE_URL}/admin/support/${ticket.id}`,
        created_at: ticket.created_at,
        updated_at: ticket.updated_at ?? null,
      },
      requester,
    });
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Klimr-Event": event,
      "X-Klimr-Timestamp": timestamp,
    };
    const secret = process.env.SUPPORT_WEBHOOK_SECRET;
    if (secret) {
      headers["X-Klimr-Signature"] = `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, { method: "POST", headers, body, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) console.error("[support-events] webhook non-2xx", res.status);
  } catch (e) {
    console.error("[support-events] webhook failed", e);
  }
}
