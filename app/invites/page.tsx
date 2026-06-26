import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Inbox, BadgeCheck, Check, X, Clock, Users, Swords } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { sportMeta } from "@/lib/sports";
import { Avatar } from "@/components/avatar";
import { acceptFriendRequest, removeFriend } from "@/app/network/actions";
import { respondTeamInvite } from "@/app/teams/actions";
import { acceptMatchInvite, declineMatchInvite, cancelMatchInvite } from "@/app/play/[id]/actions";

export const metadata: Metadata = { title: "Invites" };

type Prof = { id: string; display_name: string; avatar_hue: number; avatar_path: string | null; verification_status: string; primary_sport: string | null; neighborhood: string | null; city: string | null };
type Dir = "received" | "sent";
type Kind = "all" | "friends" | "teams" | "matches";

export default async function InvitesPage({ searchParams }: { searchParams: Promise<{ tab?: string; kind?: string }> }) {
  const sp = await searchParams;
  const dir: Dir = sp.tab === "sent" ? "sent" : "received";
  const kind: Kind = sp.kind === "friends" || sp.kind === "teams" || sp.kind === "matches" ? sp.kind : "all";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/invites");

  // Friend requests (both directions, pending).
  const [{ data: frIn }, { data: frOut }, { data: tiIn }, { data: tiOut }, { data: miIn }, { data: miOut }] = await Promise.all([
    supabase.from("friendships").select("requester_id, created_at").eq("addressee_id", user.id).eq("status", "pending"),
    supabase.from("friendships").select("addressee_id, created_at").eq("requester_id", user.id).eq("status", "pending"),
    supabase.from("team_invites").select("id, team_id, invited_by, created_at").eq("invited_user_id", user.id).eq("status", "pending"),
    supabase.from("team_invites").select("id, team_id, invited_user_id, created_at").eq("invited_by", user.id).eq("status", "pending"),
    supabase.from("match_invites").select("id, match_id, invited_by, created_at").eq("invited_user_id", user.id).eq("status", "pending"),
    supabase.from("match_invites").select("id, match_id, invited_user_id, created_at").eq("invited_by", user.id).eq("status", "pending"),
  ]);

  const friendInIds = (frIn ?? []).map((f) => f.requester_id);
  const friendOutIds = (frOut ?? []).map((f) => f.addressee_id);

  // Teams + matches referenced.
  const teamIds = [...new Set([...(tiIn ?? []).map((t) => t.team_id), ...(tiOut ?? []).map((t) => t.team_id)])];
  const matchIds = [...new Set([...(miIn ?? []).map((m) => m.match_id), ...(miOut ?? []).map((m) => m.match_id)])];
  const personIds = [...new Set([
    ...friendInIds,
    ...friendOutIds,
    ...(tiOut ?? []).map((t) => t.invited_user_id),
    ...(miIn ?? []).map((m) => m.invited_by),
    ...(miOut ?? []).map((m) => m.invited_user_id),
  ])];

  type MatchRow = { id: string; sport_key: string; scheduled_at: string | null; organizer_id: string; status: string; total_slots: number };
  const [teamRes, profRes, matchRes] = await Promise.all([
    teamIds.length ? supabase.from("teams").select("id, name, sport_key, city").in("id", teamIds) : Promise.resolve({ data: [] as { id: string; name: string; sport_key: string; city: string | null }[] }),
    personIds.length ? supabase.from("profiles").select("id, display_name, avatar_hue, avatar_path, verification_status, primary_sport, neighborhood, city").in("id", personIds) : Promise.resolve({ data: [] as Prof[] }),
    matchIds.length ? supabase.from("matches").select("id, sport_key, scheduled_at, organizer_id, status, total_slots").in("id", matchIds) : Promise.resolve({ data: [] as MatchRow[] }),
  ]);
  const teamMap = new Map(((teamRes.data as { id: string; name: string; sport_key: string; city: string | null }[] | null) ?? []).map((t) => [t.id, t]));
  const profMap = new Map(((profRes.data as Prof[] | null) ?? []).map((p) => [p.id, p]));
  const matchMap = new Map(((matchRes.data as MatchRow[] | null) ?? []).map((m) => [m.id, m]));
  const url = (p?: Prof) => (p?.avatar_path ? supabase.storage.from("avatars").getPublicUrl(p.avatar_path).data.publicUrl : null);

  const counts = {
    received: (frIn ?? []).length + (tiIn ?? []).length + (miIn ?? []).length,
    sent: (frOut ?? []).length + (tiOut ?? []).length + (miOut ?? []).length,
  };
  const showFriends = kind === "all" || kind === "friends";
  const showTeams = kind === "all" || kind === "teams";
  const showMatches = kind === "all" || kind === "matches";

  const TABS: { key: Dir; label: string }[] = [
    { key: "received", label: `Received ${counts.received}` },
    { key: "sent", label: `Sent ${counts.sent}` },
  ];
  const KINDS: { key: Kind; label: string }[] = [
    { key: "all", label: "All" },
    { key: "matches", label: "Matches" },
    { key: "friends", label: "Friends" },
    { key: "teams", label: "Teams" },
  ];

  const friendCards = dir === "received" ? friendInIds : friendOutIds;
  const teamCards = dir === "received" ? (tiIn ?? []) : (tiOut ?? []);
  const matchCards = dir === "received" ? (miIn ?? []) : (miOut ?? []);
  const nothing =
    (!showFriends || friendCards.length === 0) &&
    (!showTeams || teamCards.length === 0) &&
    (!showMatches || matchCards.length === 0);

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <div className="mb-5">
        <p className="kicker text-faint">Invites</p>
        <h1 className="font-display text-4xl leading-none text-ink sm:text-5xl">Matches &amp; friends</h1>
      </div>

      <div className="mb-3 flex gap-1.5">
        {TABS.map((t) => {
          const on = t.key === dir;
          return (
            <Link key={t.key} href={`/invites?tab=${t.key}&kind=${kind}`} className="press rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors"
              style={{ borderColor: on ? "#0a0a0b" : "#e4e4e7", background: on ? "#0a0a0b" : "transparent", color: on ? "#fff" : "#71717a" }}>
              {t.label}
            </Link>
          );
        })}
      </div>
      <div className="mb-5 flex gap-1.5">
        {KINDS.map((k) => {
          const on = k.key === kind;
          return (
            <Link key={k.key} href={`/invites?tab=${dir}&kind=${k.key}`} className="press rounded-full border px-3 py-1 text-xs font-semibold transition-colors"
              style={{ borderColor: on ? "#ff4e1b" : "#e4e4e7", background: on ? "#fff1ed" : "transparent", color: on ? "#d63a0f" : "#71717a" }}>
              {k.label}
            </Link>
          );
        })}
      </div>

      {nothing ? (
        <div className="rounded-2xl border border-rule bg-surface p-10 text-center">
          <Inbox size={26} className="mx-auto text-faint" />
          <p className="mx-auto mt-3 max-w-sm text-sm text-mute">
            {dir === "received" ? "No pending invites. Match invites, friend requests, and team invitations will show up here." : "You haven’t sent any pending invites."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Friend invites */}
          {showFriends && friendCards.map((pid) => {
            const p = profMap.get(pid);
            const m = p?.primary_sport ? sportMeta(p.primary_sport) : null;
            return (
              <div key={`f-${pid}`} className="rounded-2xl border border-rule bg-surface p-4">
                <span className="kicker text-brand-deep">Friend {dir === "received" ? "request" : "invite sent"}</span>
                <div className="mt-2 flex items-center gap-3">
                  <Link href={`/profile/${pid}`}><Avatar url={url(p)} hue={p?.avatar_hue ?? 200} name={p?.display_name ?? "Player"} size={44} /></Link>
                  <Link href={`/profile/${pid}`} className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-bold text-ink">{p?.display_name ?? "Player"}</span>
                      {p?.verification_status === "verified" ? <BadgeCheck size={14} className="shrink-0 text-brand" /> : null}
                    </span>
                    <span className="block truncate text-xs text-mute">{m ? `${m.emoji} ${m.name}` : ""}{p?.city ? ` · ${p.city}` : ""}</span>
                  </Link>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  {dir === "received" ? (
                    <>
                      <form action={acceptFriendRequest}>
                        <input type="hidden" name="userId" value={pid} />
                        <button className="press inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-deep"><Check size={15} /> Accept</button>
                      </form>
                      <form action={removeFriend}>
                        <input type="hidden" name="userId" value={pid} />
                        <button className="press inline-flex items-center gap-1.5 rounded-full border border-rule px-4 py-2 text-sm font-semibold text-mute transition-colors hover:text-ink"><X size={15} /> Decline</button>
                      </form>
                    </>
                  ) : (
                    <form action={removeFriend}>
                      <input type="hidden" name="userId" value={pid} />
                      <button className="press inline-flex items-center gap-1.5 rounded-full border border-rule px-4 py-2 text-sm font-semibold text-mute transition-colors hover:text-ink"><Clock size={14} /> Pending · cancel</button>
                    </form>
                  )}
                </div>
              </div>
            );
          })}

          {/* Team invites */}
          {showTeams && teamCards.map((ti) => {
            const t = teamMap.get(ti.team_id);
            if (!t) return null;
            const m = sportMeta(t.sport_key);
            const invitee = dir === "sent" && "invited_user_id" in ti ? profMap.get((ti as { invited_user_id: string }).invited_user_id) : null;
            return (
              <div key={`t-${ti.id}`} className="rounded-2xl border border-rule bg-surface p-4">
                <span className="kicker text-brand-deep">Team {dir === "received" ? "invitation" : "invite sent"}</span>
                <div className="mt-2 flex items-center gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-tint-brand text-xl">{m.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/teams/${t.id}`} className="block truncate text-sm font-bold text-ink hover:underline">{t.name}</Link>
                    <span className="block truncate text-xs text-mute">
                      {m.name}{t.city ? ` · ${t.city}` : ""}{invitee ? ` · to ${invitee.display_name}` : ""}
                    </span>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  {dir === "received" ? (
                    <>
                      <form action={respondTeamInvite}>
                        <input type="hidden" name="inviteId" value={ti.id} />
                        <input type="hidden" name="decision" value="accept" />
                        <button className="press inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-deep"><Check size={15} /> Accept</button>
                      </form>
                      <form action={respondTeamInvite}>
                        <input type="hidden" name="inviteId" value={ti.id} />
                        <input type="hidden" name="decision" value="decline" />
                        <button className="press inline-flex items-center gap-1.5 rounded-full border border-rule px-4 py-2 text-sm font-semibold text-mute transition-colors hover:text-ink"><X size={15} /> Decline</button>
                      </form>
                    </>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs text-faint"><Clock size={13} /> Awaiting response</span>
                  )}
                </div>
              </div>
            );
          })}

          {/* Match invites */}
          {showMatches && matchCards.map((mi) => {
            const mt = matchMap.get(mi.match_id);
            if (!mt) return null;
            const m = sportMeta(mt.sport_key);
            const when = mt.scheduled_at ? new Date(mt.scheduled_at) : null;
            const organizer = dir === "received" ? profMap.get((mi as { invited_by: string }).invited_by) : null;
            const invitee = dir === "sent" ? profMap.get((mi as { invited_user_id: string }).invited_user_id) : null;
            const closed = mt.status !== "open";
            return (
              <div key={`m-${mi.id}`} className="rounded-2xl border border-rule bg-surface p-4">
                <span className="kicker text-brand-deep">Match {dir === "received" ? "invite" : "invite sent"}</span>
                <div className="mt-2 flex items-center gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-tint-brand text-xl" aria-hidden>{m.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/play/${mt.id}`} className="block truncate text-sm font-bold text-ink hover:underline">{m.name} match</Link>
                    <span className="block truncate text-xs text-mute">
                      {when
                        ? `${when.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}, ${when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`
                        : "Time TBD"}
                      {organizer ? ` · by ${organizer.display_name}` : ""}
                      {invitee ? ` · to ${invitee.display_name}` : ""}
                    </span>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  {dir === "received" ? (
                    closed ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-faint"><Clock size={13} /> This match has closed</span>
                    ) : (
                      <>
                        <form action={acceptMatchInvite}>
                          <input type="hidden" name="inviteId" value={mi.id} />
                          <button className="press inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-deep"><Swords size={15} /> Accept &amp; join</button>
                        </form>
                        <form action={declineMatchInvite}>
                          <input type="hidden" name="inviteId" value={mi.id} />
                          <button className="press inline-flex items-center gap-1.5 rounded-full border border-rule px-4 py-2 text-sm font-semibold text-mute transition-colors hover:text-ink"><X size={15} /> Decline</button>
                        </form>
                      </>
                    )
                  ) : (
                    <form action={cancelMatchInvite}>
                      <input type="hidden" name="inviteId" value={mi.id} />
                      <input type="hidden" name="matchId" value={mt.id} />
                      <button className="press inline-flex items-center gap-1.5 rounded-full border border-rule px-4 py-2 text-sm font-semibold text-mute transition-colors hover:text-ink"><Clock size={14} /> Pending · cancel</button>
                    </form>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-faint">
        <Users size={12} /> Connect with players to invite them to teams and matches.
      </p>
    </div>
  );
}
