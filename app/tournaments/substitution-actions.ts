"use server";

/** Consent-first roster substitutions (0162).
 *
 *  The flow: a captain (or event staff) REQUESTS a swap → the incoming player
 *  gets a notification → they review the event's re-asked per-player
 *  questions + waiver/rules and ACCEPT or DECLINE. Only acceptance changes
 *  the roster, and it runs through the accept_substitution() SECURITY DEFINER
 *  RPC, which re-validates EVERYTHING — deadline, entry, team membership,
 *  double-entry — atomically at that final moment. The deadline is therefore
 *  checked twice by design (Gabriel's spec): once here when the request is
 *  created, and again inside the transaction that executes the swap.
 *
 *  Undo: while the roster is unlocked, undoing an executed substitution is
 *  simply the reverse request (consent again — the original player agrees to
 *  come back). Multi-player substitutions are independent requests; the
 *  partial-unique indexes in 0162 keep seats and incomers from colliding.
 *
 *  Staff instant path: substituteRegistrationPlayer in ./actions remains the
 *  no-consent tool for event staff fixing rosters directly.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createNotification } from "@/lib/notify";
import { rateLimit } from "@/lib/ratelimit";
import { rosterLockAt } from "@/lib/tournament";
import type { Json } from "@/lib/database.types";

const lockLabel = (d: Date) =>
  d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

async function names(supabase: Awaited<ReturnType<typeof createClient>>, ids: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids)];
  if (!uniq.length) return new Map();
  const { data } = await supabase.from("profiles").select("id, display_name").in("id", uniq);
  return new Map((data ?? []).map((p) => [p.id, p.display_name]));
}

/** Captain/staff proposes a substitution. Deadline check #1 happens here. */
export async function requestSubstitution(
  tournamentId: string,
  input: { registrationId: string; removeUserId: string; addUserId: string; note?: string },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const allowed = await rateLimit(`subreq:${user.id}`, 20, 3600); // 20 / hour (DB wall: 30 / day)
  if (!allowed) return { ok: false as const, error: "Too many substitution requests. Please wait a bit." };

  const { data: t } = await supabase
    .from("tournaments")
    .select("id, code, title, owner_id, status, starts_at, ends_at, roster_lock_policy, roster_lock_custom")
    .eq("id", tournamentId)
    .maybeSingle();
  if (!t) return { ok: false as const, error: "Event not found." };
  if (["completed", "cancelled", "archived"].includes(t.status)) return { ok: false as const, error: "This event is closed." };

  const { data: reg } = await supabase
    .from("tournament_registrations")
    .select("id, team_id, registrant_id, status")
    .eq("id", input.registrationId)
    .eq("tournament_id", tournamentId)
    .maybeSingle();
  if (!reg) return { ok: false as const, error: "Entry not found." };
  if (["withdrawn", "declined", "cancelled", "disqualified"].includes(reg.status)) return { ok: false as const, error: "This entry isn't active." };

  // Authority: event staff, the registrant, or the team captain (parity with
  // the staff instant path in ./actions).
  let staff = t.owner_id === user.id;
  if (!staff) {
    const { data: mgr } = await supabase.from("tournament_managers").select("user_id").eq("tournament_id", tournamentId).eq("user_id", user.id).maybeSingle();
    staff = !!mgr;
  }
  let captain = reg.registrant_id === user.id;
  if (!captain && reg.team_id) {
    const { data: tm } = await supabase.from("teams").select("created_by").eq("id", reg.team_id).maybeSingle();
    captain = tm?.created_by === user.id;
  }
  if (!staff && !captain) return { ok: false as const, error: "Only the team captain or event staff can request substitutions." };

  // Deadline check #1 — at the start of the substitution.
  const lockAt = rosterLockAt(t);
  if (!staff && lockAt && Date.now() > lockAt.getTime()) {
    return { ok: false as const, error: `Roster changes for this event closed ${lockLabel(lockAt)}.` };
  }

  if (input.removeUserId === input.addUserId) return { ok: false as const, error: "Pick two different players." };

  if (reg.team_id) {
    const { data: member } = await supabase.from("team_members").select("user_id").eq("team_id", reg.team_id).eq("user_id", input.addUserId).maybeSingle();
    if (!member) return { ok: false as const, error: "Substitutes must already be on the team's roster." };
  }
  const { data: outRow } = await supabase
    .from("tournament_registration_players")
    .select("id")
    .eq("registration_id", input.registrationId)
    .eq("user_id", input.removeUserId)
    .maybeSingle();
  if (!outRow) return { ok: false as const, error: "That player isn't on this entry." };
  const { data: dupe } = await supabase
    .from("tournament_registration_players")
    .select("id")
    .eq("tournament_id", tournamentId)
    .eq("user_id", input.addUserId)
    .maybeSingle();
  if (dupe) return { ok: false as const, error: "That player is already on an entry in this event." };

  const note = (input.note ?? "").trim().slice(0, 280) || null;
  const { data: inserted, error: insErr } = await supabase
    .from("tournament_substitution_requests")
    .insert({
      tournament_id: tournamentId,
      registration_id: input.registrationId,
      team_id: reg.team_id,
      requested_by: user.id,
      player_out: input.removeUserId,
      player_in: input.addUserId,
      note,
      expires_at: lockAt ? lockAt.toISOString() : null,
    })
    .select("id")
    .single();
  if (insErr || !inserted) {
    // 23505 = a pending request already covers this seat or this player.
    const friendly = insErr?.code === "23505"
      ? "A pending request already covers that seat or that player."
      : "Couldn't create the request.";
    if (insErr && insErr.code !== "23505") console.error("[substitution] request insert failed", insErr.code, insErr.message);
    return { ok: false as const, error: friendly };
  }

  const nameMap = await names(supabase, [user.id, input.removeUserId, input.addUserId]);
  await createNotification({
    userId: input.addUserId,
    kind: "tournament",
    title: "Substitution request",
    body: `${nameMap.get(user.id) ?? "Your captain"} asked you to take ${nameMap.get(input.removeUserId) ?? "a teammate"}'s spot in ${t.title}.${lockAt ? ` Respond before ${lockLabel(lockAt)}.` : ""}`,
    linkUrl: `/e/${t.code}/substitute/${inserted.id}`,
  });

  if (reg.team_id) revalidatePath(`/teams/${reg.team_id}`);
  return { ok: true as const, requestId: inserted.id };
}

/** The invited substitute answers. Accept executes the atomic swap via the
 *  RPC (deadline check #2 lives inside that transaction). */
export async function respondSubstitution(
  requestId: string,
  input: { accept: boolean; answers?: Record<string, string | string[]>; acceptWaiver?: boolean; acceptRules?: boolean },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: req } = await supabase
    .from("tournament_substitution_requests")
    .select("id, tournament_id, registration_id, team_id, requested_by, player_out, player_in, status, expires_at")
    .eq("id", requestId)
    .maybeSingle();
  if (!req) return { ok: false as const, error: "Request not found." };
  if (req.player_in !== user.id) return { ok: false as const, error: "Only the invited substitute can respond." };
  if (req.status !== "pending") return { ok: false as const, error: "This request is no longer open." };

  const { data: t } = await supabase
    .from("tournaments")
    .select("id, code, title, owner_id")
    .eq("id", req.tournament_id)
    .maybeSingle();

  if (!input.accept) {
    const { error } = await supabase
      .from("tournament_substitution_requests")
      .update({ status: "declined", decided_at: new Date().toISOString() })
      .eq("id", requestId)
      .eq("status", "pending");
    if (error) return { ok: false as const, error: "Couldn't record your response." };
    const nameMap = await names(supabase, [user.id]);
    await createNotification({
      userId: req.requested_by,
      kind: "tournament",
      title: "Substitution declined",
      body: `${nameMap.get(user.id) ?? "The invited player"} declined the substitution${t ? ` for ${t.title}` : ""}. The roster is unchanged.`,
      linkUrl: req.team_id ? `/teams/${req.team_id}` : t ? `/e/${t.code}` : undefined,
    });
    return { ok: true as const, accepted: false as const };
  }

  const { data: rpc, error: rpcErr } = await supabase.rpc("accept_substitution", {
    p_request_id: requestId,
    p_answers: (input.answers ?? {}) as Json,
    p_accept_waiver: !!input.acceptWaiver,
    p_accept_rules: !!input.acceptRules,
  });
  if (rpcErr) {
    console.error("[substitution] accept rpc failed", rpcErr.code, rpcErr.message);
    return { ok: false as const, error: "Couldn't complete the substitution." };
  }
  const out = (rpc ?? {}) as { ok?: boolean; error?: string };
  if (!out.ok) return { ok: false as const, error: out.error ?? "Couldn't complete the substitution." };

  // Executed — tell everyone who runs this event or asked for the change.
  const nameMap = await names(supabase, [req.player_in, req.player_out, req.requested_by]);
  const inName = nameMap.get(req.player_in) ?? "A substitute";
  const outName = nameMap.get(req.player_out) ?? "a rostered player";
  const staffIds = new Set<string>();
  if (t?.owner_id) staffIds.add(t.owner_id);
  const { data: mgrs } = await supabase.from("tournament_managers").select("user_id").eq("tournament_id", req.tournament_id);
  for (const m of mgrs ?? []) staffIds.add(m.user_id);
  staffIds.delete(req.player_in);
  const regsLink = `/tournament/${req.tournament_id}/registrations`;
  await Promise.all([
    ...[...staffIds].map((uid) =>
      createNotification({
        userId: uid,
        kind: "tournament",
        title: "Roster change",
        body: `${inName} replaced ${outName}${t ? ` in ${t.title}` : ""}. Their answers and waiver were collected on acceptance.`,
        linkUrl: regsLink,
      }),
    ),
    req.requested_by !== req.player_in
      ? createNotification({
          userId: req.requested_by,
          kind: "tournament",
          title: "Substitution complete",
          body: `${inName} accepted and is now on the entry${t ? ` for ${t.title}` : ""} in place of ${outName}.`,
          linkUrl: req.team_id ? `/teams/${req.team_id}` : undefined,
        })
      : Promise.resolve(),
    createNotification({
      userId: req.player_out,
      kind: "tournament",
      title: "You've been substituted",
      body: `${inName} has taken your spot${t ? ` in ${t.title}` : ""}. Your team captain arranged the change.`,
      linkUrl: t ? `/e/${t.code}` : undefined,
    }),
  ]);

  if (req.team_id) revalidatePath(`/teams/${req.team_id}`);
  revalidatePath(regsLink);
  if (t) revalidatePath(`/e/${t.code}`);
  return { ok: true as const, accepted: true as const };
}

/** The requester (or staff) withdraws a pending request. */
export async function cancelSubstitution(requestId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: req } = await supabase
    .from("tournament_substitution_requests")
    .select("id, tournament_id, team_id, requested_by, player_in, status")
    .eq("id", requestId)
    .maybeSingle();
  if (!req) return { ok: false as const, error: "Request not found." };
  if (req.status !== "pending") return { ok: false as const, error: "This request is no longer open." };

  let may = req.requested_by === user.id;
  if (!may) {
    const { data: t } = await supabase.from("tournaments").select("owner_id").eq("id", req.tournament_id).maybeSingle();
    may = t?.owner_id === user.id;
    if (!may) {
      const { data: mgr } = await supabase.from("tournament_managers").select("user_id").eq("tournament_id", req.tournament_id).eq("user_id", user.id).maybeSingle();
      may = !!mgr;
    }
  }
  if (!may) return { ok: false as const, error: "Only the requester or event staff can cancel this." };

  const { error } = await supabase
    .from("tournament_substitution_requests")
    .update({ status: "cancelled", decided_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("status", "pending");
  if (error) return { ok: false as const, error: "Couldn't cancel the request." };

  await createNotification({
    userId: req.player_in,
    kind: "tournament",
    title: "Substitution request withdrawn",
    body: "The substitution request sent to you was withdrawn — no action needed.",
    linkUrl: req.team_id ? `/teams/${req.team_id}` : undefined,
  });
  if (req.team_id) revalidatePath(`/teams/${req.team_id}`);
  return { ok: true as const };
}
