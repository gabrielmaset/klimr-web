import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { SportIcon } from "@/components/sport-icons";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { Crown, Users, MapPin } from "lucide-react";
import { BackButton } from "@/components/back-button";
import { createClient } from "@/lib/supabase/server";
import { sportMeta, teamSizeFor } from "@/lib/sports";
import { teamKit } from "@/lib/team-kit";
import { Avatar } from "@/components/avatar";
import { leaveTeam } from "../actions";
import { EditTeamForm } from "./EditTeamForm";
import { InviteSearch } from "./InviteSearch";
import { MemberControls } from "./MemberControls";

const ROLE_LABEL: Record<string, string> = { owner: "Owner", manager: "Manager", staff: "Staff" };
const DESIG_LABEL: Record<string, string> = { captain: "Captain", co_captain: "Co-captain", sub: "Sub" };

export const metadata: Metadata = { title: "Team" };

type Prof = { id: string; display_name: string; avatar_hue: number; avatar_path: string | null };

export default async function TeamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/teams/${id}`);

  const { data: team } = await supabase
    .from("teams")
    .select("id, name, sport_key, city, state, zip, max_size, category, created_by, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!team) notFound();
  const isPro = team.category === "pro";

  const meta = sportMeta(team.sport_key);
  const sz = teamSizeFor(team.sport_key);
  const cap = team.max_size ?? sz.max;

  const { data: memberRows } = await supabase.from("team_members").select("user_id, role, designation, joined_at").eq("team_id", id).order("joined_at");
  const members = memberRows ?? [];
  const myRole = members.find((m) => m.user_id === user.id)?.role ?? null;
  const isOwner = myRole === "owner";
  const canManage = myRole === "owner" || myRole === "manager";
  const canInviteMembers = canManage || myRole === "staff";
  const memberIds = members.map((m) => m.user_id);
  const amMember = memberIds.includes(user.id);

  const profById = new Map<string, Prof>();
  if (memberIds.length) {
    const { data: profs } = await supabase.from("profiles").select("id, display_name, avatar_hue, avatar_path").in("id", memberIds);
    for (const p of (profs as Prof[] | null) ?? []) profById.set(p.id, p);
  }
  const avatarUrl = (p: Prof | undefined) =>
    p?.avatar_path ? supabase.storage.from("avatars").getPublicUrl(p.avatar_path).data.publicUrl : null;

  // Combined team stats for the team's sport.
  let totalMatches = 0;
  let totalWins = 0;
  if (memberIds.length) {
    const { data: ps } = await supabase
      .from("player_sports")
      .select("matches_played, wins")
      .eq("sport_key", team.sport_key)
      .in("user_id", memberIds);
    for (const row of ps ?? []) {
      totalMatches += row.matches_played ?? 0;
      totalWins += row.wins ?? 0;
    }
  }

  // Captain-only: friends to invite + pending invites. You can only add people
  // you're already connected with (friendship requires approval).
  type FriendForInvite = { id: string; display_name: string; avatar_hue: number; avatar_url: string | null; city: string | null };
  let friendsForInvite: FriendForInvite[] = [];
  let pendingInvitees: Prof[] = [];
  if (canInviteMembers) {
    const [{ data: fr }, { data: pend }] = await Promise.all([
      supabase.from("friendships").select("requester_id, addressee_id").or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`).eq("status", "accepted"),
      supabase.from("team_invites").select("invited_user_id").eq("team_id", id).eq("status", "pending"),
    ]);
    const friendIds = (fr ?? []).map((f) => (f.requester_id === user.id ? f.addressee_id : f.requester_id));
    const pendingIds = new Set((pend ?? []).map((p) => p.invited_user_id));
    const candidateIds = friendIds.filter((fid) => !memberIds.includes(fid) && !pendingIds.has(fid));

    const lookupIds = [...new Set([...candidateIds, ...pendingIds])];
    if (lookupIds.length) {
      const { data: profs } = await supabase.from("profiles").select("id, display_name, avatar_hue, avatar_path, city").in("id", lookupIds);
      type FullProf = Prof & { city: string | null };
      const map = new Map(((profs as FullProf[] | null) ?? []).map((p) => [p.id, p]));
      friendsForInvite = candidateIds
        .map((cid) => map.get(cid))
        .filter(Boolean)
        .map((p) => ({
          id: p!.id,
          display_name: p!.display_name,
          avatar_hue: p!.avatar_hue,
          avatar_url: p!.avatar_path ? supabase.storage.from("avatars").getPublicUrl(p!.avatar_path).data.publicUrl : null,
          city: p!.city,
        }));
      pendingInvitees = [...pendingIds].map((pid) => map.get(pid)).filter(Boolean) as Prof[];
    }
  }


  const kit = teamKit(team.name);
  const initials = (team.name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("") || team.name.slice(0, 2)).toUpperCase();
  const founded = team.created_at ? new Date(team.created_at).getFullYear() : null;
  const winPct = totalMatches > 0 ? Math.round((totalWins / totalMatches) * 100) : null;
  const placeStr = [team.city, team.state].filter(Boolean).join(", ");
  return (
    <div className="mx-auto max-w-page px-5 py-6 sm:py-8">
      <Breadcrumbs items={[{ label: "Teams", href: "/teams" }, { label: team.name }]} />
      <BackButton fallback="/teams" label="Teams" className="press mb-4 inline-flex items-center gap-1 text-sm font-semibold text-mute hover:text-ink" size={15} />

      {/* ===== crest banner — the club's billboard ===== */}
      <div className="relative overflow-hidden rounded-[1.75rem] p-6 sm:p-9" style={{ background: `linear-gradient(125deg, ${kit.deep} 0%, ${kit.primary} 58%, ${kit.primary} 100%)` }}>
        <span aria-hidden className="pointer-events-none absolute -right-8 -top-12 select-none opacity-[0.13]"><SportIcon sport={team.sport_key} variant="hero" size={240} className="h-auto w-40 sm:w-60" /></span>
        <span aria-hidden className="pointer-events-none absolute inset-y-0 right-[16%] w-20 -skew-x-12 sm:w-36" style={{ background: kit.bright, opacity: 0.2 }} />
        <span aria-hidden className="pointer-events-none absolute inset-y-0 right-[10%] w-6 -skew-x-12 sm:w-10" style={{ background: kit.bright, opacity: 0.32 }} />
        <span aria-hidden className="pointer-events-none absolute -left-12 -top-12 h-56 w-56 rounded-full blur-3xl" style={{ background: kit.glow }} />

        <div className="relative">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-white/85">
            <span className="font-athletic text-xs uppercase tracking-[0.2em]">{meta.name}</span>
            <span className="h-1 w-1 rounded-full bg-white/40" />
            <span className="font-athletic text-xs uppercase tracking-[0.2em]">{isPro ? "Pro club" : "Recreational"}</span>
          </div>

          <div className="mt-3 flex items-start gap-4">
            <span className="hidden shrink-0 place-items-center rounded-2xl border-2 border-white/25 bg-white/10 sm:grid" style={{ height: 78, width: 78 }}>
              <span className="font-athletic text-3xl font-bold uppercase text-white">{initials}</span>
            </span>
            <div className="min-w-0">
              <h1 className="font-athletic text-[2.75rem] font-bold uppercase leading-[0.88] text-white sm:text-7xl">{team.name}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-white/85">
                <span className="inline-flex items-center gap-1.5"><Users size={14} /> {members.length}<span className="text-white/50">/{cap} squad</span></span>
                {placeStr ? <span className="inline-flex items-center gap-1.5"><MapPin size={14} /> {placeStr}</span> : null}
                {founded ? <span className="font-athletic uppercase tracking-wider text-white/70">Est. {founded}</span> : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== scoreboard ===== */}
      <div className="mt-3 grid grid-cols-2 overflow-hidden rounded-2xl bg-ink sm:grid-cols-4">
        {[
          { label: "Matches", value: String(totalMatches) },
          { label: "Wins", value: String(totalWins) },
          { label: "Win %", value: winPct === null ? "—" : `${winPct}%` },
          { label: "Squad", value: `${members.length}/${cap}` },
        ].map((cell, i) => (
          <div
            key={cell.label}
            className={`px-4 py-4 sm:px-5 sm:py-5 ${i === 1 ? "border-l border-white/10" : ""} ${i === 2 ? "border-t border-white/10 sm:border-l sm:border-t-0" : ""} ${i === 3 ? "border-l border-t border-white/10 sm:border-t-0" : ""}`}
          >
            <div className="font-athletic text-[10px] uppercase tracking-[0.18em] text-white/45">{cell.label}</div>
            <div className="mt-1 font-mono text-3xl font-bold tabular-nums text-white sm:text-[2.5rem] sm:leading-none" style={{ textShadow: `0 0 18px ${kit.glow}` }}>{cell.value}</div>
          </div>
        ))}
      </div>

      {members.length < sz.min ? (
        <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-l-4 border-rule bg-surface px-4 py-3 text-sm" style={{ borderLeftColor: kit.primary }}>
          <Users size={16} className="mt-0.5 shrink-0" style={{ color: kit.primary }} />
          <span className="text-ink-soft">Still forming — add {sz.min - members.length} more {sz.min - members.length === 1 ? "player" : "players"} (minimum {sz.min}) to start competing and entering tournaments.</span>
        </div>
      ) : null}

      {isPro && amMember ? (
        <Link href={`/team/${team.id}`} className="press mt-4 inline-flex items-center gap-1.5 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-surface transition-colors hover:bg-ink-soft">
          Open team workspace →
        </Link>
      ) : null}

      {/* ===== squad ===== */}
      <section className="mt-8">
        <div className="mb-3 flex items-baseline gap-2">
          <h2 className="font-athletic text-xl font-bold uppercase tracking-wide text-ink">Squad</h2>
          <span className="font-mono text-xs text-faint">{members.length} {members.length === 1 ? "player" : "players"}</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((m, i) => {
            const p = profById.get(m.user_id);
            const num = i + 1;
            const isCaptain = m.designation === "captain";
            const showControls = canManage && m.user_id !== user.id && m.role !== "owner" && !(myRole === "manager" && m.role === "manager");
            return (
              <div key={m.user_id} className="relative overflow-hidden rounded-2xl border border-rule bg-surface shadow-e1 p-4">
                <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: kit.primary }} />
                <span aria-hidden className="pointer-events-none absolute -bottom-5 right-0 select-none font-athletic text-7xl font-bold leading-none" style={{ color: kit.primary, opacity: 0.09 }}>{num}</span>
                {showControls ? (
                  <div className="absolute right-2 top-2.5 z-10">
                    <MemberControls teamId={team.id} userId={m.user_id} name={p?.display_name ?? "Player"} role={m.role} designation={m.designation} viewerIsOwner={isOwner} isPro={isPro} />
                  </div>
                ) : null}
                <div className="relative flex items-center gap-3">
                  <Link href={`/profile/${m.user_id}`} className="press relative shrink-0">
                    <Avatar url={avatarUrl(p)} hue={p?.avatar_hue ?? 200} name={p?.display_name ?? "Player"} size={46} />
                    {isCaptain ? (
                      <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full border-2 border-surface font-athletic text-[10px] font-bold text-white" style={{ background: kit.primary }}>C</span>
                    ) : null}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <Link href={`/profile/${m.user_id}`} className="press truncate text-sm font-bold text-ink">{p?.display_name ?? "Player"}</Link>
                      {m.role === "owner" ? <Crown size={13} className="shrink-0 text-pop" aria-label={isPro ? "Owner" : "Team manager"} /> : null}
                      {m.user_id === user.id ? <span className="text-[11px] text-faint">· you</span> : null}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-1">
                      {isPro && ROLE_LABEL[m.role] ? (
                        <span className="font-athletic rounded-full bg-bg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-soft">{ROLE_LABEL[m.role]}</span>
                      ) : null}
                      {!isPro && m.role === "owner" ? (
                        <span className="font-athletic rounded-full bg-bg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-soft">Team manager</span>
                      ) : null}
                      {m.designation && DESIG_LABEL[m.designation] ? (
                        <span className="font-athletic rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white" style={{ background: kit.primary }}>{DESIG_LABEL[m.designation]}</span>
                      ) : null}
                      {!isPro && m.role !== "owner" && !m.designation ? (
                        <span className="font-athletic rounded-full bg-bg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-mute">Player</span>
                      ) : null}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ===== add players (captains) ===== */}
      {canInviteMembers ? (
        <section className="mt-8">
          <h2 className="font-athletic mb-3 text-xl font-bold uppercase tracking-wide text-ink">Add players</h2>
          {members.length + pendingInvitees.length >= cap ? (
            <p className="rounded-2xl border border-rule bg-bg/40 px-4 py-4 text-sm text-mute">
              This team is full — all {cap} spots are taken. Remove a player, or raise the squad size in <span className="font-semibold text-ink">Manage team</span>, to add more.
            </p>
          ) : (
            <>
              <InviteSearch teamId={team.id} friends={friendsForInvite} />
              {pendingInvitees.length > 0 ? (
                <p className="mt-3 text-xs text-mute">Invited &amp; pending: {pendingInvitees.map((p) => p.display_name).join(", ")}</p>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {/* ===== manage team (managers) ===== */}
      {canManage ? (
        <section className="mt-8 rounded-2xl border border-rule bg-surface shadow-e1 p-5">
          <h2 className="font-athletic mb-3 text-xl font-bold uppercase tracking-wide text-ink">Manage team</h2>
          <EditTeamForm teamId={team.id} name={team.name} zip={team.zip ?? ""} city={team.city ?? ""} state={team.state ?? ""} sportKey={team.sport_key} maxSize={team.max_size ?? sz.default} memberCount={members.length} />
        </section>
      ) : null}

      {/* ===== team / club structure ===== */}
      <section className="mt-8 rounded-2xl border border-rule bg-surface shadow-e1 p-5">
        <h2 className="font-athletic text-xl font-bold uppercase tracking-wide text-ink">{isPro ? "Club structure" : "Team structure"}</h2>
        <p className="mt-1 text-sm text-mute">
          {isPro
            ? "A verified player owns the team, and only verified players can join — so the identity guarantee extends to every name on the roster."
            : "Recreational teams stay simple: whoever created the team runs it, and everyone else just plays. Only verified players can join, so the identity guarantee still extends to every name on the roster."}
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {(isPro
            ? [
                { r: "Owner", d: "Full control · transfers ownership" },
                { r: "Manager", d: "Roster, scheduling, invites" },
                { r: "Staff", d: "Support role · can invite" },
                { r: "Member", d: "Captain · Co-captain · Sub" },
              ]
            : [
                { r: "Team manager", d: "Runs the team · whoever created it" },
                { r: "Player", d: "Everyone else on the squad" },
              ]
          ).map((row) => (
            <div key={row.r} className="flex items-center justify-between gap-3 rounded-xl border border-rule bg-bg px-4 py-3">
              <span className="font-athletic text-sm font-bold uppercase tracking-wider text-ink">{row.r}</span>
              <span className="text-right text-xs text-mute">{row.d}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ===== leave ===== */}
      {amMember ? (
        <form action={leaveTeam} className="mt-8">
          <input type="hidden" name="teamId" value={team.id} />
          <button className="press rounded-full border border-rule px-4 py-2 text-sm font-semibold text-mute transition-colors hover:border-brand/40 hover:text-brand-deep">
            {isOwner ? (isPro ? "Leave team (ownership passes on)" : "Leave team (team management passes on)") : "Leave team"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
