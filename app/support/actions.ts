"use server";

import { createClient } from "@/lib/supabase/server";

export type SupportState = { ok?: boolean; error?: string } | undefined;

const CATEGORIES = ["question", "bug", "account", "safety", "feedback", "other"];

/** Sends a support request to support@klimr.com via Resend. The sender's email
 *  is taken from the authenticated session (never trusted from the form). */
export async function sendSupportMessage(_prev: SupportState, formData: FormData): Promise<SupportState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in first." };

  const categoryRaw = String(formData.get("category") ?? "question");
  const category = CATEGORIES.includes(categoryRaw) ? categoryRaw : "other";
  const subject = String(formData.get("subject") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  if (!subject || subject.length < 3) return { error: "Add a short subject." };
  if (!message || message.length < 10) return { error: "Tell us a little more so we can help." };

  const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  const name = profile?.display_name || "A Klimr member";
  const from = user.email ?? "unknown@klimr.com";

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[support] RESEND_API_KEY is not set");
    return { error: "We couldn't send that just now. Please email support@klimr.com directly." };
  }

  const text = [
    `Category: ${category}`,
    `From: ${name} <${from}>`,
    `User ID: ${user.id}`,
    "",
    message,
  ].join("\n");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Klimr Support <support@notifications.klimr.com>",
        to: ["support@klimr.com"],
        reply_to: from,
        subject: `[${category}] ${subject}`,
        text,
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      console.error("[support] resend failed", res.status, detail);
      return { error: "We couldn't send that just now. Please email support@klimr.com directly." };
    }
  } catch (e) {
    console.error("[support] resend threw", e);
    return { error: "We couldn't send that just now. Please email support@klimr.com directly." };
  }

  return { ok: true };
}
