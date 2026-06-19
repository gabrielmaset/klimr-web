import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgeCheck, MapPin, Pencil, Trophy, CalendarClock, Swords, ArrowUpRight, ShieldCheck, Users, CalendarDays, Crown } from "lucide-react";
import { displayAge } from "@/lib/age";
import { createClient } from "@/lib/supabase/server";
import { Avatar } from "@/components/avatar";
import { CoverUploader } from "@/components/cover-uploader";
import { sportMeta, SPORTS } from "@/lib/sports";

export const metadata: Metadata = { title: "My profile" };

type PS = { sport_key: string; points: number; skill_rating: number | null; matches_played: number; wins: number };
type MatchRow = { id: string; sport_key: string; format: string; scheduled_at: string | null; status: string; location_text: string | null };

function whenLabel(iso: string | null) {
  if (!iso) return "Open / anytime";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " · " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default async function MyProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/me");

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "display_name, avatar_hue, avatar_path, cover_path, verification_status, home_zip, neighborhood, city, state, country, primary_sport, bio, created_at, date_of_birth, birth_year",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) redirect("/account");

  const hue = profile.avatar_hue ?? 18;
  const avatarUrl = profile.avatar_path ? supabase.storage.from("avatars").getPublicUrl(profile.avatar_path).data.publicUrl : null;
  const coverUrl = profile.cover_path ? supabase.storage.from("avatars").getPublicUrl(profile.cover_path).data.publicUrl : null;
  const verified = profile.verification_status === "verified";
  const place = [profile.neighborhood, profile.city, profile.state].filter(Boolean).join(", ") || profile.home_zip || "Location not set";
  const memberSince = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : null;
  const age = displayAge(profile.date_of_birth, profile.birth_year);

  const { data: psData } = await supabase
    .from("player_sports")
    .select("sport_key, points, skill_rating, matches_played, wins")
    .eq("user_id", user.id);
  const sports = (psData as PS[] | null) ?? [];
  const order: string[] = SPORTS.map((s) => s.key);
  sports.sort((a, b) => {
    if (a.sport_key === profile.primary_sport) return -1;
    if (b.sport_key === profile.primary_sport) return 1;
    return order.indexOf(a.sport_key) - order.indexOf(b.sport_key);
  });

  // Recent matches the player organized or joined.
  const { data: parts } = await supabase.from("match_participants").select("match_id").eq("user_id", user.id);
  const matchIds = [...new Set((parts ?? []).map((p) => p.match_id))];
  let recent: MatchRow[] = [];
  let upcoming: MatchRow[] = [];
  if (matchIds.length) {
    const nowIso = new Date().toISOString();
    const [{ data: r }, { data: u }] = await Promise.all([
      supabase
        .from("matches")
        .select("id, sport_key, format, scheduled_at, status, location_text")
        .in("id", matchIds)
        .order("created_at", { ascending: false })
        .limit(6),
      supabase
        .from("matches")
        .select("id, sport_key, format, scheduled_at, status, location_text")
        .in("id", matchIds)
        .gte("scheduled_at", nowIso)
        .order("scheduled_at", { ascending: true })
        .limit(8),
    ]);
    recent = (r as MatchRow[] | null) ?? [];
    upcoming = (u as MatchRow[] | null) ?? [];
  }

  // Teams the player is on.
  const { data: tm } = await supabase.from("team_members").select("team_id, role").eq("user_id", user.id);
  const teamIds = [...new Set((tm ?? []).map((t) => t.team_id))];
  const roleByTeam = new Map((tm ?? []).map((t) => [t.team_id, t.role]));
  let teams: { id: string; name: string; sport_key: string; city: string | null }[] = [];
  if (teamIds.length) {
    const { data: tt } = await supabase.from("teams").select("id, name, sport_key, city").in("id", teamIds);
    teams = (tt as { id: string; name: string; sport_key: string; city: string | null }[] | null) ?? [];
  }

  const totalMatches = sports.reduce((n, s) => n + (s.matches_played || 0), 0);
  const totalWins = sports.reduce((n, s) => n + (s.wins || 0), 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <CoverUploader initialUrl={coverUrl} hue={hue} />

      {/* Identity header — avatar overlaps the cover (z-10 so it sits on top) */}
      <div className="relative z-10 px-1 sm:px-4">
        <div className="-mt-14 flex flex-col gap-4 sm:-mt-16 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-end gap-4">
            <div className="rounded-full ring-4 ring-bg">
              <Avatar url={avatarUrl} hue={hue} name={profile.display_name} size={112} />
            </div>
            <div className="pb-1">
              <div className="flex items-center gap-2">
                <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">{profile.display_name}</h1>
                {verified ? <BadgeCheck size={22} className="text-brand" aria-label="Identity verified" /> : null}
              </div>
              <p className="mt-1.5 flex items-center gap-1.5 text-sm text-mute">
                <MapPin size={14} className="shrink-0 text-faint" /> {place}
              </p>
            </div>
          </div>
          <Link
            href="/account"
            className="press inline-flex items-center justify-center gap-1.5 self-start rounded-full border border-rule bg-surface px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-bg sm:self-auto"
          >
            <Pencil size={14} /> Edit profile
          </Link>
        </div>

        {/* meta row */}
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-faint">
          {verified ? (
            <span className="inline-flex items-center gap-1 text-brand-deep">
              <ShieldCheck size={13} /> Identity verified
            </span>
          ) : (
            <span>Verification pending</span>
          )}
          {memberSince ? <span>Member since {memberSince}</span> : null}
          {age !== null ? <span>{age} years old</span> : null}
          <span>
            {totalWins}/{totalMatches} career {totalMatches === 1 ? "match" : "matches"} won
          </span>
        </div>

        {profile.bio ? <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-ink">{profile.bio}</p> : null}
      </div>

      {/* Per-sport stats */}
      <div className="mt-8 px-1 sm:px-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="kicker text-faint">Sports &amp; standing</h2>
          <Link href="/rankings" className="press inline-flex items-center gap-1 text-xs font-semibold text-brand-deep hover:underline">
            Full ladder <ArrowUpRight size={13} />
          </Link>
        </div>

        {sports.length === 0 ? (
          <div className="rounded-2xl border border-rule bg-surface p-6 text-center text-sm text-mute">
            No sports yet. <Link href="/account" className="font-semibold text-ink underline underline-offset-2">Add your sports</Link> to start climbing.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {sports.map((s) => {
              const meta = sportMeta(s.sport_key);
              const isPrimary = s.sport_key === profile.primary_sport;
              const winPct = s.matches_played > 0 ? Math.round((s.wins / s.matches_played) * 100) : null;
              return (
                <div
                  key={s.sport_key}
                  className="rounded-2xl border bg-surface p-4"
                  style={{ borderColor: isPrimary ? "#ff4e1b55" : "#e4e4e7" }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xl" aria-hidden>{meta.emoji}</span>
                      <span className="text-sm font-bold text-ink">{meta.name}</span>
                      {isPrimary ? <span className="rounded-full bg-tint-brand px-2 py-0.5 text-[10px] font-semibold text-brand-deep">Primary</span> : null}
                    </div>
                    <Trophy size={15} className="text-faint" />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl bg-bg py-2">
                      <div className="font-display text-xl text-ink">{Math.round(s.points).toLocaleString("en-US")}</div>
                      <div className="text-[10px] uppercase tracking-wide text-faint">Points</div>
                    </div>
                    <div className="rounded-xl bg-bg py-2">
                      <div className="font-display text-xl text-ink">{s.wins}/{s.matches_played}</div>
                      <div className="text-[10px] uppercase tracking-wide text-faint">Won{winPct != null ? ` · ${winPct}%` : ""}</div>
                    </div>
                    <div className="rounded-xl bg-bg py-2">
                      <div className="font-display text-xl text-ink">{s.skill_rating != null ? s.skill_rating.toFixed(1) : "—"}</div>
                      <div className="text-[10px] uppercase tracking-wide text-faint">Skill</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Calendar — upcoming scheduled matches */}
      <div className="mt-8 px-1 sm:px-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="kicker text-faint">Your calendar</h2>
          <Link href="/play/new" className="press inline-flex items-center gap-1 text-xs font-semibold text-brand-deep hover:underline">
            Organize a match <ArrowUpRight size={13} />
          </Link>
        </div>
        {upcoming.length === 0 ? (
          <div className="flex items-center gap-3 rounded-2xl border border-rule bg-surface p-5 text-sm text-mute">
            <CalendarDays size={18} className="shrink-0 text-faint" />
            <span>No scheduled matches yet. Matches with a date &amp; time will appear here as your upcoming calendar.</span>
          </div>
        ) : (
          <div className="space-y-2">
            {upcoming.map((m) => {
              const meta = sportMeta(m.sport_key);
              const d = m.scheduled_at ? new Date(m.scheduled_at) : null;
              return (
                <Link key={m.id} href={`/play/${m.id}`} className="lift flex items-center gap-3 rounded-2xl border border-rule bg-surface p-3">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-tint-brand leading-none">
                    <span className="text-[10px] font-bold uppercase text-brand-deep">{d ? d.toLocaleDateString("en-US", { month: "short" }) : "—"}</span>
                    <span className="font-display text-lg text-ink">{d ? d.getDate() : "—"}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink">
                      {meta.emoji} {meta.name} · {m.format === "doubles" ? "Doubles" : "Singles"}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-mute">
                      <CalendarClock size={12} className="shrink-0 text-faint" />
                      {d ? d.toLocaleDateString("en-US", { weekday: "short" }) + " · " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "Anytime"}
                      {m.location_text ? ` · ${m.location_text}` : ""}
                    </span>
                  </span>
                  <ArrowUpRight size={16} className="shrink-0 text-faint" />
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Teams */}
      <div className="mt-8 px-1 sm:px-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="kicker text-faint">Teams</h2>
          <Link href="/teams" className="press inline-flex items-center gap-1 text-xs font-semibold text-brand-deep hover:underline">
            All teams <ArrowUpRight size={13} />
          </Link>
        </div>
        {teams.length === 0 ? (
          <div className="flex items-center gap-3 rounded-2xl border border-rule bg-surface p-5 text-sm text-mute">
            <Users size={18} className="shrink-0 text-faint" />
            <span>You&rsquo;re not on a team yet. <Link href="/teams" className="font-semibold text-ink underline underline-offset-2">Create or join one</Link>.</span>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {teams.map((t) => {
              const meta = sportMeta(t.sport_key);
              return (
                <Link key={t.id} href={`/teams/${t.id}`} className="lift flex items-center gap-3 rounded-2xl border border-rule bg-surface p-3.5">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#f4f4f5] text-lg" aria-hidden>{meta.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-bold text-ink">{t.name}</span>
                      {roleByTeam.get(t.id) === "owner" ? <Crown size={12} className="shrink-0 text-pop" aria-label="Owner" /> : null}
                    </span>
                    <span className="block truncate text-xs text-mute">{meta.name}{t.city ? ` · ${t.city}` : ""}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent matches */}
      <div className="mt-8 px-1 sm:px-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="kicker text-faint">Recent matches</h2>
          <Link href="/play" className="press inline-flex items-center gap-1 text-xs font-semibold text-brand-deep hover:underline">
            All matches <ArrowUpRight size={13} />
          </Link>
        </div>
        {recent.length === 0 ? (
          <div className="rounded-2xl border border-rule bg-surface p-6 text-center text-sm text-mute">
            No matches yet. <Link href="/play/new" className="font-semibold text-ink underline underline-offset-2">Organize one</Link> and it&rsquo;ll show up here.
          </div>
        ) : (
          <div className="space-y-2">
            {recent.map((m) => {
              const meta = sportMeta(m.sport_key);
              return (
                <Link
                  key={m.id}
                  href={`/play/${m.id}`}
                  className="lift flex items-center gap-3 rounded-2xl border border-rule bg-surface p-3.5"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-bg text-lg" aria-hidden>{meta.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink">
                      {meta.name} · {m.format === "doubles" ? "Doubles" : "Singles"}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-mute">
                      <CalendarClock size={12} className="shrink-0 text-faint" /> {whenLabel(m.scheduled_at)}
                      {m.location_text ? ` · ${m.location_text}` : ""}
                    </span>
                  </span>
                  <span
                    className="shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize"
                    style={{
                      background: m.status === "open" ? "#fff1ed" : "#f4f4f5",
                      color: m.status === "open" ? "#d63a0f" : "#71717a",
                    }}
                  >
                    {m.status}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <p className="mt-8 flex items-center justify-center gap-1.5 px-4 text-center text-xs text-faint">
        <Swords size={12} /> This is how other members see you. Manage details &amp; privacy in{" "}
        <Link href="/settings" className="font-semibold text-ink underline underline-offset-2">Settings</Link>.
      </p>
    </div>
  );
}
