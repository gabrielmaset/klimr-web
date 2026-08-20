"use server";

/** Tournament entry payments (KCDX-067).
 *
 *  Extracted from `app/tournaments/actions.ts`, which the audit measured at
 *  2,606 lines and which had grown to 2,684 by the time I got here.
 *
 *  The seam is real rather than convenient: these four actions share a subject
 *  (one registration's payment), share one error vocabulary, and — since 0193 —
 *  share two locked commands, `tournament_submit_payment_proof` and
 *  `tournament_review_payment`, which hold the invariants that used to be spread
 *  across the calling code. Nothing else in the tournaments module reads or
 *  writes payment state, so moving them removes a concern rather than relocating
 *  a chunk of lines.
 *
 *  The audit explicitly warns against a big-bang rewrite of these files, and it
 *  is right: the value is in taking one coherent concern at a time, with its
 *  invariants already behind a command, and leaving the module still working
 *  after each step. This is one such step, not a plan for the rest.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createNotification } from "@/lib/notify";
import { notifyPayment } from "@/lib/emails/notify";
import { rateLimit } from "@/lib/ratelimit";

function paymentErrorMessage(code?: string): string {
  switch (code) {
    case "not_signed_in": return "Sign in first.";
    case "not_found": return "Entry not found.";
    case "not_allowed": return "That isn't your entry.";
    case "no_proof": return "Attach your payment proof first.";
    case "already_confirmed": return "This entry is already marked paid.";
    default: return "Couldn't submit that proof. Please try again.";
  }
}


/** Records a payment proof the registrant uploaded to the private bucket, computes
 *  the amount owed from the division, and flips the entry to "proof submitted". */
export async function submitPaymentProof(registrationId: string, proofPath: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const allowed = await rateLimit(`payproof:${user.id}`, 20, 600); // 20 / 10 min
  if (!allowed) return { ok: false as const, error: "Too many upload attempts. Please wait a few minutes and try again." };

  const { data: reg } = await supabase
    .from("tournament_registrations")
    .select("id, tournament_id, registrant_id, division_id, team_id")
    .eq("id", registrationId)
    .maybeSingle();
  if (!reg) return { ok: false as const, error: "Entry not found." };
  if (reg.registrant_id !== user.id) return { ok: false as const, error: "Only the registrant can submit payment." };

  let amount: number | null = null;
  if (reg.division_id) {
    const { data: div } = await supabase.from("tournament_divisions").select("fee_cents, fee_basis").eq("id", reg.division_id).maybeSingle();
    if (div) {
      if (div.fee_basis === "per_team") {
        amount = div.fee_cents ?? 0;
      } else {
        const { count } = await supabase
          .from("tournament_registration_players")
          .select("id", { count: "exact", head: true })
          .eq("registration_id", reg.id)
          .eq("is_reserve", false);
        amount = (div.fee_cents ?? 0) * (count ?? 1);
      }
    }
  }

  // KCDX-003: the registrant supplies evidence, never a verdict. The command
  // writes the payment row with status 'submitted' and recomputes the amount
  // from the division fee server-side — both used to be caller-supplied.
  void amount;
  const { data: res, error: rpcErr } = await supabase.rpc("tournament_submit_payment_proof", {
    p_registration: reg.id,
    p_proof_path: proofPath,
  });
  const out = res as { ok?: boolean; error?: string } | null;
  if (rpcErr || !out?.ok) return { ok: false as const, error: paymentErrorMessage(out?.error) };
  return { ok: true as const };
}

/** Organizer confirms a registration's payment. Staff-only. */
export async function confirmPayment(registrationId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: reg } = await supabase.from("tournament_registrations").select("id, tournament_id").eq("id", registrationId).maybeSingle();
  if (!reg) return { ok: false as const, error: "Entry not found." };

  const { data: to } = await supabase.from("tournaments").select("owner_id").eq("id", reg.tournament_id).maybeSingle();
  let staff = to?.owner_id === user.id;
  if (!staff) {
    const { data: m } = await supabase.from("tournament_managers").select("user_id").eq("tournament_id", reg.tournament_id).eq("user_id", user.id).maybeSingle();
    staff = !!m;
  }
  if (!staff) return { ok: false as const, error: "Not allowed." };

  // KCDX-003: the decision is staff-owned in the database, not just in this
  // function. The command re-checks is_tournament_staff() before writing.
  const { data: cRes, error: cErr } = await supabase.rpc("tournament_review_payment", {
    p_registration: registrationId,
    p_decision: "confirmed",
    p_reason: null,
  });
  if (cErr || !(cRes as { ok?: boolean } | null)?.ok) return { ok: false as const, error: "Couldn't confirm that payment." };
  await notifyPayment(registrationId, "confirmed");
  revalidatePath(`/tournament/${reg.tournament_id}/payments`);
  return { ok: true as const };
}

/** Record that an entry's fee was returned. Staff-only (payments ops). */
export async function markPaymentRefunded(registrationId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: reg } = await supabase.from("tournament_registrations").select("id, tournament_id, registrant_id").eq("id", registrationId).maybeSingle();
  if (!reg) return { ok: false as const, error: "Entry not found." };

  const { data: to } = await supabase.from("tournaments").select("owner_id, title").eq("id", reg.tournament_id).maybeSingle();
  let staff = to?.owner_id === user.id;
  if (!staff) {
    const { data: m } = await supabase.from("tournament_managers").select("user_id").eq("tournament_id", reg.tournament_id).eq("user_id", user.id).maybeSingle();
    staff = !!m;
  }
  if (!staff) return { ok: false as const, error: "Not allowed." };

  const { data: rRes, error: rErr } = await supabase.rpc("tournament_review_payment", {
    p_registration: registrationId,
    p_decision: "refunded",
    p_reason: null,
  });
  if (rErr || !(rRes as { ok?: boolean } | null)?.ok) return { ok: false as const, error: "Couldn't record that refund." };
  await createNotification({
    userId: reg.registrant_id,
    kind: "system",
    title: `Your entry fee was refunded — ${to?.title ?? "your event"}`,
  });
  revalidatePath(`/tournament/${reg.tournament_id}/payments`);
  return { ok: true as const };
}

/** Organizer declines a payment with a reason the entrant will see. Staff-only. */
export async function denyPayment(registrationId: string, reason: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: reg } = await supabase.from("tournament_registrations").select("id, tournament_id").eq("id", registrationId).maybeSingle();
  if (!reg) return { ok: false as const, error: "Entry not found." };

  const { data: to } = await supabase.from("tournaments").select("owner_id").eq("id", reg.tournament_id).maybeSingle();
  let staff = to?.owner_id === user.id;
  if (!staff) {
    const { data: m } = await supabase.from("tournament_managers").select("user_id").eq("tournament_id", reg.tournament_id).eq("user_id", user.id).maybeSingle();
    staff = !!m;
  }
  if (!staff) return { ok: false as const, error: "Not allowed." };

  const { data: dRes, error: dErr } = await supabase.rpc("tournament_review_payment", {
    p_registration: registrationId,
    p_decision: "denied",
    p_reason: reason.trim() || null,
  });
  if (dErr || !(dRes as { ok?: boolean } | null)?.ok) return { ok: false as const, error: "Couldn't record that decision." };
  await notifyPayment(registrationId, "denied", reason);
  revalidatePath(`/tournament/${reg.tournament_id}/payments`);
  return { ok: true as const };
}

/** Snake-seed a division's active entries into N pools. Regenerating clears the
 *  division's existing pools and any pool matches first. Staff-only. */
