import Link from "next/link";
import { redirect } from "next/navigation";
import { Users, MapPin, IdCard, CalendarClock, MessageCircle, UserPlus, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { sportMeta } from "@/lib/sports";
import { TeamSticker } from "@/components/team-sticker";

type Prof = { id: string; display_name: string; avatar_hue: number; avatar_path: string | null; city: string | null };
type Stat = { points: number; skill: string | null; matches: number; wins: number };
type PsRow = { user_id: string; points: number; skill_level: string; matches_played: number; wins: number };

export default async function TeamHome({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/team/${teamId}`);

  const { data: team } = await supabase.from("teams").select("id, name, sport_key, city, neighborhood").eq("id", teamId).maybeSingle();
  if (!team) redirect("/teams");
  const meta = sportMeta(team.sport_key);
  const base = `/team/${teamId}`;

  const { data: memberRows } = await supabase.from("team_members").select("user_id, role, designation").eq("team_id", teamId).order("joined_at");
  const members = memberRows ?? [];
  const myRole = members.find((m) => m.user_id === user.id)?.role ?? "member";
  const canManage = myRole === "owner" || myRole === "manager";
  const memberIds = members.map((m) => m.user_id);

  const profById = new Map<string, Prof>();
  if (memberIds.length) {
    const { data: profs } = await supabase.from("profiles").select("id, display_name, avatar_hue, avatar_path, city").in("id", memberIds);
    for (const p of (profs as Prof[] | null) ?? []) profById.set(p.id, p);
  }
  const avatarUrl = (p: Prof | undefined) => (p?.avatar_path ? supabase.storage.from("avatars").getPublicUrl(p.avatar_path).data.publicUrl : null);

  const statById = new Map<string, Stat>();
  let totalMatches = 0;
  let totalWins = 0;
  if (memberIds.length) {
    const { data: ps } = await supabase.from("player_sports").select("user_id, points, skill_level, matches_played, wins").eq("sport_key", team.sport_key).in("user_id", memberIds);
    for (const r of (ps as PsRow[] | null) ?? []) {
      statById.set(r.user_id, { points: r.points ?? 0, skill: r.skill_level ?? null, matches: r.matches_played ?? 0, wins: r.wins ?? 0 });
      totalMatches += r.matches_played ?? 0;
      totalWins += r.wins ?? 0;
    }
  }
  const winRate = totalMatches > 0 ? Math.round((totalWins / totalMatches) * 100) : null;
  const place = [team.neighborhood, team.city].filter(Boolean).join(", ");

  const tiles = [
    { href: `${base}/profile`, label: "Team profile", desc: "Name, sport, area & bio", Icon: IdCard },
    { href: `${base}/roster`, label: "Roster", desc: `${members.length} ${members.length === 1 ? "member" : "members"}`, Icon: Users },
    { href: `${base}/matches`, label: "Matches", desc: "Schedule & results", Icon: CalendarClock },
    { href: `${base}/chat`, label: "Team chat", desc: "Everyone on the team", Icon: MessageCircle },
  ];

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 sm:py-10">
      {/* cover hero */}
      <div className="relative overflow-hidden rounded-3xl border border-rail-border bg-[linear-gradient(135deg,#0e2c3a,#0a212c)] p-5 sm:p-7">
        <span aria-hidden className="pointer-events-none absolute -right-4 -top-8 select-none text-[150px] leading-none opacity-[0.07]">{meta.emoji}</span>
        <span aria-hidden className="pointer-events-none absolute -left-10 bottom-0 h-44 w-44 rounded-full bg-brand/20 blur-3xl" />
        <div className="relative flex items-center gap-4">
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-3xl bg-white text-3xl shadow-[0_8px_20px_-8px_rgba(0,0,0,0.5)]">{meta.emoji}</span>
          <div className="min-w-0">
            <p className="kicker text-rail-active">Team workspace</p>
            <h1 className="truncate font-display text-3xl leading-tight text-white sm:text-4xl">{team.name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-rail-fg/80">
              <span>{meta.name}</span>
              <span className="flex items-center gap-1">
                <Users size={13} /> {members.length}
              </span>
              {place ? (
                <span className="flex items-center gap-1">
                  <MapPin size={13} /> {place}
                </span>
              ) : null}
            </p>
          </div>
        </div>
      </div>

      {/* stats */}
      <div className="mt-6 grid grid-cols-3 gap-3">
        {[
          { k: "Members", v: String(members.length) },
          { k: `${meta.name} matches`, v: String(totalMatches) },
          { k: "Win rate", v: winRate === null ? "—" : `${winRate}%` },
        ].map((s) => (
          <div key={s.k} className="rounded-2xl border border-rule bg-surface p-4">
            <p className="font-display text-2xl text-ink sm:text-3xl">{s.v}</p>
            <p className="mt-0.5 text-xs text-mute">{s.k}</p>
          </div>
        ))}
      </div>

      {/* quick links */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href} className="lift flex items-center gap-3 rounded-2xl border border-rule bg-surface p-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#f4f4f5] text-ink">
              <t.Icon size={19} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-ink">{t.label}</span>
              <span className="block truncate text-xs text-mute">{t.desc}</span>
            </span>
            <ArrowRight size={17} className="shrink-0 text-faint" />
          </Link>
        ))}
      </div>

      {/* squad preview */}
      <div className="mt-6 rounded-2xl border border-rule bg-surface p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold text-ink">Squad</h2>
          <Link href={`${base}/roster`} className="text-xs font-semibold text-brand-deep hover:underline">
            View all
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {members.slice(0, 7).map((m) => {
            const p = profById.get(m.user_id);
            const s = statById.get(m.user_id);
            return (
              <TeamSticker
                key={m.user_id}
                name={p?.display_name ?? "Player"}
                avatarUrl={avatarUrl(p)}
                hue={p?.avatar_hue ?? 200}
                role={m.role}
                designation={m.designation}
                city={p?.city ?? null}
                skillLevel={s?.skill ?? null}
                points={s ? s.points : null}
                wins={s ? s.wins : null}
                matches={s ? s.matches : null}
                isMe={m.user_id === user.id}
              />
            );
          })}
          {canManage ? (
            <Link
              href={`${base}/roster`}
              className="flex min-h-[176px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-rule text-mute transition-colors hover:border-brand hover:text-brand-deep"
            >
              <UserPlus size={20} />
              <span className="text-xs font-semibold">Invite players</span>
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
