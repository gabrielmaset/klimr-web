import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sportMeta } from "@/lib/sports";
import { InvitesBrowser, type InviteItem, type Dir, type Kind } from "@/components/invites-browser";

export const metadata: Metadata = { title: "Invites" };

type Prof = { id: string; display_name: string; avatar_hue: number; avatar_path: string | null; verification_status: string; primary_sport: string | null; neighborhood: string | null; city: string | null };
type TeamRow = { id: string; name: string; sport_key: string; city: string | null };
type MatchRow = { id: string; sport_key: string; scheduled_at: string | null; organizer_id: string; status: string; total_slots: number };

function whenLabel(iso: string | null): string {
  if (!iso) return "Time TBD";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Time TBD";
  return `${d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}, ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

export default async function InvitesPage({ searchParams }: { searchParams: Promise<{ tab?: string; kind?: string }> }) {
  const sp = await searchParams;
  const initialDir: Dir = sp.tab === "sent" ? "sent" : "received";
  const initialKind: Kind = sp.kind === "friends" || sp.kind === "teams" || sp.kind === "matches" ? sp.kind : "all";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/invites");

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
  const teamIds = [...new Set([...(tiIn ?? []).map((t) => t.team_id), ...(tiOut ?? []).map((t) => t.team_id)])];
  const matchIds = [...new Set([...(miIn ?? []).map((m) => m.match_id), ...(miOut ?? []).map((m) => m.match_id)])];
  const personIds = [...new Set([...friendInIds, ...friendOutIds, ...(tiOut ?? []).map((t) => t.invited_user_id), ...(miIn ?? []).map((m) => m.invited_by), ...(miOut ?? []).map((m) => m.invited_user_id)])];

  const [teamRes, profRes, matchRes] = await Promise.all([
    teamIds.length ? supabase.from("teams").select("id, name, sport_key, city").in("id", teamIds) : Promise.resolve({ data: [] as TeamRow[] }),
    personIds.length ? supabase.from("profiles").select("id, display_name, avatar_hue, avatar_path, verification_status, primary_sport, neighborhood, city").in("id", personIds) : Promise.resolve({ data: [] as Prof[] }),
    matchIds.length ? supabase.from("matches").select("id, sport_key, scheduled_at, organizer_id, status, total_slots").in("id", matchIds) : Promise.resolve({ data: [] as MatchRow[] }),
  ]);
  const teamMap = new Map(((teamRes.data as TeamRow[] | null) ?? []).map((t) => [t.id, t]));
  const profMap = new Map(((profRes.data as Prof[] | null) ?? []).map((p) => [p.id, p]));
  const matchMap = new Map(((matchRes.data as MatchRow[] | null) ?? []).map((m) => [m.id, m]));
  const url = (p?: Prof) => (p?.avatar_path ? supabase.storage.from("avatars").getPublicUrl(p.avatar_path).data.publicUrl : null);

  const items: InviteItem[] = [];

  const friendItem = (pid: string, dir: Dir): InviteItem => {
    const p = profMap.get(pid);
    const sm = p?.primary_sport ? sportMeta(p.primary_sport) : null;
    return {
      key: `f-${dir}-${pid}`,
      dir,
      kind: "friends",
      title: p?.display_name ?? "Player",
      sub: [sm ? sm.name : null, p?.city].filter(Boolean).join(" · ") || null,
      sportKey: p?.primary_sport ?? null,
      href: `/profile/${pid}`,
      avatarUrl: url(p),
      hue: p?.avatar_hue ?? 200,
      emoji: null,
      verified: p?.verification_status === "verified",
      friendUserId: pid,
      teamInviteId: null,
      matchInviteId: null,
      matchId: null,
      matchClosed: false,
    };
  };
  for (const pid of friendInIds) items.push(friendItem(pid, "received"));
  for (const pid of friendOutIds) items.push(friendItem(pid, "sent"));

  const teamItem = (id: string, teamId: string, dir: Dir, inviteeName: string | null): InviteItem | null => {
    const t = teamMap.get(teamId);
    if (!t) return null;
    const sm = sportMeta(t.sport_key);
    return {
      key: `t-${id}`,
      dir,
      kind: "teams",
      title: t.name,
      sub: [sm.name, t.city, inviteeName ? `to ${inviteeName}` : null].filter(Boolean).join(" · ") || null,
      sportKey: t.sport_key,
      href: `/teams/${t.id}`,
      avatarUrl: null,
      hue: 200,
      emoji: sm.emoji,
      verified: false,
      friendUserId: null,
      teamInviteId: id,
      matchInviteId: null,
      matchId: null,
      matchClosed: false,
    };
  };
  for (const ti of tiIn ?? []) {
    const it = teamItem(ti.id, ti.team_id, "received", null);
    if (it) items.push(it);
  }
  for (const ti of tiOut ?? []) {
    const it = teamItem(ti.id, ti.team_id, "sent", profMap.get(ti.invited_user_id)?.display_name ?? null);
    if (it) items.push(it);
  }

  const matchItem = (id: string, matchId: string, dir: Dir, counterpart: string | null): InviteItem | null => {
    const mt = matchMap.get(matchId);
    if (!mt) return null;
    const sm = sportMeta(mt.sport_key);
    return {
      key: `m-${id}`,
      dir,
      kind: "matches",
      title: `${sm.name} match`,
      sportKey: mt.sport_key,
      sub: [whenLabel(mt.scheduled_at), counterpart ? (dir === "received" ? `by ${counterpart}` : `to ${counterpart}`) : null].filter(Boolean).join(" · ") || null,
      href: `/play/${mt.id}`,
      avatarUrl: null,
      hue: 200,
      emoji: sm.emoji,
      verified: false,
      friendUserId: null,
      teamInviteId: null,
      matchInviteId: id,
      matchId: mt.id,
      matchClosed: mt.status !== "open",
    };
  };
  for (const mi of miIn ?? []) {
    const it = matchItem(mi.id, mi.match_id, "received", profMap.get(mi.invited_by)?.display_name ?? null);
    if (it) items.push(it);
  }
  for (const mi of miOut ?? []) {
    const it = matchItem(mi.id, mi.match_id, "sent", profMap.get(mi.invited_user_id)?.display_name ?? null);
    if (it) items.push(it);
  }

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <div className="mb-5">
        <p className="kicker text-faint">Invites</p>
        <h1 className="font-display text-4xl leading-none text-ink sm:text-5xl">Matches &amp; friends</h1>
        <p className="mt-1.5 text-sm text-mute">Match invites, friend requests, and team invitations — all in one place.</p>
      </div>
      <InvitesBrowser items={items} initialDir={initialDir} initialKind={initialKind} />
    </div>
  );
}
