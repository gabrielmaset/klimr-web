"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getRequester, emailSupportInbox, emitTicketWebhook, notifySupportAdmins, type TicketSnapshot } from "@/lib/support-events";
import { LISTING_LIFESPAN_DAYS } from "@/lib/marketplace";
import { createNotification } from "@/lib/notify";
export async function toggleSave(formData: FormData) {
  const listingId = String(formData.get("listing_id") ?? formData.get("listingId") ?? "");
  if (!listingId) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/marketplace/${listingId}`);

  const { data: existing } = await supabase
    .from("saved_listings")
    .select("listing_id")
    .eq("user_id", user.id)
    .eq("listing_id", listingId)
    .maybeSingle();

  if (existing) {
    await supabase.from("saved_listings").delete().eq("user_id", user.id).eq("listing_id", listingId);
  } else {
    await supabase.from("saved_listings").insert({ user_id: user.id, listing_id: listingId });
  }
  revalidatePath("/marketplace");
  revalidatePath(`/marketplace/${listingId}`);
}

/* ── Second Serve: owner status transitions + report seam ─────────────── */


type StatusAction = "activate" | "pending" | "sold" | "relist" | "unpublish";

/** Owner-guarded lifecycle transitions. Relist renews the 30-day clock. */
export async function setListingStatus(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const id = String(formData.get("listing_id") || "");
  const action = String(formData.get("status_action") || "") as StatusAction;
  if (!id || !["activate", "pending", "sold", "relist", "unpublish"].includes(action)) return;

  const { data: l } = await supabase
    .from("marketplace_listings")
    .select("id, listed_by, status")
    .eq("id", id)
    .maybeSingle();
  if (!l || l.listed_by !== user.id) return;

  const nowIso = new Date().toISOString();
  const patch =
    action === "sold"
      ? { status: "sold", sold_at: nowIso }
      : action === "pending"
        ? { status: "pending" }
        : action === "unpublish"
          ? { status: "draft" }
          : action === "relist"
            ? {
                status: "active",
                sold_at: null,
                renewed_at: nowIso,
                expires_at: new Date(Date.now() + LISTING_LIFESPAN_DAYS * 86400000).toISOString(),
              }
            : { status: "active", sold_at: null };

  await supabase.from("marketplace_listings").update(patch).eq("id", id);

  // Closing the listing kills open offers — and their buyers hear about it.
  if (action === "sold" || action === "unpublish") {
    const { data: openOffers } = await supabase
      .from("listing_offers")
      .select("id, buyer_id")
      .eq("listing_id", id)
      .eq("status", "open");
    if (openOffers?.length) {
      await supabase
        .from("listing_offers")
        .update({ status: "expired", decided_at: nowIso })
        .eq("listing_id", id)
        .eq("status", "open");
      const { data: lRow } = await supabase.from("marketplace_listings").select("title").eq("id", id).maybeSingle();
      const { data: convs } = await supabase.from("conversations").select("id, created_by").eq("listing_id", id);
      const convByBuyer = new Map((convs ?? []).map((c) => [c.created_by, c.id]));
      for (const o of openOffers) {
        await createNotification({
          userId: o.buyer_id,
          kind: "system",
          title: action === "sold" ? `Sold — ${lRow?.title ?? "a listing"}` : `Listing removed — ${lRow?.title ?? "a listing"}`,
          body: "Your open offer was closed with it.",
          linkUrl: convByBuyer.get(o.buyer_id) ? `/marketplace/messages/${convByBuyer.get(o.buyer_id)}` : `/marketplace/${id}`,
        });
      }
    }
  }

  // D3: listing threads live 30 days past close, and revive on relist.
  if (action === "sold" || action === "unpublish") {
    await supabase
      .from("conversations")
      .update({ expires_at: new Date(Date.now() + 30 * 86400000).toISOString() })
      .eq("listing_id", id)
      .is("expires_at", null);
  } else if (action === "relist" || action === "activate") {
    await supabase.from("conversations").update({ expires_at: null }).eq("listing_id", id);
  }

  revalidatePath("/marketplace");
  revalidatePath(`/marketplace/${id}`);
}

/** Report a listing: recorded, then flows the standard support seam
 *  (ticket + inbox email + webhook + admin fan-out) — no new admin UI. */
export async function reportListing(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const id = String(formData.get("listing_id") || "");
  const reason = String(formData.get("reason") || "").trim().slice(0, 600);
  if (!id || reason.length < 3) return;

  const { data: l } = await supabase
    .from("marketplace_listings")
    .select("id, title, listed_by")
    .eq("id", id)
    .maybeSingle();
  if (!l) return;

  await supabase.from("listing_reports").insert({ listing_id: id, reporter_id: user.id, reason });

  const admin = createAdminClient();
  const subject = `Listing report: ${l.title}`.slice(0, 140);
  const body = `Listing: /marketplace/${id}\nSeller: ${l.listed_by ?? "unknown"}\nReporter: ${user.id}\n\nReason:\n${reason}`;
  let ticket: TicketSnapshot | null = null;
  try {
    const { data } = await admin
      .from("support_tickets")
      .insert({ user_id: user.id, source: "form", category: "marketplace", severity: "normal", subject, body })
      .select("id, source, category, severity, status, subject, body, ai_summary, conversation_id, created_at, updated_at")
      .single();
    ticket = data ?? null;
  } catch (e) {
    console.error("[marketplace] report ticket insert failed", e);
  }
  const requester = await getRequester(user.id);
  if (ticket) {
    await emailSupportInbox({ ticket, requester, text: body });
    await emitTicketWebhook("ticket.created", ticket, requester);
    await notifySupportAdmins("Marketplace listing reported", subject);
  }
  await createNotification({
    userId: user.id,
    kind: "system",
    title: "Report received — thanks",
    body: "We\u2019re reviewing that listing.",
    linkUrl: `/marketplace/${id}`,
  });
  revalidatePath(`/marketplace/${id}`);
}
