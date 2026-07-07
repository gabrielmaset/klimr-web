import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  BadgeCheck,
  MapPin,
  ShieldCheck,
  TrendingUp,
  Trophy,
  Flag,
  Ban,
  Pencil,
  Sparkles,
  Medal,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AvatarLightbox } from "@/components/avatar-lightbox";
import { sportMeta } from "@/lib/sports";
import { SportChip } from "@/components/sport-chip";
import { displayAge } from "@/lib/age";
import { RelationshipButtons, type FriendStatus } from "@/components/relationship-buttons";
import { mapFriendshipRow, buildContextChips, type RelationshipContext } from "@/lib/social";
import { createAdminClient } from "@/lib/supabase/admin";
import { blockUser, unblockUser, reportUser } from "./actions";

export const metadata: Metadata = { title: "Player" };

type Profile = {
  id: string;
  display_name: string;
  avatar_hue: number;
  avatar_path: string | null;
  verification_status: string;
  account_status: string;
  reliability: number;
  home_zip: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  country: string;
  primary_sport: string | null;
  created_at: string;
  date_of_birth: string | null;
  birth_year: number | null;
};
type PS = { sport_key: string; points: number; skill_rating: number | null; matches_played: number; wins: number };
type Rung = { label: string; rank: number | null; field: number };

const SCOPES = [
  { key: "zip", label: "ZIP" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "national", label: "Nat'l" },
  { key: "world", label: "World" },
] as const;

const REASONS: { value: string; label: string }[] = [
  { value: "harassment", label: "Harassment or bullying" },
  { value: "cheating", label: "Cheating / false results" },
  { value: "no_show", label: "No-show" },
  { value: "inappropriate", label: "Inappropriate behavior" },
  { value: "fake_profile", label: "Fake profile" },
  { value: "other", label: "Something else" },
];

function regionFor(key: string, p: Profile): string | null {
  switch (key) {
    case "zip":
      return p.home_zip;
    case "city":
      return p.city;
    case "state":
      return p.state;
    case "national":
      return p.country;
    default:
      return null;
  }
}

function reliabilityLabel(r: number) {
  if (r >= 95) return "Highly reliable";
  if (r >= 85) return "Reliable";
  if (r >= 70) return "Mostly reliable";
  return "Building reputation";
}

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/profile/${id}`);

  const { data: profileRow } = await supabase
    .from("profiles")
    .select(
      "id, display_name, avatar_hue, avatar_path, verification_status, account_status, reliability, home_zip, neighborhood, city, state, country, primary_sport, created_at, date_of_birth, birth_year",
    )
    .eq("id", id)
    .single();
  if (!profileRow) notFound();
  const profile = profileRow as Profile;
  // Archived (pending-deletion) accounts are not viewable by others.
  if (profile.account_status === "archived") notFound();

  const isSelf = profile.id === user.id;

  const { data: psRows } = await supabase
    .from("player_sports")
    .select("sport_key, points, skill_rating, matches_played, wins")
    .eq("user_id", id)
    .eq("active", true)
    .order("points", { ascending: false });
  const sports = (psRows as PS[] | null) ?? [];

  // Geographic ranking ladder per sport — the demo's signature, computed live.
  const ladders = new Map<string, Rung[]>();
  await Promise.all(
    sports.map(async (ps) => {
      const rungs = await Promise.all(
        SCOPES.map(async (sc) => {
          const region = regionFor(sc.key, profile);
          if (sc.key !== "world" && !region) return { label: sc.label, rank: null, field: 0 } as Rung;
          const { data } = await supabase.rpc("ranked_players", {
            p_sport: ps.sport_key,
            p_scope: sc.key,
            p_region: region,
          });
          const rows = (data as { user_id: string; rank: number }[] | null) ?? [];
          const row = rows.find((r) => r.user_id === id) ?? null;
          return { label: sc.label, rank: row ? Number(row.rank) : null, field: rows.length } as Rung;
        }),
      );
      ladders.set(ps.sport_key, rungs);
    }),
  );

  // Derived, honest badges (no fabricated data).
  const totalMatches = sports.reduce((a, s) => a + s.matches_played, 0);
  const totalWins = sports.reduce((a, s) => a + s.wins, 0);
  const winRate = totalMatches ? totalWins / totalMatches : 0;
  const badges: { label: string; tone: "brand" | "gold" | "ink" }[] = [];
  if (profile.verification_status === "verified") badges.push({ label: "Verified identity", tone: "brand" });
  if (profile.reliability >= 95) badges.push({ label: "Highly reliable", tone: "ink" });
  if (totalMatches >= 50) badges.push({ label: "Veteran · 50+ matches", tone: "ink" });
  if (winRate >= 0.6 && totalMatches >= 10) badges.push({ label: `Winning record · ${Math.round(winRate * 100)}%`, tone: "gold" });
  if (sports.length >= 2) badges.push({ label: "Multi-sport", tone: "ink" });
  if (totalMatches === 0) badges.push({ label: "New to Klimr", tone: "ink" });

  // Viewer's safety state toward this player.
  let blocked = false;
  let blockedMe = false;
  let reported = false;
  let friendStatus: FriendStatus = "none";
  let isFollowing = false;
  let context: RelationshipContext | null = null;
  let mutualNames: string[] = [];
  if (!isSelf) {
    const admin = createAdminClient();
    const [{ data: b }, { data: bm }, { data: r }, { data: fr }, { data: fol }] = await Promise.all([
      supabase.from("blocks").select("blocked_id").eq("blocker_id", user.id).eq("blocked_id", id).maybeSingle(),
      // Their block on me is invisible to my RLS — the service role answers it.
      admin.from("blocks").select("blocker_id").eq("blocker_id", id).eq("blocked_id", user.id).maybeSingle(),
      supabase.from("reports").select("id").eq("reporter_id", user.id).eq("reported_id", id).limit(1).maybeSingle(),
      supabase
        .from("friendships")
        .select("requester_id, status")
        .or(`and(requester_id.eq.${user.id},addressee_id.eq.${id}),and(requester_id.eq.${id},addressee_id.eq.${user.id})`)
        .maybeSingle(),
      supabase.from("follows").select("followee_id").eq("follower_id", user.id).eq("followee_id", id).maybeSingle(),
    ]);
    blocked = !!b;
    blockedMe = !!bm;
    reported = !!r;
    isFollowing = !!fol;
    friendStatus = mapFriendshipRow(user.id, fr);

    if (!blocked && !blockedMe) {
      const [{ data: ctxRows }, { data: muts }] = await Promise.all([
        supabase.rpc("relationship_context", { p_other: id }),
        supabase.rpc("mutual_connections", { p_other: id, p_limit: 3 }),
      ]);
      context = ctxRows?.[0] ?? null;
      mutualNames = (muts ?? []).map((m) => m.display_name);
    }
  }

  // If they've blocked the viewer, the profile simply isn't available — same
  // answer as a missing profile, so blocking is never announced.
  if (blockedMe) {
    return (
      <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
        <div className="rounded-2xl border border-dashed border-rule bg-surface p-10 text-center">
          <p className="text-lg font-bold text-ink">This profile isn&rsquo;t available.</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-mute">The player may have changed their settings or is no longer active.</p>
          <Link href="/network" className="press mt-4 inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-surface">
            Back to your network
          </Link>
        </div>
      </div>
    );
  }

  const contextChips = context ? buildContextChips(context, { max: 3, areaLabel: profile.neighborhood ?? profile.city }) : [];

  const avatarUrl = profile.avatar_path
    ? supabase.storage.from("avatars").getPublicUrl(profile.avatar_path).data.publicUrl
    : null;
  const memberSince = new Date(profile.created_at).toLocaleString("en-US", { month: "long", year: "numeric" });
  const age = displayAge(profile.date_of_birth, profile.birth_year);
  const place = [profile.neighborhood, profile.city, profile.state].filter(Boolean).join(", ") || "Location not set";

  // Active sponsor, if any (Klimr's amateur-sponsorship feature).
  let sponsor: { id: string; name: string } | null = null;
  const { data: spRow } = await supabase
    .from("player_sponsorships")
    .select("sponsor_id")
    .eq("player_id", id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (spRow) {
    const { data: sp } = await supabase.from("sponsors").select("id, name").eq("id", spRow.sponsor_id).maybeSingle();
    sponsor = sp ?? null;
  }

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      {blocked ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rule bg-surface px-4 py-3">
          <p className="text-sm text-mute">You&rsquo;ve blocked this player.</p>
          <form action={unblockUser}>
            <input type="hidden" name="userId" value={id} />
            <button className="press text-sm font-semibold text-brand-deep">Unblock</button>
          </form>
        </div>
      ) : null}

      {/* header */}
      <div className="flex flex-col gap-5 rounded-2xl border border-rule bg-surface p-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <AvatarLightbox url={avatarUrl} hue={profile.avatar_hue} name={profile.display_name} size={72} ring />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">{profile.display_name || "Player"}</h1>
              {profile.verification_status === "verified" ? <BadgeCheck size={20} className="text-brand" aria-label="Verified" /> : null}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-mute">
              <span className="flex items-center gap-1.5"><MapPin size={14} className="text-faint" /> {place}</span>
              {age !== null ? <span className="flex items-center gap-1.5">{age} yrs</span> : null}
              {profile.primary_sport ? <SportChip sport={profile.primary_sport} /> : null}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-tint-success px-2.5 py-1 text-xs font-semibold text-success">
                <ShieldCheck size={13} /> {profile.reliability} · {reliabilityLabel(profile.reliability)}
              </span>
              <span className="text-xs text-faint">Member since {memberSince}</span>
            </div>
            {!isSelf && !blocked && (mutualNames.length > 0 || contextChips.length > 0) ? (
              <div className="mt-3 space-y-1.5">
                {context && context.mutual_count > 0 ? (
                  <p className="flex items-center gap-1.5 text-xs font-medium text-mute">
                    <Users size={13} className="text-faint" />
                    Connected with {mutualNames.slice(0, 2).join(", ")}
                    {context.mutual_count > 2 ? ` and ${context.mutual_count - 2} other${context.mutual_count - 2 === 1 ? "" : "s"}` : ""}
                  </p>
                ) : null}
                {contextChips.filter((c) => !c.includes("mutual connection")).length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {contextChips
                      .filter((c) => !c.includes("mutual connection"))
                      .map((c) => (
                        <span key={c} className="rounded-full bg-bg px-2.5 py-1 text-[11px] font-semibold text-mute">{c}</span>
                      ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        {isSelf ? (
          <Link
            href="/account"
            className="press inline-flex shrink-0 items-center gap-2 rounded-full border border-rule px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-faint"
          >
            <Pencil size={15} /> Edit profile
          </Link>
        ) : (
          <RelationshipButtons targetId={profile.id} friendStatus={friendStatus} isFollowing={isFollowing} />
        )}
      </div>

      {/* badges */}
      {badges.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {badges.map((b) => (
            <span
              key={b.label}
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold"
              style={{
                borderColor: b.tone === "brand" ? "var(--color-brand)" : b.tone === "gold" ? "rgba(184,134,11,.4)" : "var(--color-rule)",
                background: b.tone === "brand" ? "var(--color-tint-brand)" : b.tone === "gold" ? "rgba(184,134,11,.08)" : "var(--color-bg)",
                color: b.tone === "brand" ? "var(--color-brand-deep)" : b.tone === "gold" ? "#8a6d0b" : "#52525b",
              }}
            >
              {b.tone === "gold" ? <Medal size={13} /> : b.tone === "brand" ? <BadgeCheck size={13} /> : <Sparkles size={13} />}
              {b.label}
            </span>
          ))}
        </div>
      ) : null}

      {/* sponsor (amateur sponsorship) */}
      {sponsor ? (
        <Link
          href={`/sponsorships/${sponsor.id}`}
          className="press mt-3 inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-tint-brand px-3 py-1.5 text-xs font-semibold text-brand-deep transition-colors hover:border-brand/60"
        >
          <Sparkles size={13} className="text-brand" /> Sponsored by {sponsor.name}
        </Link>
      ) : null}

      {/* rankings per sport */}
      <div className="mt-8">
        <div className="kicker mb-3 text-faint">Rankings · ZIP to world</div>
        {sports.length === 0 ? (
          <div className="rounded-2xl border border-rule bg-surface p-8 text-center text-sm text-mute">
            {isSelf ? "You don't" : `${profile.display_name || "This player"} doesn't`} have any sport rankings yet. They build as results are logged in the Klimr app.
          </div>
        ) : (
          <div className="space-y-4">
            {sports.map((ps) => {
              const meta = sportMeta(ps.sport_key);
              const rungs = ladders.get(ps.sport_key) ?? [];
              const wr = ps.matches_played ? Math.round((ps.wins / ps.matches_played) * 100) : 0;
              return (
                <div key={ps.sport_key} className="rounded-2xl border border-rule bg-surface p-5 sm:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span className="text-2xl" aria-hidden>{meta.emoji}</span>
                      <h3 className="font-display text-2xl text-ink">{meta.name}</h3>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="flex items-center gap-1.5 text-ink"><Trophy size={14} className="text-faint" /> <b className="font-mono">{ps.points.toLocaleString("en-US")}</b> pts</span>
                      {ps.skill_rating != null ? <span className="text-mute">Skill <b className="font-mono text-ink">{ps.skill_rating}</b></span> : null}
                      <span className="flex items-center gap-1.5 text-mute"><TrendingUp size={14} className="text-faint" /> {ps.wins}–{ps.matches_played - ps.wins} <span className="text-faint">({wr}%)</span></span>
                    </div>
                  </div>

                  {/* the ladder */}
                  <div className="mt-4 grid grid-cols-5 gap-2">
                    {rungs.map((r) => {
                      const has = r.rank != null;
                      return (
                        <div
                          key={r.label}
                          className="rounded-xl border px-2 py-2.5 text-center"
                          style={{ borderColor: has ? "var(--color-rule)" : "#efeff1", background: has ? "var(--color-surface)" : "var(--color-bg)" }}
                        >
                          <div className="kicker text-[8px] text-faint">{r.label}</div>
                          <div className="mt-1 font-display leading-none text-ink" style={{ fontSize: 22, opacity: has ? 1 : 0.3 }}>
                            {has ? `#${r.rank}` : "—"}
                          </div>
                          <div className="mt-0.5 font-mono text-[9px] text-faint">{r.field ? `of ${r.field.toLocaleString("en-US")}` : "—"}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* safety */}
      {!isSelf ? (
        <div className="mt-8 border-t border-rule pt-6">
          <div className="flex flex-wrap items-center gap-3">
            {!blocked ? (
              <form action={blockUser}>
                <input type="hidden" name="userId" value={id} />
                <button className="press inline-flex items-center gap-2 rounded-full border border-rule px-4 py-2 text-sm font-semibold text-mute transition-colors hover:border-faint hover:text-ink">
                  <Ban size={15} /> Block
                </button>
              </form>
            ) : null}

            {reported ? (
              <span className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm text-mute" style={{ background: "var(--color-bg)" }}>
                <Flag size={15} /> You reported this player
              </span>
            ) : (
              <details className="group">
                <summary className="press inline-flex cursor-pointer list-none items-center gap-2 rounded-full border border-rule px-4 py-2 text-sm font-semibold text-mute transition-colors hover:border-faint hover:text-ink">
                  <Flag size={15} /> Report
                </summary>
                <form action={reportUser} className="mt-3 max-w-md rounded-2xl border border-rule bg-surface p-4">
                  <input type="hidden" name="userId" value={id} />
                  <label htmlFor="reason" className="kicker text-faint">Reason</label>
                  <select
                    id="reason"
                    name="reason"
                    defaultValue="harassment"
                    className="mt-1.5 w-full rounded-xl border border-rule bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-brand"
                  >
                    {REASONS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                  <label htmlFor="context" className="kicker mt-3 block text-faint">Details <span className="font-sans normal-case tracking-normal text-faint">(optional)</span></label>
                  <textarea
                    id="context"
                    name="context"
                    rows={3}
                    maxLength={500}
                    placeholder="What happened?"
                    className="mt-1.5 w-full resize-none rounded-xl border border-rule bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-brand"
                  />
                  <button className="press mt-3 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-surface transition-colors hover:bg-ink-soft">
                    Submit report
                  </button>
                  <p className="mt-2 text-xs text-faint">Reports are private and reviewed by the Klimr team.</p>
                </form>
              </details>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
