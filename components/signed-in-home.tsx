import Link from "next/link";
import {
  Plus,
  Swords,
  ListOrdered,
  UserRound,
  Activity,
  ArrowUpRight,
  CalendarClock,
  MapPin,
  Users,
  BadgeCheck,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Avatar } from "@/components/avatar";
import { sportMeta } from "@/lib/sports";

type Prof = { id: string; display_name: string; avatar_hue: number; verification_status: string };
type MatchRow = {
  id: string;
  sport_key: string;
  format: string;
  organizer_id: string;
  scheduled_at: string | null;
  location_text: string | null;
  total_slots: number;
  status: string;
  result: unknown;
  created_at: string;
};

function whenShort(s: string | null) {
  if (!s) return "Open · anytime";
  return new Date(s).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
function timeAgo(iso: string) {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return "just now";
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export async function SignedInHome() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_hue, avatar_path, home_zip, neighborhood, city, state, country, primary_sport")
    .eq("id", user.id)
    .single();

  const { data: psRows } = await supabase
    .from("player_sports")
    .select("sport_key, points")
    .eq("user_id", user.id)
    .order("points", { ascending: false });
  const psList = psRows ?? [];
  const bestSportKey =
    profile?.primary_sport && psList.some((p) => p.sport_key === profile.primary_sport)
      ? profile.primary_sport
      : psList[0]?.sport_key ?? null;

  let standing: { rank: number; field: number; points: number } | null = null;
  if (bestSportKey && profile?.home_zip) {
    const { data } = await supabase.rpc("ranked_players", {
      p_sport: bestSportKey,
      p_scope: "zip",
      p_region: profile.home_zip,
    });
    const rows = (data as { user_id: string; rank: number; points: number }[] | null) ?? [];
    const me = rows.find((r) => r.user_id === user.id);
    if (me) standing = { rank: Number(me.rank), field: rows.length, points: me.points };
  }

  // Your upcoming matches.
  const { data: myParts } = await supabase.from("match_participants").select("match_id").eq("user_id", user.id);
  const myMatchIds = [...new Set((myParts ?? []).map((p) => p.match_id))];
  let myMatches: MatchRow[] = [];
  if (myMatchIds.length) {
    const { data } = await supabase
      .from("matches")
      .select("*")
      .in("id", myMatchIds)
      .in("status", ["open", "scheduled"])
      .order("scheduled_at", { ascending: true, nullsFirst: false });
    myMatches = ((data as MatchRow[] | null) ?? []).slice(0, 4);
  }

  // The feed — recent match activity around you.
  const { data: recent } = await supabase
    .from("matches")
    .select("*")
    .in("status", ["open", "scheduled", "completed"])
    .order("created_at", { ascending: false })
    .limit(12);
  const feed = (recent as MatchRow[] | null) ?? [];

  // Names + counts + memberships for everything shown.
  const shown = [...myMatches, ...feed];
  const matchIds = [...new Set(shown.map((m) => m.id))];
  const orgIds = [...new Set(shown.map((m) => m.organizer_id))];
  let orgs: Prof[] = [];
  const countMap = new Map<string, number>();
  const mineSet = new Set<string>(myMatchIds);
  if (matchIds.length) {
    const [{ data: o }, { data: parts }] = await Promise.all([
      supabase.from("profiles").select("id, display_name, avatar_hue, verification_status").in("id", orgIds),
      supabase.from("match_participants").select("match_id").in("match_id", matchIds),
    ]);
    orgs = (o as Prof[] | null) ?? [];
    for (const p of (parts as { match_id: string }[] | null) ?? []) {
      countMap.set(p.match_id, (countMap.get(p.match_id) ?? 0) + 1);
    }
  }
  const orgMap = new Map(orgs.map((o) => [o.id, o]));

  const name = profile?.display_name || user.email || "there";
  const firstName = name.split(/[\s@]/)[0];
  const avatarUrl = profile?.avatar_path
    ? supabase.storage.from("avatars").getPublicUrl(profile.avatar_path).data.publicUrl
    : null;
  const place = [profile?.neighborhood, profile?.city].filter(Boolean).join(", ");
  const bestMeta = bestSportKey ? sportMeta(bestSportKey) : null;

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:py-10">
      {/* greeting */}
      <div className="flex items-center gap-3">
        <Avatar url={avatarUrl} hue={profile?.avatar_hue ?? 200} name={name} size={46} ring />
        <div>
          <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">Welcome back, {firstName}</h1>
          <p className="mt-1 text-sm text-mute">{place ? `Your courts · ${place}` : "Let's climb."}</p>
        </div>
      </div>

      {/* standing + quick actions */}
      <div className="mt-7 grid gap-5 lg:grid-cols-[1fr_1.1fr]">
        <Link href="/rankings" className="lift rounded-2xl border border-rule bg-surface p-6">
          <div className="kicker text-faint">Your standing</div>
          {standing && bestMeta ? (
            <>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-2xl" aria-hidden>{bestMeta.emoji}</span>
                <span className="text-sm font-semibold text-ink">{bestMeta.name} · {profile?.home_zip}</span>
              </div>
              <div className="mt-3 flex items-end gap-2">
                <span className="font-display text-5xl leading-none text-ink">#{standing.rank}</span>
                <span className="pb-1.5 font-mono text-sm text-mute">of {standing.field} in your ZIP</span>
              </div>
              <div className="mt-1.5 font-mono text-sm text-mute">{standing.points.toLocaleString("en-US")} pts</div>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-deep">
                See full rankings <ArrowUpRight size={14} />
              </span>
            </>
          ) : (
            <>
              <p className="mt-3 text-sm leading-relaxed text-mute">
                {bestMeta
                  ? `You're not on the ${bestMeta.name.toLowerCase()} board in your ZIP yet. Rankings fill in as you log results in the Klimr app.`
                  : "Add a sport in your account to start climbing the ladder."}
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-deep">
                Explore rankings <ArrowUpRight size={14} />
              </span>
            </>
          )}
        </Link>

        <div className="grid grid-cols-2 gap-3">
          <Action href="/play" icon={Swords} label="Find a match" sub="Open games near you" />
          <Action href="/play/new" icon={Plus} label="Organize" sub="Start a game" />
          <Action href="/rankings" icon={ListOrdered} label="Rankings" sub="ZIP to world" />
          <Action href={`/profile/${user.id}`} icon={UserRound} label="Your profile" sub="Ladder & stats" />
        </div>
      </div>

      {/* your matches */}
      {myMatches.length ? (
        <section className="mt-9">
          <div className="flex items-center justify-between">
            <div className="kicker text-faint">Your matches</div>
            <Link href="/play" className="text-xs font-semibold text-brand-deep">All →</Link>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {myMatches.map((m) => {
              const meta = sportMeta(m.sport_key);
              const filled = countMap.get(m.id) ?? 0;
              return (
                <Link key={m.id} href={`/play/${m.id}`} className="lift rounded-2xl border border-rule bg-surface p-4">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl" aria-hidden>{meta.emoji}</span>
                    <span className="font-display text-lg text-ink">{meta.name} · {m.format === "doubles" ? "Doubles" : "Singles"}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-mute">
                    <span className="flex items-center gap-1.5"><CalendarClock size={13} className="text-faint" /> {whenShort(m.scheduled_at)}</span>
                    <span className="flex items-center gap-1.5"><Users size={13} className="text-faint" /> {filled}/{m.total_slots}</span>
                  </div>
                  {m.location_text ? (
                    <div className="mt-1 flex items-center gap-1.5 text-sm text-mute"><MapPin size={13} className="text-faint" /> {m.location_text}</div>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* feed */}
      <section className="mt-9">
        <div className="kicker mb-3 flex items-center gap-1.5 text-faint">
          <Activity size={12} /> Around you
        </div>
        {feed.length === 0 ? (
          <div className="rounded-2xl border border-rule bg-surface p-8 text-center">
            <p className="mx-auto max-w-md text-sm leading-relaxed text-mute">
              Your feed comes alive as players near you organize and play. Be the spark —{" "}
              <Link href="/play/new" className="font-semibold text-brand-deep">organize a match</Link>.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {feed.map((m) => {
              const meta = sportMeta(m.sport_key);
              const org = orgMap.get(m.organizer_id);
              const filled = countMap.get(m.id) ?? 0;
              const left = m.total_slots - filled;
              const completed = m.status === "completed";
              const mine = mineSet.has(m.id);
              return (
                <Link key={m.id} href={`/play/${m.id}`} className="lift flex items-start gap-3 rounded-2xl border border-rule bg-surface p-4">
                  <Avatar url={null} hue={org?.avatar_hue ?? 200} name={org?.display_name ?? "Player"} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold text-ink">{org?.display_name ?? "A player"}</span>
                      {org?.verification_status === "verified" ? <BadgeCheck size={13} className="shrink-0 text-brand" aria-label="Verified" /> : null}
                      <span className="shrink-0 text-xs text-faint">· {timeAgo(m.created_at)}</span>
                    </div>
                    <p className="mt-0.5 text-sm text-mute">
                      {completed ? (
                        <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={13} className="text-success" /> Completed a {meta.emoji} {meta.name} match</span>
                      ) : (
                        <>Organized a {meta.emoji} {meta.name} {m.format === "doubles" ? "doubles" : "singles"} match</>
                      )}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint">
                      <span className="flex items-center gap-1"><CalendarClock size={12} /> {whenShort(m.scheduled_at)}</span>
                      {m.location_text ? <span className="flex items-center gap-1"><MapPin size={12} /> {m.location_text}</span> : null}
                    </div>
                  </div>
                  {!completed ? (
                    <span
                      className="kicker shrink-0 rounded-full px-2 py-1 text-[9px]"
                      style={{ background: mine ? "#f0fdf4" : left > 0 ? "#fff1ed" : "#f4f4f5", color: mine ? "#16a34a" : left > 0 ? "#d63a0f" : "#71717a" }}
                    >
                      {mine ? "You're in" : left > 0 ? `${left} open` : "Full"}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function Action({ href, icon: Icon, label, sub }: { href: string; icon: LucideIcon; label: string; sub: string }) {
  return (
    <Link href={href} className="lift flex flex-col justify-between rounded-2xl border border-rule bg-surface p-4">
      <Icon size={20} className="text-brand" />
      <div className="mt-4">
        <div className="font-display text-lg leading-none text-ink">{label}</div>
        <div className="mt-1 text-xs text-mute">{sub}</div>
      </div>
    </Link>
  );
}
