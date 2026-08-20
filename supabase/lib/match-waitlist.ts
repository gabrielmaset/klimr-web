import { offerWindowMinutes } from "@/lib/waitlist-window";
import { createAdminClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notify";
import { sendEmail } from "@/lib/email";
import { sportMeta } from "@/lib/sports";

/** Match waitlist offer engine (Gabriel's spec, 2026-08-04).
 *
 *  A numbered FIFO waitlist per match (join_requests, status 'waitlisted').
 *  When a spot opens — someone leaves, or a prior offer dies — the FIRST in
 *  line receives an OFFER whose confirmation window depends on how soon the
 *  match starts at the moment the spot opened:
 *      starts in ≤ 4h  → 20 minutes to confirm
 *      starts in ≤ 24h → 1 hour
 *      further out (or anytime matches) → 4 hours
 *  Offered spots are RESERVED: direct joins count active offers as taken.
 *  An unconfirmed offer expires: the player leaves the waitlist (they may
 *  rejoin at the back) and the next in line is called with a fresh window.
 *  Every offer lands in-app AND by email; expiries land in-app.
 *
 *  All functions run on the service role. Entry points: leaveMatch and
 *  leaveWaitlist call promoteForMatch directly (instant offers); the
 *  pg_cron-pinged sweep route expires overdue offers and cascades. */


export { offerWindowMinutes } from "@/lib/waitlist-window";

const windowLabel = (mins: number) => (mins === 20 ? "20 minutes" : mins === 60 ? "1 hour" : "4 hours");

/** REMOVED (KCDX-044). `renumber` rewrote the whole waitlist's positions from
 *  application code, in its own round trip after the offers had been issued —
 *  so between the two, the line a member saw did not match the line that
 *  existed. It is inside `match_promote_waitlist` now, in the same transaction
 *  as the promotion that changed the line. Deleted rather than left unused: a
 *  dead helper that still works invites a caller. */


/** Offer open spots to the front of the line until spots or the line run out. */
export async function promoteForMatch(matchId: string): Promise<void> {
  const admin = createAdminClient();
  try {
    const { data: match } = await admin
      .from("matches")
      .select("id, scheduled_at, status, sport_key")
      .eq("id", matchId)
      .maybeSingle();
    if (!match || match.status !== "open") return;

    const mins = offerWindowMinutes(match.scheduled_at, Date.now());

    // KCDX-044: free slots used to be `total_slots − filled − activeOffers` from
    // two independent counts, followed by a loop issuing offers one at a time and
    // ignoring every error (`if (error) continue`). Two promotions running
    // together — a sweep and a decline, say — could each believe the same slot
    // was free. The command locks the match, counts both under that lock, claims
    // the FIFO head with `FOR UPDATE SKIP LOCKED`, and renumbers the remaining
    // line in the same transaction.
    const { data, error } = await admin.rpc("match_promote_waitlist", {
      p_match: matchId,
      p_offer_mins: mins,
    });
    if (error) {
      console.error("[waitlist] promote failed", matchId, error.message);
      return;
    }
    const offeredTo = ((data as { offered_to?: string[] } | null)?.offered_to ?? []) as string[];
    if (offeredTo.length === 0) return;

    // Telling people happens AFTER the transaction commits. A notification sent
    // inside it would be a promise about a state that might still roll back.
    const sportName = sportMeta(match.sport_key).name;
    for (const requesterId of offeredTo) {
      await createNotification({
        userId: requesterId,
        actorId: null,
        kind: "waitlist_offer",
        title: "A spot opened — confirm to join",
        body: `${sportName} match · you have ${windowLabel(mins)} to confirm your spot before it goes to the next player.`,
        linkUrl: `/play/${matchId}`,
      });
      try {
        const { data: au } = await admin.auth.admin.getUserById(requesterId);
        const email = au?.user?.email;
        if (email) {
          await sendEmail({
            to: email,
            subject: `Your spot opened — confirm within ${windowLabel(mins)}`,
            html:
              `<p>A spot just opened in a <strong>${sportName}</strong> match on Klimr, and you're first in line.</p>` +
              `<p>You have <strong>${windowLabel(mins)}</strong> to confirm before the spot goes to the next player on the waitlist.</p>` +
              `<p><a href="https://www.klimr.com/play/${matchId}">Confirm your spot →</a></p>`,
          });
        }
      } catch (e) {
        console.error("[waitlist] offer email failed", e instanceof Error ? e.message : e);
      }
    }
  } catch (e) {
    console.error("[waitlist] promoteForMatch failed", matchId, e instanceof Error ? e.message : e);
  }
}

export async function sweepWaitlists(): Promise<{ expired: number; matches: number }> {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const { data: overdue } = await admin
    .from("join_requests")
    .select("id, match_id, requester_id")
    .eq("status", "offered")
    .lt("offer_expires_at", nowIso)
    .limit(100);
  const rows = overdue ?? [];
  const matchIds = new Set<string>();
  for (const r of rows) {
    const { error } = await admin.from("join_requests").update({ status: "expired" }).eq("id", r.id).eq("status", "offered");
    if (error) continue;
    matchIds.add(r.match_id);
    await createNotification({
      userId: r.requester_id,
      kind: "waitlist_expired",
      title: "Your confirmation window expired",
      body: "The spot went to the next player in line. You can rejoin the waitlist any time.",
      linkUrl: `/play/${r.match_id}`,
    });
  }
  for (const id of matchIds) await promoteForMatch(id);
  return { expired: rows.length, matches: matchIds.size };
}

/** Confirm an active offer: the player becomes a confirmed participant. */
export async function confirmOffer(matchId: string, userId: string): Promise<{ ok: boolean; reason?: string }> {
  const admin = createAdminClient();
  // KCDX-044: this was five steps with nothing holding across them — read the
  // offer, read the match, COUNT participants against total_slots, insert, mark
  // the offer joined. Two people whose offers arrived together (the normal case,
  // since promotion issues several at once) both counted slots-minus-one and
  // both inserted. And the last two steps were unrelated: a participant could
  // land while the offer still read `offered`, so a sweep could expire an offer
  // that had already been taken.
  //
  // One transaction with the match row locked. Idempotent: someone already in
  // the match gets `ok` without consuming a second slot.
  const { data, error } = await admin.rpc("match_confirm_offer", { p_match: matchId, p_user: userId });
  const res = data as { ok?: boolean; reason?: string; organizer_id?: string; already_in?: boolean } | null;
  if (error || !res?.ok) return { ok: false, reason: res?.reason ?? "join_failed" };

  if (res.organizer_id && res.organizer_id !== userId && !res.already_in) {
    const { data: me } = await admin.from("profiles").select("display_name").eq("id", userId).maybeSingle();
    await createNotification({
      userId: res.organizer_id,
      actorId: userId,
      kind: "match_join",
      title: `${me?.display_name ?? "A player"} claimed a spot`,
      body: "Someone from the waitlist took an open slot.",
      linkUrl: `/play/${matchId}`,
    });
  }
  return { ok: true };
}

export async function declineOffer(matchId: string, userId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("join_requests")
    .select("id, status")
    .eq("match_id", matchId)
    .eq("requester_id", userId)
    .maybeSingle();
  if (!row || row.status !== "offered") return;
  await admin.from("join_requests").update({ status: "expired" }).eq("id", row.id);
  await promoteForMatch(matchId);
}
