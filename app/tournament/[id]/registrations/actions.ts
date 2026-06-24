"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { createNotification } from "@/lib/notify";
import { capacityState } from "@/lib/waitlist";

async function origin(): Promise<string> {
  const h = await headers();
  return h.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://klimr.com";
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}

type Admin = ReturnType<typeof createAdminClient>;

async function emailOf(admin: Admin, userId: string): Promise<string | null> {
  try {
    const { data } = await admin.auth.admin.getUserById(userId);
    return data.user?.email ?? null;
  } catch {
    return null;
  }
}

/** Verify the caller owns the event. */
async function requireOwner(tournamentId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." as const };
  const admin = createAdminClient();
  const { data: t } = await admin.from("tournaments").select("id, title, code, owner_id").eq("id", tournamentId).maybeSingle();
  if (!t || t.owner_id !== user.id) return { error: "Not authorized." as const };
  return { admin, t };
}

/** Load a registration and verify the caller owns its event. */
async function ownedReg(registrationId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." as const };
  const admin = createAdminClient();
  const { data: r } = await admin.from("tournament_registrations").select("id, tournament_id, registrant_id, status").eq("id", registrationId).maybeSingle();
  if (!r) return { error: "Registration not found." as const };
  const { data: t } = await admin.from("tournaments").select("id, title, code, owner_id").eq("id", r.tournament_id).maybeSingle();
  if (!t || t.owner_id !== user.id) return { error: "Not authorized." as const };
  return { admin, r, t };
}

/** Load an email-only waitlist entry and verify the caller owns its event. */
async function ownedWaitlist(waitlistId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." as const };
  const admin = createAdminClient();
  const { data: w } = await admin.from("tournament_waitlist").select("id, tournament_id").eq("id", waitlistId).maybeSingle();
  if (!w) return { error: "Waitlist entry not found." as const };
  const { data: t } = await admin.from("tournaments").select("id, owner_id").eq("id", w.tournament_id).maybeSingle();
  if (!t || t.owner_id !== user.id) return { error: "Not authorized." as const };
  return { admin, w, t };
}

/**
 * Accept a waitlisted Klimr entry. The entry already has the full sign-up data,
 * so this just moves it to pending — the registrant only needs to submit payment.
 */
export async function acceptWaitlistedRegistration(registrationId: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await ownedReg(registrationId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { admin, r, t } = ctx;
  if (r.status !== "waitlisted") return { ok: false, error: "That entry isn't on the waitlist." };

  await admin.from("tournament_registrations").update({ status: "pending" }).eq("id", r.id);

  const base = await origin();
  const to = await emailOf(admin, r.registrant_id);
  if (to) {
    await sendEmail({
      to,
      subject: `You're off the waitlist — ${t.title}`,
      html: `<p>A spot opened and the organizer accepted your entry for <strong>${esc(t.title)}</strong>.</p><p>Open your entry to submit payment and lock in your spot.</p><p><a href="${base}/e/${t.code}">Complete your entry</a></p>`,
    });
  }
  await createNotification({
    userId: r.registrant_id,
    kind: "system",
    title: `You're in — ${t.title}`,
    body: "A spot opened and your entry was accepted. Submit payment to confirm your spot.",
    linkUrl: `/e/${t.code}`,
  });
  revalidatePath(`/tournament/${t.id}/registrations`);
  return { ok: true };
}

/** Decline a waitlisted entry (removes it from the waitlist). */
export async function removeWaitlistedRegistration(registrationId: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await ownedReg(registrationId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { admin, r, t } = ctx;
  await admin.from("tournament_registrations").update({ status: "declined" }).eq("id", r.id);
  revalidatePath(`/tournament/${t.id}/registrations`);
  return { ok: true };
}

/** Remove an email-only waitlist entry. */
export async function removeEmailWaitlist(waitlistId: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await ownedWaitlist(waitlistId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  await ctx.admin.from("tournament_waitlist").delete().eq("id", ctx.w.id);
  revalidatePath(`/tournament/${ctx.t.id}/registrations`);
  return { ok: true };
}

/**
 * Notify everyone on the waitlist that spots have opened. Gated: this only sends
 * once the event actually has room again (i.e. spots opened after it filled).
 * Klimr waitlisters get an email + an in-app notification; email-only entries get
 * an email and are marked invited.
 */
export async function notifyWaitlist(tournamentId: string): Promise<{ ok: boolean; error?: string; count?: number }> {
  const ctx = await requireOwner(tournamentId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { admin, t } = ctx;

  const { open } = await capacityState(admin, tournamentId);
  if (open !== null && open <= 0) return { ok: false, error: "No open spots yet — notifications go out once the event has room again." };

  const base = await origin();
  let count = 0;

  // Klimr waitlisters (full waitlisted registrations): email + in-app.
  const { data: regs } = await admin.from("tournament_registrations").select("id, registrant_id").eq("tournament_id", tournamentId).eq("status", "waitlisted");
  for (const r of regs ?? []) {
    const to = await emailOf(admin, r.registrant_id);
    if (to) {
      await sendEmail({
        to,
        subject: `A spot opened — ${t.title}`,
        html: `<p>Good news — a spot has opened for <strong>${esc(t.title)}</strong>.</p><p>You're on the waitlist; the organizer may accept your entry shortly. Keep an eye out for a confirmation.</p><p><a href="${base}/e/${t.code}">View the event</a></p>`,
      });
      count++;
    }
    await createNotification({
      userId: r.registrant_id,
      kind: "system",
      title: `A spot opened — ${t.title}`,
      body: "You're on the waitlist for this event and a spot just opened.",
      linkUrl: `/e/${t.code}`,
    });
  }

  // Email-only entries: keep notifying until they actually register with that
  // email. Entries are linked to a Klimr account at account/entry creation (DB
  // trigger), so we just read user_id here — no scan. If linked, also send an
  // in-app notification and nudge them to complete a full entry for priority.
  const { data: emails } = await admin
    .from("tournament_waitlist")
    .select("id, email, user_id")
    .eq("tournament_id", tournamentId)
    .eq("kind", "email")
    .in("status", ["waiting", "invited"]);
  for (const e of emails ?? []) {
    if (!e.email) continue;
    const linkedUserId = e.user_id;
    const withdraw = `<p style="font-size:12px;color:#888;margin-top:16px">Don't want these emails? <a href="${base}/waitlist/withdraw?id=${e.id}">Leave the waitlist</a>.</p>`;
    const html = linkedUserId
      ? `<p>A spot has opened for <strong>${esc(t.title)}</strong>.</p><p>You now have a Klimr account with this email — sign in and complete your full entry to claim a <strong>priority</strong> spot (you'll only pay once the organizer accepts it).</p><p><a href="${base}/e/${t.code}/signup">Complete your entry</a></p>${withdraw}`
      : `<p>A spot has opened for <strong>${esc(t.title)}</strong>.</p><p>Spots are first-come — sign up now before it fills again.</p><p><a href="${base}/e/${t.code}/signup">Sign up</a></p>${withdraw}`;
    await sendEmail({ to: e.email, subject: `A spot opened — ${t.title}`, html });
    count++;
    if (linkedUserId) {
      await createNotification({
        userId: linkedUserId,
        kind: "system",
        title: `A spot opened — ${t.title}`,
        body: "You're on the waitlist. Complete your full entry to claim a priority spot.",
        linkUrl: `/e/${t.code}/signup`,
      });
    }
    await admin.from("tournament_waitlist").update({ status: "invited", notified_at: new Date().toISOString() }).eq("id", e.id);
  }

  revalidatePath(`/tournament/${t.id}/registrations`);
  return { ok: true, count };
}
