"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";

async function origin(): Promise<string> {
  const h = await headers();
  return h.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://klimr.com";
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Join the waitlist with just an email (notification only — no account, no priority). */
export async function joinWaitlistEmail(tournamentId: string, email: string, name?: string): Promise<{ ok: boolean; error?: string }> {
  const clean = (email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(clean)) return { ok: false, error: "Enter a valid email address." };

  const admin = createAdminClient();
  const { data: t } = await admin.from("tournaments").select("id, title, code").eq("id", tournamentId).maybeSingle();
  if (!t) return { ok: false, error: "Event not found." };

  const { data: existing } = await admin
    .from("tournament_waitlist")
    .select("id")
    .eq("tournament_id", tournamentId)
    .ilike("email", clean)
    .in("status", ["waiting", "invited"])
    .maybeSingle();
  if (existing) return { ok: true };

  const { data: ins, error } = await admin
    .from("tournament_waitlist")
    .insert({
      tournament_id: tournamentId,
      kind: "email",
      email: clean,
      name: (name ?? "").trim() || null,
      status: "waiting",
    })
    .select("id")
    .single();
  if (error || !ins) return { ok: false, error: "Could not join the waitlist. Please try again." };

  const base = await origin();
  await sendEmail({
    to: clean,
    subject: `You're on the waitlist — ${t.title}`,
    html: `<p>You're on the waitlist for <strong>${esc(t.title)}</strong>.</p><p>We'll email you if a spot opens up. Spots can fill quickly, so watch for our note and sign up fast.</p><p><a href="${base}/e/${t.code}">View the event</a></p><p style="font-size:12px;color:#888;margin-top:16px">Changed your mind? <a href="${base}/waitlist/withdraw?id=${ins.id}">Leave the waitlist</a>.</p>`,
  });
  return { ok: true };
}
