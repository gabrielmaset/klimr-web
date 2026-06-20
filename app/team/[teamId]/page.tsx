import Link from "next/link";
import { redirect } from "next/navigation";
import { Users, MapPin, IdCard, CalendarClock, MessageCircle, UserPlus, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { sportMeta } from "@/lib/sports";
import { Avatar } from "@/components/avatar";

type Prof = { id: string; display_name: string; avatar_hue: number; avatar_path: string | null };

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
    const { data: profs } = await supabase.from("profiles").select("id, display_name, avatar_hue, avatar_path").in("id", memberIds);
    for (const p of (profs as Prof[] | null) ?? []) profById.set(p.id, p);
  }
  const avatarUrl = (p: Prof | undefined) => (p?.avatar_path ? supabase.storage.from("avatars").getPublicUrl(p.avatar_path).data.publicUrl : null);

  let totalMatches = 0;
  let totalWins = 0;
  if (memberIds.length) {
    const { data: ps } = await supabase.from("player_sports").select("matches_played, wins").eq("sport_key", team.sport_key).in("user_id", memberIds);
    for (const row of ps ?? []) {
      totalMatches += row.matches_played ?? 0;
      totalWins += row.wins ?? 0;
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
      {/* identity */}
      <div className="flex items-center gap-4">
        <span className="grid h-16 w-16 shrink-0 place-items-center rounded-3xl bg-tint-brand text-3xl">{meta.emoji}</span>
        <div className="min-w-0">
          <p className="kicker text-brand-deep">Team workspace</p>
          <h1 className="truncate font-display text-3xl leading-tight text-ink sm:text-4xl">{team.name}</h1>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-mute">
            <span>{meta.name}</span>
            <span className="flex items-center gap-1"><Users size={13} /> {members.length}</span>
            {place ? <span className="flex items-center gap-1"><MapPin size={13} /> {place}</span> : null}
          </p>
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

      {/* roster preview */}
      <div className="mt-6 rounded-2xl border border-rule bg-surface p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-ink">Roster</h2>
          <Link href={`${base}/roster`} className="text-xs font-semibold text-brand-deep hover:underline">View all</Link>
        </div>
        <div className="flex flex-wrap gap-3">
          {members.slice(0, 12).map((m) => {
            const p = profById.get(m.user_id);
            return (
              <div key={m.user_id} className="flex w-16 flex-col items-center gap-1 text-center">
                <Avatar url={avatarUrl(p)} hue={p?.avatar_hue ?? 200} name={p?.display_name ?? "Player"} size={40} />
                <span className="w-full truncate text-[11px] text-mute">{(p?.display_name ?? "Player").split(" ")[0]}</span>
              </div>
            );
          })}
          {canManage ? (
            <Link href={`${base}/roster`} className="lift flex w-16 flex-col items-center gap-1 text-center">
              <span className="grid h-10 w-10 place-items-center rounded-full border border-dashed border-rule text-mute">
                <UserPlus size={17} />
              </span>
              <span className="text-[11px] text-mute">Invite</span>
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
