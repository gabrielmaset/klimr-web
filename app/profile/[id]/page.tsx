import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BadgeCheck, MapPin, ShieldCheck, Trophy, Ban, Pencil, Medal, Users, Swords, Clock, ChevronRight, Grid2x2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AvatarLightbox } from "@/components/avatar-lightbox";
import { sportMeta } from "@/lib/sports";
import { displayAge } from "@/lib/age";
import { lookupZip } from "@/lib/us-places";
import { RelationshipButtons, type FriendStatus } from "@/components/relationship-buttons";
import { mapFriendshipRow, buildContextChips, type RelationshipContext } from "@/lib/social";
import { BackPill } from "@/components/back-pill";
import { ProfileMenu } from "@/components/profile-menu";
import { unblockUser } from "./actions";

export const metadata: Metadata = { title: "Player · Klimr" };

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
  gear: unknown;
  usual_times: string | null;
  profile_gallery: unknown;
  show_courts: boolean;
  show_teams: boolean;
  show_tournaments: boolean;
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

/** Sport identity tints — cover band, chips, crest tiles (Daylight table). */
const SPORT_TINT: Record<string, { bg: string; bd: string; fg: string }> = {
  tennis: { bg: "#EFF8F0", bd: "#CFE8D5", fg: "#217A34" },
  pickleball: { bg: "#EAF1FE", bd: "#CDDEFA", fg: "#1D4ED8" },
  padel: { bg: "#FEF0E4", bd: "#F9DAC0", fg: "#C2410C" },
  racquetball: { bg: "#F3EFFE", bd: "#E2D8FA", fg: "#6D28D9" },
  beach_volleyball: { bg: "#FBF3DE", bd: "#EFE0B4", fg: "#A16207" },
};
const tintOf = (k: string | null) => SPORT_TINT[k ?? ""] ?? { bg: "#FFF0E8", bd: "#FFD4BC", fg: "#C2410C" };

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
const haversineMi = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};
const parseScore = (result: unknown): string | null => {
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;
  for (const k of ["score", "score_text", "final"]) if (typeof r[k] === "string" && (r[k] as string).length <= 24) return r[k] as string;
  return null;
};
const fmtMonYr = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" }).toUpperCase();
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const mono = "font-mono";

export default async function ProfilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string }> }) {
  const { id } = await params;
  const { notice } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/profile/${id}`);

  const { data: profileRow } = await supabase
    .from("profiles")
    .select(
      "id, display_name, avatar_hue, avatar_path, verification_status, account_status, reliability, home_zip, neighborhood, city, state, country, primary_sport, created_at, date_of_birth, birth_year, gear, usual_times, profile_gallery, show_courts, show_teams, show_tournaments",
    )
    .eq("id", id)
    .single();
  if (!profileRow) notFound();
  const profile = profileRow as Profile;
  if (profile.account_status === "archived") notFound();

  const isSelf = profile.id === user.id;

  const { data: psRows } = await supabase
    .from("player_sports")
    .select("sport_key, points, skill_rating, matches_played, wins")
    .eq("user_id", id)
    .eq("active", true)
    .order("points", { ascending: false });
  const sports = (psRows as PS[] | null) ?? [];
  const mainSport = profile.primary_sport ?? sports[0]?.sport_key ?? null;
  const tint = tintOf(mainSport);

  // Geographic ranking ladder per sport — computed live (0099 RPC).
  const ladders = new Map<string, Rung[]>();
  await Promise.all(
    sports.map(async (ps) => {
      const rungs = await Promise.all(
        SCOPES.map(async (sc) => {
          const region = regionFor(sc.key, profile);
          if (sc.key !== "world" && !region) return { label: sc.label, rank: null, field: 0 } as Rung;
          const { data } = await supabase.rpc("ranked_players", { p_sport: ps.sport_key, p_scope: sc.key, p_region: region });
          const rows = (data as { user_id: string; rank: number }[] | null) ?? [];
          const row = rows.find((r) => r.user_id === id) ?? null;
          return { label: sc.label, rank: row ? Number(row.rank) : null, field: rows.length } as Rung;
        }),
      );
      ladders.set(ps.sport_key, rungs);
    }),
  );

  // Form + recent matches + H2H — all sourced from queue_points (the ledger of
  // completed ranked play; `won` is authoritative).
  const { data: qpRows } = await supabase
    .from("queue_points")
    .select("match_id, sport_key, won, points, earned_at")
    .eq("user_id", id)
    .order("earned_at", { ascending: false })
    .limit(80);
  const qp = qpRows ?? [];
  const formBySport = new Map<string, boolean[]>();
  for (const r of qp) {
    const arr = formBySport.get(r.sport_key) ?? [];
    if (arr.length < 5) arr.push(r.won);
    formBySport.set(r.sport_key, arr);
  }
  const recentQp = qp.filter((r) => r.match_id).slice(0, 5);
  const allIds = [...new Set(qp.filter((r) => r.match_id).map((r) => r.match_id as string))];

  const oppByMatch = new Map<string, string>();
  const scoreByMatch = new Map<string, string | null>();
  const courtIdsRecent: string[] = [];
  let h2h: { wins: number; losses: number; lastMet: string; lastScore: string | null } | null = null;
  if (allIds.length) {
    const [{ data: parts }, { data: ms }] = await Promise.all([
      supabase.from("match_participants").select("match_id, user_id").in("match_id", allIds),
      supabase.from("matches").select("id, result, court_id, scheduled_at").in("id", allIds),
    ]);
    const othersByMatch = new Map<string, string[]>();
    for (const p of parts ?? []) {
      if (p.user_id === id) continue;
      const arr = othersByMatch.get(p.match_id) ?? [];
      arr.push(p.user_id);
      othersByMatch.set(p.match_id, arr);
    }
    const oppIds = [...new Set([...othersByMatch.values()].flat())];
    const nameOf = new Map<string, string>();
    if (oppIds.length) {
      const { data: ops } = await supabase.from("profiles").select("id, display_name").in("id", oppIds);
      for (const o of ops ?? []) nameOf.set(o.id, o.display_name);
    }
    for (const [mid, others] of othersByMatch) {
      const names = others.map((o) => nameOf.get(o)).filter(Boolean) as string[];
      oppByMatch.set(mid, names.length > 1 ? `${names[0]} +${names.length - 1}` : names[0] ?? "an opponent");
    }
    const sortedMs = (ms ?? []).slice().sort((a, b) => (b.scheduled_at ?? "").localeCompare(a.scheduled_at ?? ""));
    for (const m of ms ?? []) scoreByMatch.set(m.id, parseScore(m.result));
    for (const m of sortedMs) if (m.court_id && !courtIdsRecent.includes(m.court_id) && courtIdsRecent.length < 3) courtIdsRecent.push(m.court_id);

    if (!isSelf) {
      const shared = qp.filter((r) => r.match_id && (othersByMatch.get(r.match_id as string) ?? []).includes(user.id));
      if (shared.length) {
        const wins = shared.filter((r) => r.won).length;
        const last = shared[0];
        h2h = { wins, losses: shared.length - wins, lastMet: last.earned_at, lastScore: scoreByMatch.get(last.match_id as string) ?? null };
      }
    }
  }

  // Viewer's safety + relationship state.
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
        supabase.rpc("mutual_connections", { p_other: id, p_limit: 4 }),
      ]);
      context = ctxRows?.[0] ?? null;
      mutualNames = (muts ?? []).map((m: { display_name: string }) => m.display_name);
    }
  }

  if (blockedMe) {
    return (
      <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
        <div className="rounded-2xl border border-dashed border-rule bg-surface p-10 text-center">
          <p className="text-lg font-bold text-ink">This profile isn&rsquo;t available.</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-mute">The player may have changed their settings or is no longer active.</p>
          <Link href="/network" className="press mt-4 inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-surface">Back to your network</Link>
        </div>
      </div>
    );
  }

  if (blocked) {
    return (
      <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
        <BackPill />
        <div className="mt-5 rounded-2xl border border-rule bg-surface shadow-e1 p-10 text-center">
          <Ban className="mx-auto text-faint" size={24} />
          <p className="mt-2 text-lg font-bold text-ink">You&rsquo;ve blocked {profile.display_name}.</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-mute">They can&rsquo;t see you anywhere on Klimr, and you won&rsquo;t see their activity.</p>
          <form action={unblockUser} className="mt-4">
            <input type="hidden" name="userId" value={profile.id} />
            <button className="press rounded-full border border-rule-2 bg-surface px-4 py-2 text-sm font-semibold text-ink-soft hover:text-ink">Unblock</button>
          </form>
        </div>
      </div>
    );
  }

  // ── side data (privacy-gated; hidden when empty) ──────────────────────
  const gallery = (Array.isArray(profile.profile_gallery) ? (profile.profile_gallery as { url?: string; caption?: string }[]) : [])
    .filter((g) => typeof g?.url === "string")
    .slice(0, 12);
  const gear = (Array.isArray(profile.gear) ? (profile.gear as { category?: string; model?: string; spec?: string | null }[]) : []).filter(
    (g) => typeof g?.model === "string" && g.model,
  );

  let teams: { id: string; name: string; sport_key: string; role: string; players: number; area: string | null }[] = [];
  if (profile.show_teams) {
    const { data: tm } = await supabase.from("team_members").select("team_id, role").eq("user_id", id);
    const tIds = (tm ?? []).map((x) => x.team_id);
    if (tIds.length) {
      const [{ data: ts }, { data: counts }] = await Promise.all([
        supabase.from("teams").select("id, name, sport_key, city, neighborhood").in("id", tIds).is("deleted_at", null),
        supabase.from("team_members").select("team_id").in("team_id", tIds),
      ]);
      const nById = new Map<string, number>();
      for (const c of counts ?? []) nById.set(c.team_id, (nById.get(c.team_id) ?? 0) + 1);
      const roleById = new Map((tm ?? []).map((x) => [x.team_id, x.role]));
      teams = (ts ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        sport_key: t.sport_key,
        role: roleById.get(t.id) ?? "member",
        players: nById.get(t.id) ?? 1,
        area: t.neighborhood ?? t.city,
      }));
    }
  }

  let tourns: { id: string; code: string; title: string; inBracket: boolean; endsAt: string | null }[] = [];
  if (profile.show_tournaments) {
    const [{ data: regs }, { data: asPlayer }] = await Promise.all([
      supabase.from("tournament_registrations").select("tournament_id").eq("registrant_id", id).in("status", ["pending", "confirmed", "under_review"]),
      supabase.from("tournament_registration_players").select("tournament_id").eq("user_id", id),
    ]);
    const tIds = [...new Set([...(regs ?? []).map((r) => r.tournament_id), ...(asPlayer ?? []).map((r) => r.tournament_id)])];
    if (tIds.length) {
      const { data: ts } = await supabase
        .from("tournaments")
        .select("id, code, title, status, starts_at, cancelled_at")
        .in("id", tIds)
        .is("cancelled_at", null)
        .neq("status", "completed");
      tourns = (ts ?? []).map((t) => ({ id: t.id, code: t.code, title: t.title, inBracket: t.status === "in_progress", endsAt: t.starts_at }));
    }
  }

  let courts: { id: string; name: string; mi: number | null }[] = [];
  if (profile.show_courts && courtIdsRecent.length) {
    const { data: me } = await supabase.from("profiles").select("home_zip").eq("id", user.id).maybeSingle();
    const viewerPt = me?.home_zip ? lookupZip(me.home_zip) : null;
    const { data: cs } = await supabase.from("courts").select("id, name, lat, lng").in("id", courtIdsRecent);
    courts = (cs ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      mi: viewerPt && c.lat != null && c.lng != null ? Math.round(haversineMi({ lat: viewerPt.lat, lng: viewerPt.lng }, { lat: c.lat, lng: c.lng }) * 10) / 10 : null,
    }));
  }

  // ── derived hero numbers ───────────────────────────────────────────────
  const totalMatches = sports.reduce((a, s) => a + s.matches_played, 0);
  const totalWins = sports.reduce((a, s) => a + s.wins, 0);
  const totalLosses = Math.max(0, totalMatches - totalWins);
  const totalPoints = sports.reduce((a, s) => a + s.points, 0);
  const winRate = totalMatches ? totalWins / totalMatches : 0;
  let peak: { rank: number; sport: string; scope: string } | null = null;
  for (const [sk, rungs] of ladders) {
    for (const rg of rungs) {
      if (rg.rank != null && (!peak || rg.rank < peak.rank)) peak = { rank: rg.rank, sport: sk, scope: rg.label };
    }
  }
  const badges: { label: string; Icon: typeof Medal; cls: string }[] = [];
  if (profile.verification_status === "verified") badges.push({ label: "Verified identity", Icon: BadgeCheck, cls: "border-[#FFD4BC] bg-tint-brand text-brand-deep" });
  if (profile.reliability >= 95) badges.push({ label: "Highly reliable", Icon: ShieldCheck, cls: "border-[#CFE8D5] bg-[#EFF8F0] text-[#217A34]" });
  if (totalMatches >= 50) badges.push({ label: "Veteran · 50+ matches", Icon: Medal, cls: "border-[#EFE0B4] bg-[#FBF3DE] text-[#A16207]" });
  if (sports.length >= 2) badges.push({ label: "Multi-sport", Icon: Grid2x2, cls: "border-rule bg-bg text-ink-soft" });

  const contextChips = context ? buildContextChips(context) : [];
  const age = displayAge(profile.date_of_birth, profile.birth_year);
  const first = profile.display_name.split(" ")[0];
  const avatarUrl = profile.avatar_path ? supabase.storage.from("avatars").getPublicUrl(profile.avatar_path).data.publicUrl : null;
  const winPctCls = (w: number, m: number) => {
    const pct = m ? (w / m) * 100 : 0;
    return pct >= 70 ? "text-[#2F9E44]" : pct >= 45 ? "text-[#D97706]" : "text-[#7A8699]";
  };

  const statTile = (k: string, v: string, sub: string) => (
    <div className="rounded-2xl border border-[#EFE9DC] bg-bg px-4 py-3">
      <p className={`${mono} text-[8.5px] font-bold uppercase tracking-[.16em] text-faint`}>{k}</p>
      <p className="mt-1 font-display text-[19px] font-bold leading-none text-ink">{v}</p>
      <p className={`${mono} mt-1 text-[9px] uppercase tracking-wide text-faint`}>{sub}</p>
    </div>
  );

  return (
    <div className="mx-auto max-w-[1180px] px-5 py-8 sm:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackPill />
        <p className={`${mono} text-[10px] font-bold uppercase tracking-[.2em] text-flame-text`}>Community — Player profile</p>
      </div>

      {notice === "chat" ? <p className="mt-4 rounded-[12px] border border-[#f0c2b0] bg-[#fbeee7] px-3.5 py-2.5 text-[13px] font-semibold text-[#b91c1c]">Couldn&rsquo;t open the chat right now.</p> : null}

      {/* ── hero ───────────────────────────────────────────────────── */}
      <section className="mt-5 overflow-hidden rounded-[22px] border border-rule bg-surface shadow-e2">
        <div className="relative h-[84px]" style={{ background: `linear-gradient(120deg, ${tint.bg} 0%, #FFFFFF 72%)` }}>
          <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 600 84" aria-hidden>
            <polyline points="0,70 90,38 170,58 260,22 340,48 430,16 520,40 600,24" fill="none" stroke="#201B12" strokeOpacity="0.14" strokeWidth="1.5" />
            <polyline points="0,80 110,56 200,72 300,42 400,62 500,36 600,52" fill="none" stroke="#201B12" strokeOpacity="0.08" strokeWidth="1.5" />
          </svg>
        </div>
        <div className="px-5 pb-5 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex min-w-0 items-end gap-4">
              <div className="relative -mt-[39px] shrink-0">
                <span className="block rounded-full ring-4 ring-white">
                  <AvatarLightbox url={avatarUrl} hue={profile.avatar_hue} name={profile.display_name} size={78} />
                </span>
                {profile.verification_status === "verified" ? (
                  <span className="absolute -bottom-0.5 -right-0.5 grid h-[22px] w-[22px] place-items-center rounded-full bg-[#D63A0F] ring-2 ring-white">
                    <BadgeCheck size={13} className="text-white" />
                  </span>
                ) : null}
              </div>
              <div className="min-w-0 pb-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-display text-[28px] font-bold leading-none tracking-[-0.02em] text-ink">{profile.display_name}</h1>
                  {mainSport ? (
                    <span className="rounded-full border px-2.5 py-1 text-[11px] font-bold" style={{ background: tint.bg, borderColor: tint.bd, color: tint.fg }}>
                      {sportMeta(mainSport).emoji} {sportMeta(mainSport).name}
                    </span>
                  ) : null}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-mute">
                  <span className="inline-flex items-center gap-1"><MapPin size={12} /> {[profile.neighborhood ?? profile.city, profile.state].filter(Boolean).join(", ") || "Location unset"}</span>
                  {age ? <span>{age}</span> : null}
                  {profile.reliability >= 85 ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-[#CFE8D5] bg-[#EFF8F0] px-2 py-0.5 font-semibold text-[#217A34]">
                      <ShieldCheck size={11} /> <span className={mono}>{profile.reliability} · {reliabilityLabel(profile.reliability).toUpperCase()}</span>
                    </span>
                  ) : null}
                  <span className="text-faint">Member since {new Date(profile.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span>
                </div>
                {contextChips.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {contextChips.map((c) => (
                      <span key={c} className="rounded-full border border-[#EFE9DC] bg-bg px-2.5 py-1 text-[11px] font-semibold text-ink-soft">{c}</span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {isSelf ? (
                <Link href="/settings/profile-page" className="press inline-flex items-center gap-1.5 rounded-full border border-rule-2 bg-surface px-4 py-2.5 text-sm font-semibold text-ink-soft hover:text-ink">
                  <Pencil size={14} /> Edit profile
                </Link>
              ) : (
                <>
                  <Link
                    href="/play/new"
                    className="press inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-bold text-white shadow-flame hover:brightness-[1.06]"
                    style={{ background: "linear-gradient(140deg, #FF6A35, #E23E0D)" }}
                  >
                    <Swords size={15} /> Challenge {first}
                  </Link>
                  <RelationshipButtons targetId={profile.id} friendStatus={friendStatus} isFollowing={isFollowing} />
                  <ProfileMenu userId={profile.id} name={profile.display_name} alreadyReported={reported} />
                </>
              )}
            </div>
          </div>

          {badges.length ? (
            <div className="mt-4 flex flex-wrap gap-1.5 border-t border-rule-soft pt-3.5">
              {badges.map((b) => (
                <span key={b.label} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold ${b.cls}`}>
                  <b.Icon size={12} /> {b.label}
                </span>
              ))}
            </div>
          ) : null}

          <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            {statTile("Peak rank", peak ? `#${peak.rank}` : "—", peak ? `${sportMeta(peak.sport).name} · ${peak.scope}`.toUpperCase() : "UNRANKED")}
            {statTile("Ranking points", totalPoints.toLocaleString("en-US"), "ALL SPORTS")}
            {statTile("Season record", `${totalWins}–${totalLosses}`, `${Math.round(winRate * 100)}% WIN RATE`)}
            {statTile("On Klimr", fmtMonYr(profile.created_at), "MEMBER")}
          </div>
        </div>
      </section>

      {/* ── main grid ──────────────────────────────────────────────── */}
      <div className="mt-6 grid gap-[22px] lg:grid-cols-[minmax(0,1fr)_336px]">
        <div className="min-w-0">
          <p className={`${mono} text-[9.5px] font-bold uppercase tracking-[.18em] text-faint`}>Rankings · ZIP to world</p>

          <div className="mt-3 grid gap-4">
            {sports.map((ps) => {
              const st = tintOf(ps.sport_key);
              const rungs = ladders.get(ps.sport_key) ?? [];
              const zip = rungs.find((r) => r.label === "ZIP");
              const rest = rungs.filter((r) => r.label !== "ZIP");
              const losses = Math.max(0, ps.matches_played - ps.wins);
              const form = formBySport.get(ps.sport_key) ?? [];
              return (
                <div key={ps.sport_key} className="rounded-3xl border border-rule bg-surface shadow-e1 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="grid h-10 w-10 place-items-center rounded-xl border text-lg" style={{ background: st.bg, borderColor: st.bd }}>{sportMeta(ps.sport_key).emoji}</span>
                      <div>
                        <p className="flex items-center gap-2 font-display text-lg font-bold text-ink">
                          {sportMeta(ps.sport_key).name}
                          {ps.sport_key === mainSport ? <span className={`${mono} rounded-full border border-[#FFD4BC] bg-tint-brand px-2 py-0.5 text-[8.5px] font-bold uppercase tracking-wider text-brand-deep`}>Main sport</span> : null}
                        </p>
                        <p className={`${mono} mt-0.5 text-[11px] uppercase text-faint`}>{ps.points.toLocaleString("en-US")} pts{ps.skill_rating != null ? ` · skill ${ps.skill_rating.toFixed(1)}` : ""}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`${mono} text-sm font-bold text-ink`}>{ps.wins}–{losses} <span className={winPctCls(ps.wins, ps.matches_played)}>{ps.matches_played ? `${Math.round((ps.wins / ps.matches_played) * 100)}%` : "—"}</span></p>
                      <p className={`${mono} mt-1 flex items-center justify-end gap-1 text-[8.5px] font-bold uppercase tracking-wider text-faint`}>
                        Form
                        <span className="ml-1 inline-flex gap-1">
                          {[...form].reverse().map((w, i) => (
                            <span key={i} className="h-[7px] w-[7px] rounded-full" style={{ background: w ? "#2F9E44" : "#D92D20" }} />
                          ))}
                          {form.length === 0 ? <span className="text-faint">—</span> : null}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-[1.45fr_1fr_1fr_1fr_1fr]">
                    <div className="rounded-xl border border-[#FFD4BC] bg-tint-brand px-3 py-2.5">
                      <p className={`${mono} flex items-center justify-between text-[8.5px] font-bold uppercase tracking-wider text-brand-deep`}>
                        ZIP {zip?.rank && zip.field ? <span>Top {Math.max(1, Math.round((zip.rank / zip.field) * 100))}%</span> : null}
                      </p>
                      <p className="mt-0.5 font-display text-[22px] font-bold leading-none text-ink">{zip?.rank ? `#${zip.rank}` : "—"}</p>
                      <p className={`${mono} mt-0.5 text-[9px] text-faint`}>of {zip?.field ?? 0}</p>
                    </div>
                    {rest.map((r) => (
                      <div key={r.label} className="rounded-xl border border-[#EFE9DC] bg-bg px-3 py-2.5">
                        <p className={`${mono} text-[8.5px] font-bold uppercase tracking-wider text-faint`}>{r.label}</p>
                        <p className="mt-0.5 text-base font-bold leading-none text-ink">{r.rank ? `#${r.rank}` : "—"}</p>
                        <p className={`${mono} mt-0.5 text-[9px] text-faint`}>of {r.field}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {sports.length === 0 ? <div className="rounded-3xl border border-dashed border-rule bg-surface p-8 text-center text-sm text-mute">{first} hasn&rsquo;t activated any sports yet.</div> : null}
          </div>

          {gallery.length > 0 ? (
            <div className="mt-5 rounded-3xl border border-rule bg-surface shadow-e1 p-5">
              <p className={`${mono} flex items-center justify-between text-[9.5px] font-bold uppercase tracking-[.18em] text-faint`}>
                Photo gallery <span>{gallery.length} photos</span>
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {gallery.slice(0, 6).map((g, i) => (
                  <div key={i} className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-rule">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={g.url} alt={g.caption ?? ""} className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]" />
                    {g.caption ? (
                      <span className="absolute inset-x-0 bottom-0 px-2.5 py-1.5 text-[10.5px] font-semibold text-white" style={{ background: "linear-gradient(180deg, transparent, rgba(32,27,18,.55))" }}>
                        {g.caption}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {recentQp.length > 0 ? (
            <div className="mt-5 rounded-3xl border border-rule bg-surface shadow-e1 p-5">
              <p className={`${mono} text-[9.5px] font-bold uppercase tracking-[.18em] text-faint`}>Recent matches</p>
              <div className="mt-2 divide-y divide-rule-soft">
                {recentQp.map((m) => (
                  <div key={m.match_id as string} className="flex items-center gap-3 py-2.5">
                    <span className={`${mono} grid h-[26px] w-[26px] shrink-0 place-items-center rounded-lg text-[11px] font-bold ${m.won ? "bg-[#EFF8F0] text-[#217A34]" : "bg-[#FDECEA] text-[#D92D20]"}`}>{m.won ? "W" : "L"}</span>
                    <span className="text-base">{sportMeta(m.sport_key).emoji}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-ink">{m.won ? "df." : "lost to"} {oppByMatch.get(m.match_id as string) ?? "an opponent"}</span>
                      {scoreByMatch.get(m.match_id as string) ? <span className={`${mono} block text-[10px] text-faint`}>{scoreByMatch.get(m.match_id as string)}</span> : null}
                    </span>
                    <span className={`${mono} shrink-0 text-[10px] uppercase text-faint`}>{fmtDay(m.earned_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* ── right rail ─────────────────────────────────────────────── */}
        <div className="grid content-start gap-4">
          {!isSelf ? (
            <div className="relative overflow-hidden rounded-3xl p-5 text-white shadow-e2" style={{ background: "linear-gradient(150deg, #FF6A35, #E23E0D)" }}>
              <svg className="absolute inset-0 h-full w-full opacity-[0.14]" preserveAspectRatio="none" viewBox="0 0 336 220" aria-hidden>
                <polyline points="0,190 60,120 110,160 180,70 240,130 300,50 336,90" fill="none" stroke="#fff" strokeWidth="2" />
              </svg>
              <p className={`${mono} relative text-[9.5px] font-bold uppercase tracking-[.18em] text-white/80`}>Head-to-head</p>
              {h2h ? (
                <div className="relative">
                  <p className="mt-2 font-display text-[38px] font-bold leading-none">You {h2h.wins} – {h2h.losses} {first}</p>
                  <p className="mt-2 text-[13px] text-white/85">
                    Last met {fmtMonYr(h2h.lastMet)}{h2h.wins + h2h.losses > 0 ? ` — you ${h2h.wins > h2h.losses ? "lead" : h2h.wins < h2h.losses ? "trail" : "are level"}` : ""}{h2h.lastScore ? ` · ${h2h.lastScore}` : ""}
                  </p>
                  <Link href="/play/new" className="press mt-4 inline-flex rounded-full bg-white px-4 py-2 text-sm font-bold text-[#C2410C] hover:bg-white/90">
                    Challenge {first} again
                  </Link>
                </div>
              ) : (
                <div className="relative">
                  <p className="mt-2 font-display text-[21px] font-bold leading-tight">First meeting.</p>
                  <p className="mt-1 text-[13px] text-white/85">You&rsquo;ve never faced {first} — settle it on court.</p>
                  <Link href="/play/new" className="press mt-4 inline-flex rounded-full bg-white px-4 py-2 text-sm font-bold text-[#C2410C] hover:bg-white/90">
                    Challenge {first}
                  </Link>
                </div>
              )}
            </div>
          ) : null}

          {teams.length > 0 || tourns.length > 0 ? (
            <div className="rounded-3xl border border-rule bg-surface shadow-e1 p-5">
              <p className={`${mono} text-[9.5px] font-bold uppercase tracking-[.18em] text-faint`}>Teams &amp; tournaments</p>
              <div className="mt-2 grid gap-1">
                {teams.map((t) => {
                  const st = tintOf(t.sport_key);
                  return (
                    <Link key={t.id} href={`/teams/${t.id}`} className="press -mx-2 flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-bg">
                      <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-lg border text-base" style={{ background: st.bg, borderColor: st.bd }}>{sportMeta(t.sport_key).emoji}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[13px] font-bold text-ink">{t.name}</span>
                          <span className={`${mono} shrink-0 rounded-full border px-1.5 py-0.5 text-[8px] font-bold uppercase`} style={{ background: st.bg, borderColor: st.bd, color: st.fg }}>
                            {t.role === "captain" ? "Captain" : t.role === "co_captain" ? "Co-captain" : "Player"}
                          </span>
                        </span>
                        <span className="block text-[11px] text-faint">{t.players} players{t.area ? ` · ${t.area}` : ""}</span>
                      </span>
                      <ChevronRight size={14} className="shrink-0 text-faint" />
                    </Link>
                  );
                })}
                {tourns.map((t) => (
                  <Link key={t.id} href={`/e/${t.code}`} className="press -mx-2 flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-bg">
                    <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-lg border border-[#EFE9DC] bg-bg"><Trophy size={15} className="text-ink-soft" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[13px] font-bold text-ink">{t.title}</span>
                        {t.inBracket ? (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#CFE8D5] bg-[#EFF8F0] px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase text-[#217A34]">
                            <span className="live-dot h-1.5 w-1.5 rounded-full bg-[#2F9E44]" /> In bracket
                          </span>
                        ) : (
                          <span className={`${mono} shrink-0 rounded-full border border-[#FFD4BC] bg-tint-brand px-1.5 py-0.5 text-[8px] font-bold uppercase text-brand-deep`}>Registered</span>
                        )}
                      </span>
                      {t.endsAt ? <span className="block text-[11px] text-faint">Starts {fmtDay(t.endsAt)}</span> : null}
                    </span>
                    <ChevronRight size={14} className="shrink-0 text-faint" />
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          {gear.length > 0 ? (
            <div className="rounded-3xl border border-rule bg-surface shadow-e1 p-5">
              <p className={`${mono} flex items-center justify-between text-[9.5px] font-bold uppercase tracking-[.18em] text-faint`}>
                Gear bag <span>Player-listed</span>
              </p>
              <div className="mt-2 grid gap-2">
                {gear.map((g, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg border border-[#EFE9DC] bg-bg text-sm">
                      {g.category === "shoes" ? "👟" : g.category === "strings" ? "🧵" : g.category === "bag" ? "🎒" : "🎾"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`${mono} block text-[7.5px] font-bold uppercase tracking-wider text-faint`}>{g.category}</span>
                      <span className="block truncate text-[12.5px] font-semibold text-ink">{g.model}</span>
                    </span>
                    {g.spec ? <span className={`${mono} shrink-0 text-[10px] text-faint`}>{g.spec}</span> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {courts.length > 0 ? (
            <div className="rounded-3xl border border-rule bg-surface shadow-e1 p-5">
              <p className={`${mono} text-[9.5px] font-bold uppercase tracking-[.18em] text-faint`}>Plays at</p>
              <div className="mt-2 grid gap-1">
                {courts.map((c) => (
                  <Link key={c.id} href={`/courts/${c.id}`} className="press -mx-2 flex items-center gap-2.5 rounded-xl px-2 py-2 hover:bg-bg">
                    <MapPin size={14} className="shrink-0 text-ink-soft" />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{c.name}</span>
                    {c.mi != null ? <span className={`${mono} shrink-0 text-[10px] text-faint`}>{c.mi} mi</span> : null}
                  </Link>
                ))}
              </div>
              {profile.usual_times ? (
                <p className="mt-2 flex items-center gap-1.5 border-t border-rule-soft pt-2.5 text-[11px] text-mute">
                  <Clock size={12} /> {profile.usual_times}
                </p>
              ) : null}
            </div>
          ) : null}

          {!isSelf && mutualNames.length > 0 ? (
            <Link href="/network" className="press rounded-3xl border border-rule bg-surface shadow-e1 p-5 transition-all hover:-translate-y-0.5 hover:shadow-e2">
              <p className={`${mono} text-[9.5px] font-bold uppercase tracking-[.18em] text-faint`}>Mutual network</p>
              <div className="mt-2.5 flex items-center gap-3">
                <span className="flex">
                  {mutualNames.slice(0, 4).map((n, i) => (
                    <span key={i} className="grid h-[26px] w-[26px] place-items-center rounded-full text-[10px] font-bold text-white ring-2 ring-white" style={{ background: `oklch(0.62 0.14 ${(i * 87 + 40) % 360})`, marginLeft: i ? -8 : 0 }}>
                      {n.slice(0, 1).toUpperCase()}
                    </span>
                  ))}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-ink"><Users size={12} className="mr-1 inline" />{mutualNames.length}{mutualNames.length >= 4 ? "+" : ""} mutual connections</span>
                  <span className="block truncate text-[11px] text-faint">{mutualNames.slice(0, 3).join(", ")}</span>
                </span>
              </div>
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
