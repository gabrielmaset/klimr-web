import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarClock, MapPin, Users, Repeat, BadgeCheck, Check, Lock, MessageCircle } from "lucide-react";
import { BackButton } from "@/components/back-button";
import { createClient } from "@/lib/supabase/server";
import { Avatar } from "@/components/avatar";
import { sportMeta } from "@/lib/sports";
import { joinMatch, leaveMatch, confirmSpot, joinWaitlist, leaveWaitlist, cancelMatch } from "./actions";
import { MatchInvite } from "./MatchInvite";

export const metadata: Metadata = { title: "Match" };

type Prof = { id: string; display_name: string; avatar_hue: number; verification_status: string };

function whenLabel(scheduledAt: string | null) {
  if (!scheduledAt) return "Open — anytime";
  return new Date(scheduledAt).toLocaleString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/play/${id}`);

  const { data: match } = await supabase.from("matches").select("*").eq("id", id).single();
  if (!match) notFound();

  let court: { id: string; name: string; address: string | null; lat: number | null; lng: number | null } | null = null;
  if (match.court_id) {
    const { data: c } = await supabase.from("courts").select("id, name, address, lat, lng").eq("id", match.court_id).maybeSingle();
    court = c ?? null;
  }

  const { data: partRows } = await supabase
    .from("match_participants")
    .select("user_id, slot, is_organizer, confirmed")
    .eq("match_id", id)
    .order("slot", { ascending: true });
  const participants = partRows ?? [];

  const ids = [...new Set([match.organizer_id, ...participants.map((p) => p.user_id)])];
  const { data: profRows } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_hue, verification_status")
    .in("id", ids);
  const profMap = new Map<string, Prof>(((profRows as Prof[] | null) ?? []).map((p) => [p.id, p]));

  const filled = participants.length;
  const full = filled >= match.total_slots;
  const isOrganizer = match.organizer_id === user.id;
  const myPart = participants.find((p) => p.user_id === user.id) ?? null;
  const isParticipant = !!myPart;
  const joinable = match.status === "open";

  const { data: wlRows } = await supabase
    .from("join_requests")
    .select("requester_id, waitlist_position")
    .eq("match_id", id)
    .eq("status", "waitlisted")
    .order("waitlist_position", { ascending: true });
  const waitlist = wlRows ?? [];
  const myWait = waitlist.find((w) => w.requester_id === user.id) ?? null;

  let wlProfMap = new Map<string, Prof>();
  if (isOrganizer && waitlist.length) {
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_hue, verification_status")
      .in("id", waitlist.map((w) => w.requester_id));
    wlProfMap = new Map<string, Prof>(((data as Prof[] | null) ?? []).map((p) => [p.id, p]));
  }

  const meta = sportMeta(match.sport_key);

  // Friends the organizer can still invite (accepted friends, not already on the
  // roster and not already invited) — only when there's room to fill.
  type InviteFriend = { id: string; display_name: string; avatar_hue: number; avatar_url: string | null; city: string | null };
  let inviteFriends: InviteFriend[] = [];
  if (isOrganizer && joinable && filled < match.total_slots) {
    const { data: fr } = await supabase
      .from("friendships")
      .select("requester_id, addressee_id")
      .eq("status", "accepted")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);
    const friendIds = [
      ...new Set(
        ((fr as { requester_id: string; addressee_id: string }[] | null) ?? []).map((r) =>
          r.requester_id === user.id ? r.addressee_id : r.requester_id,
        ),
      ),
    ];
    const partSet = new Set(participants.map((p) => p.user_id));
    const { data: inv } = await supabase
      .from("match_invites")
      .select("invited_user_id")
      .eq("match_id", id)
      .in("status", ["pending", "accepted"]);
    const invSet = new Set(((inv as { invited_user_id: string }[] | null) ?? []).map((i) => i.invited_user_id));
    const candidateIds = friendIds.filter((fid) => !partSet.has(fid) && !invSet.has(fid));
    if (candidateIds.length) {
      type FP = { id: string; display_name: string; avatar_hue: number | null; avatar_path: string | null; city: string | null };
      const { data: fp } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_hue, avatar_path, city")
        .in("id", candidateIds);
      inviteFriends = ((fp as FP[] | null) ?? []).map((p) => ({
        id: p.id,
        display_name: p.display_name,
        avatar_hue: p.avatar_hue ?? 200,
        avatar_url: p.avatar_path ? supabase.storage.from("avatars").getPublicUrl(p.avatar_path).data.publicUrl : null,
        city: p.city ?? null,
      }));
    }
  }

  const statusLabel = !joinable
    ? match.status[0].toUpperCase() + match.status.slice(1)
    : full
      ? "Roster full"
      : "Open — joining";
  const statusColor = !joinable ? "#71717a" : full ? "#71717a" : "#d63a0f";
  const statusBg = !joinable || full ? "#f4f4f5" : "#fff1ed";

  const slots = Array.from({ length: match.total_slots }, (_, i) => participants[i] ?? null);

  const courtName = court?.name ?? null;
  const courtMaps =
    court && court.lat != null && court.lng != null
      ? `https://www.google.com/maps/search/?api=1&query=${court.lat},${court.lng}`
      : null;

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <BackButton fallback="/play" label="All matches" className="press inline-flex items-center gap-1.5 text-sm text-mute transition-colors hover:text-ink" icon="arrow" size={15} />

      {/* header */}
      <div className="mt-4 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-4xl" aria-hidden>{meta.emoji}</span>
            <div>
              <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">
                {meta.name} · {match.format === "doubles" ? "Doubles" : "Singles"}
              </h1>
              <p className="mt-1 text-sm text-mute">Organized by {profMap.get(match.organizer_id)?.display_name ?? "a player"}</p>
            </div>
          </div>
        </div>
        <span className="kicker shrink-0 rounded-full px-2.5 py-1 text-[9px]" style={{ background: statusBg, color: statusColor }}>
          {statusLabel}
        </span>
      </div>

      {/* meta */}
      <div className="mt-6 grid gap-3 rounded-2xl border border-rule bg-surface p-5 sm:grid-cols-2">
        <div className="flex items-center gap-2.5 text-sm text-ink"><CalendarClock size={16} className="shrink-0 text-faint" /> {whenLabel(match.scheduled_at)}</div>
        <div className="flex items-center gap-2.5 text-sm text-ink"><Users size={16} className="shrink-0 text-faint" /> {filled}/{match.total_slots} players</div>
        {courtName ? (
          courtMaps ? (
            <a href={courtMaps} target="_blank" rel="noopener noreferrer" className="press flex items-center gap-2.5 text-sm text-ink transition-colors hover:text-brand-deep">
              <MapPin size={16} className="shrink-0 text-faint" /> <span className="truncate">{courtName}{match.location_text ? ` · ${match.location_text}` : ""}</span>
            </a>
          ) : (
            <div className="flex items-center gap-2.5 text-sm text-ink"><MapPin size={16} className="shrink-0 text-faint" /> <span className="truncate">{courtName}{match.location_text ? ` · ${match.location_text}` : ""}</span></div>
          )
        ) : match.location_text ? (
          <div className="flex items-center gap-2.5 text-sm text-ink"><MapPin size={16} className="shrink-0 text-faint" /> {match.location_text}</div>
        ) : null}
        {match.recurring ? (
          <div className="flex items-center gap-2.5 text-sm text-ink"><Repeat size={16} className="shrink-0 text-faint" /> {match.recurrence === "biweekly" ? "Repeats every 2 weeks" : match.recurrence === "monthly" ? "Repeats monthly" : match.recurrence === "weekly" ? "Repeats weekly" : "Recurring game"}</div>
        ) : null}
      </div>

      {/* roster */}
      <div className="mt-6">
        <div className="kicker mb-3 text-faint">Roster</div>
        <div className="grid gap-3 sm:grid-cols-2">
          {slots.map((p, i) => {
            if (!p) {
              return (
                <div key={`empty-${i}`} className="flex items-center gap-3 rounded-xl border border-dashed border-rule px-4 py-3 text-sm text-faint">
                  <span className="grid h-9 w-9 place-items-center rounded-full border border-dashed border-rule text-faint">{i + 1}</span>
                  Open slot
                </div>
              );
            }
            const prof = profMap.get(p.user_id);
            const you = p.user_id === user.id;
            return (
              <Link
                key={p.user_id}
                href={`/profile/${p.user_id}`}
                className="lift flex items-center gap-3 rounded-xl border px-4 py-3"
                style={{ background: you ? "#fff1ed" : "#ffffff", borderColor: you ? "#ff4e1b" : "#e4e4e7" }}
              >
                <Avatar url={null} hue={prof?.avatar_hue ?? 200} name={prof?.display_name ?? "Player"} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-bold text-ink">{you ? "You" : prof?.display_name ?? "Player"}</span>
                    {prof?.verification_status === "verified" ? <BadgeCheck size={13} className="shrink-0 text-brand" aria-label="Verified" /> : null}
                  </div>
                  <div className="text-xs text-faint">
                    {p.is_organizer ? "Organizer" : p.confirmed ? "Confirmed" : "Joined"}
                  </div>
                </div>
                {p.confirmed ? <Check size={15} className="shrink-0 text-success" aria-label="Confirmed" /> : null}
              </Link>
            );
          })}
        </div>
      </div>

      {/* invite friends — organizer only, when there's room */}
      {isOrganizer && joinable && filled < match.total_slots ? (
        <div className="mt-6">
          <div className="kicker mb-3 text-faint">Invite friends</div>
          <MatchInvite matchId={id} friends={inviteFriends} />
        </div>
      ) : null}

      {/* action area */}
      <div className="mt-6 rounded-2xl border border-rule bg-surface p-5">
        {isParticipant ? (
          isOrganizer ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-ink">You&rsquo;re the organizer of this match.</p>
              <form action={cancelMatch}>
                <input type="hidden" name="matchId" value={id} />
                <button className="press rounded-full border border-rule px-4 py-2 text-sm font-semibold text-mute transition-colors hover:border-faint hover:text-ink">
                  Cancel match
                </button>
              </form>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-ink">You&rsquo;re in this match{myPart && !myPart.confirmed ? " — confirm so the organizer knows you're coming." : "."}</p>
              <div className="flex items-center gap-2">
                {myPart && !myPart.confirmed ? (
                  <form action={confirmSpot}>
                    <input type="hidden" name="matchId" value={id} />
                    <button className="press rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-deep">
                      Confirm
                    </button>
                  </form>
                ) : null}
                <form action={leaveMatch}>
                  <input type="hidden" name="matchId" value={id} />
                  <button className="press rounded-full border border-rule px-4 py-2 text-sm font-semibold text-mute transition-colors hover:border-faint hover:text-ink">
                    Leave
                  </button>
                </form>
              </div>
            </div>
          )
        ) : !joinable ? (
          <p className="text-sm text-mute">This match is {match.status}. Joining is closed.</p>
        ) : !full ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink">{match.total_slots - filled} spot{match.total_slots - filled === 1 ? "" : "s"} open. Jump in.</p>
            <form action={joinMatch}>
              <input type="hidden" name="matchId" value={id} />
              <button className="press rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-surface transition-colors hover:bg-ink-soft">
                Join match
              </button>
            </form>
          </div>
        ) : myWait ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink">You&rsquo;re <b>#{myWait.waitlist_position}</b> on the waitlist. We&rsquo;ll hold your place if a spot opens.</p>
            <form action={leaveWaitlist}>
              <input type="hidden" name="matchId" value={id} />
              <button className="press rounded-full border border-rule px-4 py-2 text-sm font-semibold text-mute transition-colors hover:border-faint hover:text-ink">
                Leave waitlist
              </button>
            </form>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink">This match is full — join the waitlist and you&rsquo;re next in line.</p>
            <form action={joinWaitlist}>
              <input type="hidden" name="matchId" value={id} />
              <button className="press rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-surface transition-colors hover:bg-ink-soft">
                Join waitlist
              </button>
            </form>
          </div>
        )}
      </div>

      {/* match chat (participants only) */}
      {isParticipant ? (
        <Link href={`/chats/${id}`} className="lift mt-4 flex items-center gap-3 rounded-2xl border border-rule bg-surface p-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-tint-brand text-brand-deep">
            <MessageCircle size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-ink">Match chat</span>
            <span className="block text-xs text-mute">End-to-end encrypted group chat for these players</span>
          </span>
          <Lock size={14} className="shrink-0 text-faint" />
        </Link>
      ) : null}

      {/* waitlist (organizer view) */}
      {isOrganizer && waitlist.length ? (
        <div className="mt-6">
          <div className="kicker mb-3 text-faint">Waitlist · {waitlist.length}</div>
          <div className="space-y-2">
            {waitlist.map((w) => {
              const prof = wlProfMap.get(w.requester_id);
                return (
                  <Link key={w.requester_id} href={`/profile/${w.requester_id}`} className="lift flex items-center gap-3 rounded-xl border border-rule bg-surface px-4 py-2.5">
                    <span className="font-mono text-xs font-bold text-faint">#{w.waitlist_position}</span>
                    <Avatar url={null} hue={prof?.avatar_hue ?? 200} name={prof?.display_name ?? "Player"} size={32} />
                    <span className="flex-1 truncate text-sm font-semibold text-ink">{prof?.display_name ?? "Player"}</span>
                    {prof?.verification_status === "verified" ? <BadgeCheck size={13} className="text-brand" aria-label="Verified" /> : null}
                  </Link>
                );
            })}
          </div>
        </div>
      ) : null}

      <p className="mt-6 text-center text-xs text-faint">
        Score and confirm results from the Klimr app — live scoring is coming to mobile.
      </p>
    </div>
  );
}
