"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notify";
import { emitTicketWebhook, getRequester } from "@/lib/support-events";

const STATUSES = ["open", "in_progress", "resolved", "closed"];

/** Move a ticket through its lifecycle. Resolving notifies the member in-app. */
export async function setTicketStatus(formData: FormData): Promise<void> {
  await requireAdmin("support");
  const ticketId = String(formData.get("ticketId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!ticketId || !STATUSES.includes(status)) return;

  const admin = createAdminClient();
  const { data: ticket } = await admin
    .from("support_tickets")
    .update({
      status,
      updated_at: new Date().toISOString(),
      resolved_at: status === "resolved" || status === "closed" ? new Date().toISOString() : null,
    })
    .eq("id", ticketId)
    .select("id, user_id, source, category, severity, status, subject, body, ai_summary, conversation_id, created_at, updated_at")
    .single();

  if (ticket) {
    if (status === "resolved") {
      await createNotification({
        userId: ticket.user_id,
        kind: "system",
        title: "Your support request was resolved",
        body: ticket.subject,
        linkUrl: "/support",
      });
    }
    // Keep any connected helpdesk/automation in sync with the lifecycle.
    const requester = await getRequester(ticket.user_id);
    await emitTicketWebhook("ticket.status_changed", ticket, requester);
  }

  revalidatePath("/admin/support");
  revalidatePath(`/admin/support/${ticketId}`);
}

/** Save a private admin note on the ticket. */
export async function saveTicketNote(formData: FormData): Promise<void> {
  await requireAdmin("support");
  const ticketId = String(formData.get("ticketId") ?? "");
  const note = String(formData.get("note") ?? "").slice(0, 2000);
  if (!ticketId) return;
  const admin = createAdminClient();
  await admin.from("support_tickets").update({ admin_note: note || null, updated_at: new Date().toISOString() }).eq("id", ticketId);
  revalidatePath(`/admin/support/${ticketId}`);
}
