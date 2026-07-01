import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgeCheck, MapPin, Pencil, Trophy, CalendarClock, CalendarRange, Swords, ArrowUpRight, Users, Crown, Plus } from "lucide-react";
import { displayAge } from "@/lib/age";
import { createClient } from "@/lib/supabase/server";
import { getCalendarEvents } from "@/lib/calendar";
import { Avatar } from "@/components/avatar";
import { CoverUploader } from "@/components/cover-uploader";
import { sportMeta, SPORTS } from "@/lib/sports";

export const metadata: Metadata = { title: "My profile" };

type PS = { sport_key: string; points: number; skill_rating: number | null; matches_played: number; wins: number; skill_level: string };
type MatchRow = { id: string; sport_key: string; format: string; scheduled_at: string | null; status: string; location_text: string | null };

// Per-sport accent colors (shared with the teams hub).
const SPORT_COLOR: Record<string, string> = {
  tennis: "#84cc16",
  pickleball: "#eab308",
  padel: "#3b82f6",
  racquetball: "#8b5cf6",
  beach_volleyball: "#f97316",
};
const KIND_DOT: Record<string, string> = { match: "#ea580c", event: "#2563eb", class: "#7c3aed", tournament: "#d97706" };
const KIND_LABEL: Record<string, string> = { match: "Match", event: "Event", class: "Class", tournament: "Tournament" };

function whenLabel(iso: string | null) {
  if (!iso) return "Open / anytime";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " · " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function calWhen(start: string, allDay: boolean) {
  const d = new Date(start);
  const date = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return allDay ? date : `${date} · ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="font-display text-xl leading-none text-ink sm:text-2xl">{value}</div>
      <div className="mt-1 text-[11px] uppercase tracking-wide text-faint">{label}</div>
    </div>
  );
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
  const memberSince = profile.created_at ? new Date(profile.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : null;
  const age = displayAge(profile.date_of_birth, profile.birth_year);
  const primaryMeta = profile.primary_sport ? sportMeta(profile.primary_sport) : null;

  // Sports the player has signed up for (one player_sports row each).
  const { data: psData } = await supabase
    .from("player_sports")
    .select("sport_key, points, skill_rating, matches_played, wins, skill_level")
    .eq("user_id", user.id)
    .eq("active", true);
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
  if (matchIds.length) {
    const { data: r } = await supabase
      .from("matches")
      .select("id, sport_key, format, scheduled_at, status, location_text")
      .in("id", matchIds)
      .order("created_at", { ascending: false })
      .limit(6);
    recent = (r as MatchRow[] | null) ?? [];
  }

  // Next few commitments — a teaser for the full calendar.
  const allCal = await getCalendarEvents(supabase, user.id);
  const nowMs = new Date().getTime();
  const upNext = allCal.filter((e) => new Date(e.start).getTime() >= nowMs - 3600000).slice(0, 3);

  // Teams the player is on.
  const { data: tm } = await supabase.from("team_members").select("team_id, role").eq("user_id", user.id);
  const teamIds = [...new Set((tm ?? []).map((t) => t.team_id))];
  const roleByTeam = new Map((tm ?? []).map((t) => [t.team_id, t.role]));
  let teams: { id: string; name: string; sport_key: string; city: string | null }[] = [];
  if (teamIds.length) {
    const { data: tt } = await supabase.from("teams").select("id, name, sport_key, city").is("deleted_at", null).in("id", teamIds);
    teams = (tt as { id: string; name: string; sport_key: string; city: string | null }[] | null) ?? [];
  }

  const totalMatches = sports.reduce((n, s) => n + (s.matches_played || 0), 0);
  const totalWins = sports.reduce((n, s) => n + (s.wins || 0), 0);
  const winRate = totalMatches ? `${Math.round((totalWins / totalMatches) * 100)}%` : "—";

  return (
    <div className="mx-auto max-w-page px-4 py-6 sm:px-6 sm:py-8">
      {/* ===== Hero ===== */}
      <CoverUploader initialUrl={coverUrl} hue={hue} />

      <div className="relative z-10 px-1 sm:px-4">
        {/* Avatar overlaps the cover; the row is pointer-events-none so the cover's
            own buttons stay clickable, with the avatar + edit button re-enabling it. */}
        <div className="pointer-events-none -mt-14 flex items-end justify-between sm:-mt-16">
          <div className="pointer-events-auto rounded-full ring-4 ring-bg">
            <Avatar url={avatarUrl} hue={hue} name={profile.display_name} size={132} />
          </div>
          <Link
            href="/account"
            className="press pointer-events-auto mb-1 inline-flex items-center justify-center gap-1.5 rounded-full border border-rule bg-surface px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-bg"
          >
            <Pencil size={14} /> Edit profile
          </Link>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">{profile.display_name}</h1>
          {verified ? <BadgeCheck size={22} className="shrink-0 text-brand" aria-label="Identity verified" /> : null}
          {primaryMeta ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-tint-brand px-2.5 py-1 text-xs font-semibold text-brand-deep">
              <span aria-hidden>{primaryMeta.emoji}</span> {primaryMeta.name}
            </span>
          ) : null}
        </div>

        <p className="mt-2 flex items-center gap-1.5 text-sm text-mute">
          <MapPin size={14} className="shrink-0 text-faint" /> {place}
          {verified ? <span className="text-faint">· Identity verified</span> : <span className="text-faint">· Verification pending</span>}
        </p>

        {profile.bio ? <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-soft">{profile.bio}</p> : null}

        {/* Stat strip — inline, divider-separated (not a stack of cards). */}
        <div className="mt-6 flex flex-wrap items-center gap-x-7 gap-y-4">
          <Stat value={`${totalWins}–${Math.max(totalMatches - totalWins, 0)}`} label="Career W–L" />
          <span className="hidden h-9 w-px bg-rule sm:block" aria-hidden />
          <Stat value={winRate} label="Win rate" />
          <span className="hidden h-9 w-px bg-rule sm:block" aria-hidden />
          <Stat value={String(sports.length)} label={sports.length === 1 ? "Sport" : "Sports"} />
          <span className="hidden h-9 w-px bg-rule sm:block" aria-hidden />
          <Stat value={String(teams.length)} label={teams.length === 1 ? "Team" : "Teams"} />
          {age !== null ? (
            <>
              <span className="hidden h-9 w-px bg-rule sm:block" aria-hidden />
              <Stat value={String(age)} label="Age" />
            </>
          ) : null}
          {memberSince ? (
            <>
              <span className="hidden h-9 w-px bg-rule sm:block" aria-hidden />
              <Stat value={memberSince} label="Member since" />
            </>
          ) : null}
        </div>
      </div>

      {/* ===== Up next (calendar teaser) ===== */}
      <div className="mt-10 px-1 sm:px-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="kicker text-faint">Up next</h2>
          <Link href="/calendar" className="press inline-flex items-center gap-1 text-xs font-semibold text-brand-deep hover:underline">
            Open calendar <ArrowUpRight size={13} />
          </Link>
        </div>
        {upNext.length === 0 ? (
          <Link href="/calendar" className="lift flex items-center gap-3 rounded-2xl border border-dashed border-rule bg-surface px-5 py-4 text-sm text-mute">
            <CalendarRange size={18} className="shrink-0 text-faint" />
            <span>Nothing scheduled yet — matches, events, classes, and tournaments you join show up on your calendar.</span>
          </Link>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-3">
            {upNext.map((ev) => (
              <Link key={ev.key} href={ev.href} className="lift rounded-2xl border border-rule bg-surface p-4">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: KIND_DOT[ev.kind] }} aria-hidden />
                  <span className="text-[10px] font-bold uppercase tracking-wide text-faint">{KIND_LABEL[ev.kind]}</span>
                </div>
                <div className="mt-2 truncate text-sm font-bold text-ink">{ev.title}</div>
                <div className="mt-1.5 flex items-center gap-1.5 text-xs text-mute">
                  <CalendarClock size={12} className="shrink-0 text-faint" /> {calWhen(ev.start, ev.allDay)}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ===== Sports & standing (trophy case) ===== */}
      <div className="mt-10 px-1 sm:px-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="kicker text-faint">Sports &amp; standing</h2>
          <Link href="/rankings" className="press inline-flex items-center gap-1 text-xs font-semibold text-brand-deep hover:underline">
            Full ladder <ArrowUpRight size={13} />
          </Link>
        </div>

        {sports.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-rule bg-surface p-8 text-center text-sm text-mute">
            No sports yet. <Link href="/account" className="font-semibold text-ink underline underline-offset-2">Add your sports</Link> to start climbing.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sports.map((s) => {
              const meta = sportMeta(s.sport_key);
              const color = SPORT_COLOR[s.sport_key] ?? "#71717a";
              const isPrimary = s.sport_key === profile.primary_sport;
              const winPct = s.matches_played > 0 ? Math.round((s.wins / s.matches_played) * 100) : null;
              return (
                <div key={s.sport_key} className="overflow-hidden rounded-2xl border border-rule bg-surface">
                  <div className="flex items-center justify-between px-4 py-3" style={{ background: `${color}14` }}>
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-lg" style={{ background: `${color}26` }} aria-hidden>
                        {meta.emoji}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-ink">{meta.name}</div>
                        {isPrimary ? (
                          <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color }}>Primary sport</div>
                        ) : (
                          <div className="text-[10px] uppercase tracking-wide text-faint">{s.skill_level || "Player"}</div>
                        )}
                      </div>
                    </div>
                    <Trophy size={15} style={{ color }} />
                  </div>
                  <div className="grid grid-cols-3 divide-x divide-rule border-t border-rule text-center">
                    <div className="py-3">
                      <div className="font-display text-xl text-ink">{Math.round(s.points).toLocaleString("en-US")}</div>
                      <div className="text-[10px] uppercase tracking-wide text-faint">Points</div>
                    </div>
                    <div className="py-3">
                      <div className="font-display text-xl text-ink">{s.wins}/{s.matches_played}</div>
                      <div className="text-[10px] uppercase tracking-wide text-faint">Won{winPct != null ? ` · ${winPct}%` : ""}</div>
                    </div>
                    <div className="py-3">
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

      {/* ===== Teams + Recent matches (two clean panels) ===== */}
      <div className="mt-10 grid gap-8 px-1 sm:px-4 lg:grid-cols-2">
        {/* Teams */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="kicker text-faint">Teams</h2>
            <Link href="/teams" className="press inline-flex items-center gap-1 text-xs font-semibold text-brand-deep hover:underline">
              All teams <ArrowUpRight size={13} />
            </Link>
          </div>
          {teams.length === 0 ? (
            <div className="flex items-center gap-3 rounded-2xl border border-dashed border-rule bg-surface px-5 py-4 text-sm text-mute">
              <Users size={18} className="shrink-0 text-faint" />
              <span>You&rsquo;re not on a team yet. <Link href="/teams" className="font-semibold text-ink underline underline-offset-2">Create or join one</Link>.</span>
            </div>
          ) : (
            <div className="divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-surface">
              {teams.map((t) => {
                const meta = sportMeta(t.sport_key);
                const color = SPORT_COLOR[t.sport_key] ?? "#a1a1aa";
                return (
                  <Link key={t.id} href={`/teams/${t.id}`} className="flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-bg">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-lg" style={{ background: `${color}1f` }} aria-hidden>{meta.emoji}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-bold text-ink">{t.name}</span>
                        {roleByTeam.get(t.id) === "owner" ? <Crown size={12} className="shrink-0 text-pop" aria-label="Owner" /> : null}
                      </span>
                      <span className="block truncate text-xs text-mute">{meta.name}{t.city ? ` · ${t.city}` : ""}</span>
                    </span>
                    <ArrowUpRight size={15} className="shrink-0 text-faint" />
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent matches */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="kicker text-faint">Recent matches</h2>
            <Link href="/play" className="press inline-flex items-center gap-1 text-xs font-semibold text-brand-deep hover:underline">
              All matches <ArrowUpRight size={13} />
            </Link>
          </div>
          {recent.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-rule bg-surface px-6 py-10 text-center">
              <Swords size={22} className="mx-auto text-faint" />
              <p className="mx-auto mt-3 max-w-xs text-sm text-mute">No matches yet — organize one and it&rsquo;ll show up here.</p>
              <Link
                href="/play/new"
                className="press mt-4 inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-deep"
              >
                <Plus size={15} /> Organize a match
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-surface">
              {recent.map((m) => {
                const meta = sportMeta(m.sport_key);
                const color = SPORT_COLOR[m.sport_key] ?? "#a1a1aa";
                return (
                  <Link key={m.id} href={`/play/${m.id}`} className="flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-bg">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-lg" style={{ background: `${color}1f` }} aria-hidden>{meta.emoji}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-ink">{meta.name} · {m.format === "doubles" ? "Doubles" : "Singles"}</span>
                      <span className="flex items-center gap-1.5 text-xs text-mute">
                        <CalendarClock size={12} className="shrink-0 text-faint" /> {whenLabel(m.scheduled_at)}
                        {m.location_text ? ` · ${m.location_text}` : ""}
                      </span>
                    </span>
                    <span
                      className="shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize"
                      style={{ background: m.status === "open" ? "#fff1ed" : "#f4f4f5", color: m.status === "open" ? "#d63a0f" : "#71717a" }}
                    >
                      {m.status}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <p className="mt-10 flex items-center justify-center gap-1.5 px-4 text-center text-xs text-faint">
        <Swords size={12} /> This is how other members see you. Manage details &amp; privacy in{" "}
        <Link href="/settings" className="font-semibold text-ink underline underline-offset-2">Settings</Link>.
      </p>
    </div>
  );
}
