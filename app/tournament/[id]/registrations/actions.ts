"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { createNotification } from "@/lib/notify";
import { capacityState } from "@/lib/waitlist";
import { reconcileTournamentStructure } from "@/app/tournaments/actions";

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
  const { data: t } = await admin.from("tournaments").select("id, title, code, owner_id, entry_type, format_config").eq("id", tournamentId).maybeSingle();
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
  const { data: r } = await admin.from("tournament_registrations").select("id, tournament_id, registrant_id, status, division_id").eq("id", registrationId).maybeSingle();
  if (!r) return { error: "Registration not found." as const };
  const { data: t } = await admin.from("tournaments").select("id, title, code, owner_id, entry_type, format_config").eq("id", r.tournament_id).maybeSingle();
  if (!t || t.owner_id !== user.id) return { error: "Not authorized." as const };
  return { admin, r, t };
}

/** Assign, switch, or unassign a registration's division. Never loses an
 *  entry: moving out frees a spot (the reconciler promotes that division's
 *  waitlist head), moving in is blocked when the target is full, and a move
 *  under a built schedule resets it (groups reshaped). */
export async function moveRegistrationDivision(
  registrationId: string,
  divisionId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await ownedReg(registrationId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { admin, r, t } = ctx;

  const from = r.division_id ?? null;
  const to = divisionId ?? null;
  if (from === to) return { ok: true };

  const fc = (t.format_config ?? {}) as Record<string, unknown>;
  const unit = fc.capacity_unit === "person" ? "person" : "team";
  const roster = Math.max(1, Number(fc.roster_size) || 1);

  let targetName: string | null = null;
  if (to) {
    const { data: div } = await admin
      .from("tournament_divisions")
      .select("id, name, capacity")
      .eq("id", to)
      .eq("tournament_id", t.id)
      .maybeSingle();
    if (!div) return { ok: false, error: "That division no longer exists." };
    targetName = div.name;

    // A live entry can't move into a full division — say so with numbers.
    if (fc.capacity_mode === "per_division" && div.capacity != null && (r.status === "pending" || r.status === "confirmed")) {
      const capE = unit === "person" && t.entry_type === "team" ? Math.floor(div.capacity / roster) : div.capacity;
      const { count } = await admin
        .from("tournament_registrations")
        .select("id", { count: "exact", head: true })
        .eq("tournament_id", t.id)
        .eq("division_id", to)
        .in("status", ["pending", "confirmed", "under_review"]);
      if ((count ?? 0) >= capE) {
        return { ok: false, error: `“${div.name}” is full (${count}/${capE} entries). Raise its cap or move an entry out first.` };
      }
    }
  }

  await admin
    .from("tournament_registrations")
    .update({ division_id: to, updated_at: new Date().toISOString() })
    .eq("id", r.id);

  await createNotification({
    userId: r.registrant_id,
    kind: "system",
    title: to ? `Your entry moved to ${targetName} — ${t.title}` : `Your entry is awaiting division placement — ${t.title}`,
    body: to ? undefined : "The organizer will place it in a division.",
    linkUrl: `/e/${t.code}`,
  });

  // Groups reshaped: renumber both buckets, promote the vacated one's
  // waitlist, reset a built schedule.
  await reconcileTournamentStructure(admin, t.id, { structureChanged: true });

  revalidatePath(`/tournament/${t.id}/registrations`);
  return { ok: true };
}

export type ModerationAction = "cancel_no_penalty" | "cancel_penalty" | "disqualify" | "under_review" | "reinstate";

/** Organizer-only entry moderation (ownedReg checks the OWNER, never staff):
 *  cancel without penalty (withdrawn), cancel with penalty (fee forfeited),
 *  disqualify, put under review with a required fix note (holds its spot),
 *  or reinstate (capacity-checked when coming back from a freed state). */
export async function setEntryModeration(
  registrationId: string,
  action: ModerationAction,
  note?: string,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await ownedReg(registrationId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { admin, r, t } = ctx;
  const cleanNote = String(note ?? "").trim().slice(0, 400) || null;

  const freed = ["withdrawn", "cancelled", "disqualified"];
  let nextStatus: string;
  let title: string;
  let body: string | undefined;

  if (action === "under_review") {
    if (!cleanNote) return { ok: false, error: "Describe the fix you need — the player sees this note." };
    nextStatus = "under_review";
    title = `Action needed on your entry — ${t.title}`;
    body = cleanNote;
  } else if (action === "cancel_no_penalty") {
    nextStatus = "withdrawn";
    title = `Your entry was cancelled — ${t.title}`;
    body = `No penalty applies${cleanNote ? ` — ${cleanNote}` : ""}. Any payment is handled directly by the organizer.`;
  } else if (action === "cancel_penalty") {
    nextStatus = "cancelled";
    title = `Your entry was cancelled — ${t.title}`;
    body = `Per the event's policy the entry fee is forfeited${cleanNote ? ` — ${cleanNote}` : ""}.`;
  } else if (action === "disqualify") {
    nextStatus = "disqualified";
    title = `Your entry was disqualified — ${t.title}`;
    body = cleanNote ?? undefined;
  } else {
    // Reinstate: coming back from a freed state must fit the bucket.
    nextStatus = "pending";
    title = `You're back in — ${t.title}`;
    body = "Your entry was reinstated by the organizer.";
    if (freed.includes(r.status)) {
      const fc = (t.format_config ?? {}) as Record<string, unknown>;
      const unit = fc.capacity_unit === "person" ? "person" : "team";
      const roster = Math.max(1, Number(fc.roster_size) || 1);
      const perDiv = fc.capacity_mode === "per_division";
      if (perDiv && r.division_id) {
        const { data: div } = await admin.from("tournament_divisions").select("name, capacity").eq("id", r.division_id).maybeSingle();
        if (div?.capacity != null) {
          const capE = unit === "person" && t.entry_type === "team" ? Math.floor(div.capacity / roster) : div.capacity;
          const { count } = await admin
            .from("tournament_registrations")
            .select("id", { count: "exact", head: true })
            .eq("tournament_id", t.id)
            .eq("division_id", r.division_id)
            .in("status", ["pending", "confirmed", "under_review"]);
          if ((count ?? 0) >= capE) return { ok: false, error: `“${div.name}” is full (${count}/${capE}). Free a spot first, or unassign this entry's division before reinstating.` };
        }
      }
    }
  }

  await admin
    .from("tournament_registrations")
    .update({
      status: nextStatus,
      moderation_note: action === "reinstate" ? null : cleanNote,
      waitlist_position: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", r.id);

  await createNotification({ userId: r.registrant_id, kind: "system", title, body, linkUrl: `/e/${t.code}` });

  // Occupancy changed for everything except pending/confirmed ↔ under_review.
  const occupying = (s: string) => ["pending", "confirmed", "under_review"].includes(s);
  if (occupying(r.status) !== occupying(nextStatus)) {
    await reconcileTournamentStructure(admin, t.id, { structureChanged: true });
  }

  revalidatePath(`/tournament/${t.id}/registrations`);
  return { ok: true };
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
