"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { accountActive } from "@/lib/guards";
import { createNotification } from "@/lib/notify";
import { after } from "next/server";
import { promoteForMatch, confirmOffer, declineOffer } from "@/lib/match-waitlist";
import { sportMeta } from "@/lib/sports";

async function ctx() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function joinMatch(formData: FormData) {
  const id = String(formData.get("matchId"));
  const { supabase, user } = await ctx();
  if (!user) redirect(`/login?next=/play/${id}`);
  if (!(await accountActive(supabase, user.id))) {
    revalidatePath(`/play/${id}`);
  revalidatePath("/play");
    return;
  }

  const { data: match } = await supabase
    .from("matches")
    .select("id, total_slots, status, organizer_id, sport_key")
    .eq("id", id)
    .single();
  if (match && match.status === "open") {
    const nowIso = new Date().toISOString();
    const [{ count }, { count: activeOffers }] = await Promise.all([
      supabase.from("match_participants").select("*", { count: "exact", head: true }).eq("match_id", id),
      supabase
        .from("join_requests")
        .select("*", { count: "exact", head: true })
        .eq("match_id", id)
        .eq("status", "offered")
        .gt("offer_expires_at", nowIso),
    ]);
    const filled = count ?? 0;
    // Actively offered spots are RESERVED for the waitlist player deciding.
    if (filled + (activeOffers ?? 0) < match.total_slots) {
      await supabase.from("match_participants").insert({
        match_id: id,
        user_id: user.id,
        slot: filled + 1,
        is_organizer: false,
        confirmed: false,
      });

      // Let the organizer know someone joined their match.
      if (match.organizer_id && match.organizer_id !== user.id) {
        const { data: me } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
        const name = me?.display_name || "A player";
        await createNotification({
          userId: match.organizer_id,
          kind: "match_join",
          title: `${name} joined your match`,
          body: `${sportMeta(match.sport_key).name} · they're on your roster.`,
          linkUrl: `/play/${id}`,
        });
      }
    }
  }
  revalidatePath(`/play/${id}`);
  revalidatePath("/play");
}

export async function leaveMatch(formData: FormData) {
  const id = String(formData.get("matchId"));
  const { supabase, user } = await ctx();
  if (!user) redirect(`/login?next=/play/${id}`);
  await supabase.from("match_participants").delete().eq("match_id", id).eq("user_id", user.id);
  // The vacated spot goes to the waitlist: first in line gets an offer with
  // a deadline keyed to how soon the match starts (20m / 1h / 4h).
  after(() => promoteForMatch(id));
  revalidatePath(`/play/${id}`);
  revalidatePath("/play");
}

export async function confirmSpot(formData: FormData) {
  const id = String(formData.get("matchId"));
  const { supabase, user } = await ctx();
  if (!user) redirect(`/login?next=/play/${id}`);
  await supabase.from("match_participants").update({ confirmed: true }).eq("match_id", id).eq("user_id", user.id);
  revalidatePath(`/play/${id}`);
  revalidatePath("/play");
}

export async function joinWaitlist(formData: FormData) {
  const id = String(formData.get("matchId"));
  const { supabase, user } = await ctx();
  if (!user) redirect(`/login?next=/play/${id}`);
  if (!(await accountActive(supabase, user.id))) {
    revalidatePath(`/play/${id}`);
  revalidatePath("/play");
    return;
  }
  const nowIso = new Date().toISOString();
  const [{ data: match }, { count: filled }, { count: activeOffers }, { count: waiting }, { data: mine }, { count: iAmIn }] = await Promise.all([
    supabase.from("matches").select("total_slots, status").eq("id", id).maybeSingle(),
    supabase.from("match_participants").select("*", { count: "exact", head: true }).eq("match_id", id),
    supabase.from("join_requests").select("*", { count: "exact", head: true }).eq("match_id", id).eq("status", "offered").gt("offer_expires_at", nowIso),
    supabase.from("join_requests").select("*", { count: "exact", head: true }).eq("match_id", id).eq("status", "waitlisted"),
    supabase.from("join_requests").select("id, status").eq("match_id", id).eq("requester_id", user.id).maybeSingle(),
    supabase.from("match_participants").select("*", { count: "exact", head: true }).eq("match_id", id).eq("user_id", user.id),
  ]);
  const effectivelyFull = !!match && match.status === "open" && (filled ?? 0) + (activeOffers ?? 0) >= match.total_slots;
  const alreadyActive = mine?.status === "waitlisted" || mine?.status === "offered";
  if (!effectivelyFull || alreadyActive || (iAmIn ?? 0) > 0) {
    revalidatePath(`/play/${id}`);
    revalidatePath("/play");
    return;
  }
  if (mine) {
    // Rejoining after an expired/declined/old row: back of the line, fresh clock.
    await supabase
      .from("join_requests")
      .update({ status: "waitlisted", waitlist_position: (waiting ?? 0) + 1, offered_at: null, offer_expires_at: null, created_at: nowIso })
      .eq("id", mine.id);
  } else {
    await supabase.from("join_requests").insert({
      match_id: id,
      requester_id: user.id,
      status: "waitlisted",
      waitlist_position: (waiting ?? 0) + 1,
    });
  }
  revalidatePath(`/play/${id}`);
  revalidatePath("/play");
}

export async function leaveWaitlist(formData: FormData) {
  const id = String(formData.get("matchId"));
  const { supabase, user } = await ctx();
  if (!user) redirect(`/login?next=/play/${id}`);
  await supabase.from("join_requests").delete().eq("match_id", id).eq("requester_id", user.id);
  // Renumber the line, and if this row held an active offer, the freed
  // reservation goes to the next player.
  after(() => promoteForMatch(id));
  revalidatePath(`/play/${id}`);
  revalidatePath("/play");
}

export async function cancelMatch(formData: FormData) {
  const id = String(formData.get("matchId"));
  const { supabase, user } = await ctx();
  if (!user) redirect(`/login?next=/play/${id}`);
  await supabase.from("matches").delete().eq("id", id).eq("organizer_id", user.id);
  redirect("/play");
}

// ---- direct match invites ----------------------------------------------------

// Are these two users accepted friends? (either direction)
async function areFriends(
  supabase: Awaited<ReturnType<typeof createClient>>,
  a: string,
  b: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("friendships")
    .select("id")
    .eq("status", "accepted")
    .or(`and(requester_id.eq.${a},addressee_id.eq.${b}),and(requester_id.eq.${b},addressee_id.eq.${a})`)
    .maybeSingle();
  return Boolean(data);
}

// Organizer invites a friend to fill the match.
export async function inviteToMatch(formData: FormData) {
  const id = String(formData.get("matchId"));
  const invitee = String(formData.get("userId"));
  const { supabase, user } = await ctx();
  if (!user) redirect(`/login?next=/play/${id}`);
  if (!invitee || invitee === user.id) {
    revalidatePath(`/play/${id}`);
  revalidatePath("/play");
    return;
  }

  const { data: match } = await supabase
    .from("matches")
    .select("id, organizer_id, sport_key, status")
    .eq("id", id)
    .single();
  // Only the organizer can invite, and only to a friend.
  if (!match || match.organizer_id !== user.id) {
    revalidatePath(`/play/${id}`);
  revalidatePath("/play");
    return;
  }
  if (!(await areFriends(supabase, user.id, invitee))) {
    revalidatePath(`/play/${id}`);
  revalidatePath("/play");
    return;
  }

  const { error } = await supabase
    .from("match_invites")
    .insert({ match_id: id, invited_user_id: invitee, invited_by: user.id, status: "pending" });
  // A duplicate invite (unique violation) is fine — just re-surface the page.
  if (!error) {
    const { data: me } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
    const name = me?.display_name || "A player";
    await createNotification({
      userId: invitee,
      kind: "match_invite",
      title: `${name} invited you to a match`,
      body: `${sportMeta(match.sport_key).name} · tap to accept or decline.`,
      linkUrl: `/play/${id}`,
    });
  }
  revalidatePath(`/play/${id}`);
  revalidatePath("/play");
}

// Invitee accepts — joins the roster if there's room.
export async function acceptMatchInvite(formData: FormData) {
  const inviteId = String(formData.get("inviteId"));
  const { supabase, user } = await ctx();
  if (!user) redirect("/login?next=/invites");

  const { data: invite } = await supabase
    .from("match_invites")
    .select("id, match_id, invited_user_id, invited_by, status")
    .eq("id", inviteId)
    .single();
  if (!invite || invite.invited_user_id !== user.id || invite.status !== "pending") {
    revalidatePath("/invites");
    return;
  }

  if (!(await accountActive(supabase, user.id))) {
    revalidatePath("/invites");
    return;
  }

  const { data: match } = await supabase
    .from("matches")
    .select("id, total_slots, status, organizer_id, sport_key")
    .eq("id", invite.match_id)
    .single();

  let joined = false;
  if (match && match.status === "open") {
    // Already on the roster?
    const { data: existing } = await supabase
      .from("match_participants")
      .select("user_id")
      .eq("match_id", match.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (existing) {
      joined = true;
    } else {
      const { count } = await supabase
        .from("match_participants")
        .select("*", { count: "exact", head: true })
        .eq("match_id", match.id);
      const filled = count ?? 0;
      if (filled < match.total_slots) {
        const { error } = await supabase.from("match_participants").insert({
          match_id: match.id,
          user_id: user.id,
          slot: filled + 1,
          is_organizer: false,
          confirmed: false,
        });
        joined = !error;
      }
    }
  }

  await supabase.from("match_invites").update({ status: "accepted" }).eq("id", invite.id);

  // Tell the organizer their invite was accepted.
  if (match && match.organizer_id && match.organizer_id !== user.id) {
    const { data: me } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
    const name = me?.display_name || "A player";
    await createNotification({
      userId: match.organizer_id,
      kind: "match_join",
      title: joined ? `${name} accepted your match invite` : `${name} responded to your invite`,
      body: joined
        ? `${sportMeta(match.sport_key).name} · they're on your roster.`
        : `${sportMeta(match.sport_key).name} · the match was full, so they couldn't join.`,
      linkUrl: `/play/${match.id}`,
    });
  }

  revalidatePath("/invites");
  if (match) revalidatePath(`/play/${match.id}`);
}

// Invitee declines.
export async function declineMatchInvite(formData: FormData) {
  const inviteId = String(formData.get("inviteId"));
  const { supabase, user } = await ctx();
  if (!user) redirect("/login?next=/invites");
  await supabase
    .from("match_invites")
    .update({ status: "declined" })
    .eq("id", inviteId)
    .eq("invited_user_id", user.id);
  revalidatePath("/invites");
}

// Organizer cancels a pending invite they sent.
export async function cancelMatchInvite(formData: FormData) {
  const inviteId = String(formData.get("inviteId"));
  const { supabase, user } = await ctx();
  if (!user) redirect("/login?next=/play");
  await supabase.from("match_invites").delete().eq("id", inviteId).eq("invited_by", user.id);
  revalidatePath("/invites");
  const matchId = String(formData.get("matchId") || "");
  if (matchId) revalidatePath(`/play/${matchId}`);
}

/** Waitlist offer: claim the reserved spot within the window. */
export async function confirmWaitlistSpot(formData: FormData) {
  const id = String(formData.get("matchId"));
  const { user } = await ctx();
  if (!user) redirect(`/login?next=/play/${id}`);
  await confirmOffer(id, user.id);
  revalidatePath(`/play/${id}`);
  revalidatePath("/play");
}

/** Waitlist offer: pass — the spot cascades to the next in line. */
export async function declineWaitlistSpot(formData: FormData) {
  const id = String(formData.get("matchId"));
  const { user } = await ctx();
  if (!user) redirect(`/login?next=/play/${id}`);
  await declineOffer(id, user.id);
  revalidatePath(`/play/${id}`);
  revalidatePath("/play");
}
