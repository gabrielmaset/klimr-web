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

type Admin = ReturnType<typeof createAdminClient>;

export { offerWindowMinutes } from "@/lib/waitlist-window";

const windowLabel = (mins: number) => (mins === 20 ? "20 minutes" : mins === 60 ? "1 hour" : "4 hours");

/** Re-rank the remaining 'waitlisted' rows 1..n by join order. */
async function renumber(admin: Admin, matchId: string): Promise<void> {
  const { data: rows } = await admin
    .from("join_requests")
    .select("id, waitlist_position")
    .eq("match_id", matchId)
    .eq("status", "waitlisted")
    .order("created_at", { ascending: true });
  let pos = 1;
  for (const r of rows ?? []) {
    if (r.waitlist_position !== pos) await admin.from("join_requests").update({ waitlist_position: pos }).eq("id", r.id);
    pos += 1;
  }
}

/** Offer open spots to the front of the line until spots or the line run out. */
export async function promoteForMatch(matchId: string): Promise<void> {
  const admin = createAdminClient();
  try {
    const { data: match } = await admin
      .from("matches")
      .select("id, total_slots, scheduled_at, status, sport_key")
      .eq("id", matchId)
      .maybeSingle();
    if (!match || match.status !== "open") return;
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const [{ count: filled }, { count: activeOffers }] = await Promise.all([
      admin.from("match_participants").select("*", { count: "exact", head: true }).eq("match_id", matchId),
      admin
        .from("join_requests")
        .select("*", { count: "exact", head: true })
        .eq("match_id", matchId)
        .eq("status", "offered")
        .gt("offer_expires_at", nowIso),
    ]);
    let free = match.total_slots - (filled ?? 0) - (activeOffers ?? 0);
    if (free <= 0) return;

    const { data: line } = await admin
      .from("join_requests")
      .select("id, requester_id")
      .eq("match_id", matchId)
      .eq("status", "waitlisted")
      .order("created_at", { ascending: true })
      .limit(free);
    const sportName = sportMeta(match.sport_key).name;

    for (const nextUp of line ?? []) {
      if (free <= 0) break;
      const mins = offerWindowMinutes(match.scheduled_at, Date.now());
      const expires = new Date(Date.now() + mins * 60_000).toISOString();
      const { error } = await admin
        .from("join_requests")
        .update({ status: "offered", offered_at: new Date().toISOString(), offer_expires_at: expires, waitlist_position: null })
        .eq("id", nextUp.id)
        .eq("status", "waitlisted");
      if (error) continue;
      free -= 1;

      await createNotification({
        userId: nextUp.requester_id,
        kind: "waitlist_offer",
        title: "A spot opened — confirm to join",
        body: `${sportName} match · you have ${windowLabel(mins)} to confirm your spot before it goes to the next player.`,
        linkUrl: `/play/${matchId}`,
      });
      try {
        const { data: au } = await admin.auth.admin.getUserById(nextUp.requester_id);
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
    await renumber(admin, matchId);
  } catch (e) {
    console.error("[waitlist] promoteForMatch failed", matchId, e instanceof Error ? e.message : e);
  }
}

/** Expire overdue offers (they leave the line, may rejoin) and cascade. */
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
  const nowIso = new Date().toISOString();
  const { data: row } = await admin
    .from("join_requests")
    .select("id, status, offer_expires_at")
    .eq("match_id", matchId)
    .eq("requester_id", userId)
    .maybeSingle();
  if (!row || row.status !== "offered") return { ok: false, reason: "no_offer" };
  if (!row.offer_expires_at || row.offer_expires_at < nowIso) return { ok: false, reason: "expired" };
  const { data: match } = await admin.from("matches").select("total_slots, status, organizer_id, sport_key").eq("id", matchId).maybeSingle();
  if (!match || match.status !== "open") return { ok: false, reason: "closed" };
  const { count: filled } = await admin.from("match_participants").select("*", { count: "exact", head: true }).eq("match_id", matchId);
  if ((filled ?? 0) >= match.total_slots) return { ok: false, reason: "full" };
  const { error } = await admin.from("match_participants").insert({
    match_id: matchId,
    user_id: userId,
    slot: (filled ?? 0) + 1,
    is_organizer: false,
    confirmed: true, // confirming the offer IS confirming presence
  });
  if (error) return { ok: false, reason: "join_failed" };
  await admin.from("join_requests").update({ status: "joined" }).eq("id", row.id);
  if (match.organizer_id && match.organizer_id !== userId) {
    const { data: me } = await admin.from("profiles").select("display_name").eq("id", userId).maybeSingle();
    await createNotification({
      userId: match.organizer_id,
      kind: "match_join",
      title: `${me?.display_name || "A player"} claimed a waitlist spot`,
      body: `${sportMeta(match.sport_key).name} · confirmed and on your roster.`,
      linkUrl: `/play/${matchId}`,
    });
  }
  return { ok: true };
}

/** Decline an active offer: same terminal path as expiry, cascade follows. */
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
