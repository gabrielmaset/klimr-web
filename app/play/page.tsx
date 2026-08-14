const nowMs = () => Date.now();

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { sportMeta, matchFormatLabel } from "@/lib/sports";
import { lookupZip } from "@/lib/us-places";
import { PlayBrowser, type PlayMatch, type CourtOpt } from "@/components/play/play-browser";

export const metadata: Metadata = { title: "Play" };

type Org = { id: string; display_name: string; avatar_hue: number };
type Part = { match_id: string; user_id: string };

/** Next meeting of a recurring match (weekly / biweekly / monthly),
 *  rolled forward from the original date until it's upcoming. */
function nextOccurrenceMs(iso: string, recurrence: string | null): number {
  const floor = nowMs() - 2 * 3_600_000;
  const t = Date.parse(iso);
  if (t >= floor) return t;
  if (recurrence === "monthly") {
    const d = new Date(iso);
    while (d.getTime() < floor) d.setMonth(d.getMonth() + 1);
    return d.getTime();
  }
  const step = (recurrence === "biweekly" ? 14 : 7) * 86_400_000;
  return t + Math.ceil((floor - t) / step) * step;
}

/** The browse surface is one client component fed by ONE server assembly —
 *  every filter, count, and sort recomputes instantly client-side against
 *  this payload, and the URL carries the whole filter state
 *  (?sport=&court=&when=&date=&open=&sort=). Design: KLIMR-PLAY-HANDOFF. */
export default async function PlayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/play");

  const query = supabase
    .from("matches")
    .select("*")
    .in("status", ["open", "scheduled"])
    // Industry pattern (Eventbrite et al.): discovery shows upcoming only.
    // A 2-hour grace keeps a just-started match joinable; recurring
    // templates and unscheduled matches always show. Past matches stay
    // reachable via direct links and history views.
    .or(`scheduled_at.gte.${new Date(nowMs() - 2 * 3_600_000).toISOString()},scheduled_at.is.null,recurring.eq.true`)
    .order("scheduled_at", { ascending: true, nullsFirst: false });
  const { data: matches } = await query;
  // Reliability belt: whatever the wire filter admits, PAST non-recurring
  // matches never render. Deterministic, in one place.
  const all = (matches ?? [])
    .filter((m) => m.recurring || !m.scheduled_at || Date.parse(m.scheduled_at) >= nowMs() - 2 * 3_600_000)
    .map((m) => ({
      ...m,
      effective_at: m.scheduled_at
        ? m.recurring
          ? new Date(nextOccurrenceMs(m.scheduled_at, m.recurrence)).toISOString()
          : m.scheduled_at
        : null,
    }))
    .sort((a, b) => (a.effective_at ? Date.parse(a.effective_at) : Infinity) - (b.effective_at ? Date.parse(b.effective_at) : Infinity));

  type Wl = { match_id: string; requester_id: string; status: string; waitlist_position: number | null; offer_expires_at: string | null };
  let orgs: Org[] = [];
  let parts: Part[] = [];
  let wl: Wl[] = [];
  if (all.length) {
    const organizerIds = [...new Set(all.map((m) => m.organizer_id))];
    const matchIds = all.map((m) => m.id);
    const [o, p, w] = await Promise.all([
      supabase.from("profiles").select("id, display_name, avatar_hue").in("id", organizerIds),
      supabase.from("match_participants").select("match_id, user_id").in("match_id", matchIds),
      supabase
        .from("join_requests")
        .select("match_id, requester_id, status, waitlist_position, offer_expires_at")
        .in("match_id", matchIds)
        .in("status", ["waitlisted", "offered"]),
    ]);
    orgs = (o.data as Org[] | null) ?? [];
    parts = (p.data as Part[] | null) ?? [];
    wl = (w.data as Wl[] | null) ?? [];
  }
  const orgMap = new Map(orgs.map((o) => [o.id, o]));

  const courtIds = [...new Set(all.map((m) => m.court_id).filter(Boolean) as string[])];
  let courtMap = new Map<string, { id: string; name: string; city: string | null; lat: number | null; lng: number | null }>();
  if (courtIds.length) {
    const { data: cs } = await supabase.from("courts").select("id, name, city, lat, lng").in("id", courtIds);
    courtMap = new Map(((cs as { id: string; name: string; city: string | null; lat: number | null; lng: number | null }[] | null) ?? []).map((c) => [c.id, c]));
  }

  const { data: me } = await supabase
    .from("profile_private")
    .select("home_zip, display_name, avatar_hue, avatar_path")
    .eq("id", user.id)
    .maybeSingle();
  const homePt = me?.home_zip ? lookupZip(me.home_zip) : null;
  const R = 3958.8;
  const mi = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
    const dla = ((b.lat - a.lat) * Math.PI) / 180;
    const dln = ((b.lng - a.lng) * Math.PI) / 180;
    const s = Math.sin(dla / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dln / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  };
  const distTo = (lat: number | null, lng: number | null): number | null =>
    homePt && lat != null && lng != null ? Math.round(mi(homePt, { lat, lng }) * 10) / 10 : null;

  // Court dropdown options: courts near home + every court a match points at.
  const courtOpts = new Map<string, CourtOpt>();
  if (homePt) {
    const dLat = 0.22,
      dLng = 0.26;
    const { data: nc } = await supabase
      .from("courts")
      .select("id, name, city, lat, lng")
      .not("lat", "is", null)
      .gte("lat", homePt.lat - dLat)
      .lte("lat", homePt.lat + dLat)
      .gte("lng", homePt.lng - dLng)
      .lte("lng", homePt.lng + dLng)
      .limit(60);
    for (const c of nc ?? []) {
      courtOpts.set(c.id, { id: c.id, name: c.name, city: c.city, distanceMi: distTo(c.lat, c.lng) });
    }
  }
  for (const [id, c] of courtMap) {
    if (!courtOpts.has(id)) courtOpts.set(id, { id, name: c.name, city: c.city, distanceMi: distTo(c.lat, c.lng) });
  }
  const courts = [...courtOpts.values()].sort((a, b) => (a.distanceMi ?? 999) - (b.distanceMi ?? 999)).slice(0, 40);

  // Faces on cards: everyone already in each match (batched — two queries for
  // the whole page, never per-card).
  const facesByMatch = new Map<string, { name: string; url: string | null; hue: number }[]>();
  const shownIds = all.map((m) => m.id);
  if (shownIds.length) {
    const { data: fp } = await supabase
      .from("match_participants")
      .select("match_id, user_id, joined_at")
      .in("match_id", shownIds)
      .order("joined_at", { ascending: true });
    const uids = [...new Set((fp ?? []).map((x) => x.user_id))];
    if (uids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, display_name, avatar_path, avatar_hue").in("id", uids);
      const profMap = new Map((profs ?? []).map((pr) => [pr.id, pr]));
      for (const x of fp ?? []) {
        const pr = profMap.get(x.user_id);
        if (!pr) continue;
        const arr = facesByMatch.get(x.match_id) ?? [];
        arr.push({
          name: pr.display_name,
          url: pr.avatar_path ? supabase.storage.from("avatars").getPublicUrl(pr.avatar_path).data.publicUrl : null,
          hue: pr.avatar_hue,
        });
        facesByMatch.set(x.match_id, arr);
      }
    }
  }

  const countMap = new Map<string, number>();
  const mineSet = new Set<string>();
  for (const p of parts) {
    countMap.set(p.match_id, (countMap.get(p.match_id) ?? 0) + 1);
    if (p.user_id === user.id) mineSet.add(p.match_id);
  }
  const nowIsoWl = new Date().toISOString();
  const wlCountMap = new Map<string, number>();
  const wlMine = new Map<string, Wl>();
  for (const r of wl) {
    if (r.status === "waitlisted") wlCountMap.set(r.match_id, (wlCountMap.get(r.match_id) ?? 0) + 1);
    if (r.requester_id === user.id) {
      // An offer past its deadline renders as nothing — the sweep will
      // formalize the expiry within the minute.
      if (r.status === "offered" && (!r.offer_expires_at || r.offer_expires_at < nowIsoWl)) continue;
      wlMine.set(r.match_id, r);
    }
  }

  const payload: PlayMatch[] = all.map((m) => {
    const c = m.court_id ? courtMap.get(m.court_id) : null;
    const org = orgMap.get(m.organizer_id);
    const joinedCount = countMap.get(m.id) ?? 0;
    return {
      id: m.id,
      sportKey: m.sport_key,
      sportName: sportMeta(m.sport_key).name,
      formatLabel: matchFormatLabel(m.sport_key, m.format),
      effectiveAt: m.effective_at,
      recurrence: m.recurring ? (m.recurrence ?? "weekly") : null,
      courtId: m.court_id ?? null,
      courtName: c?.name ?? m.location_text ?? null,
      distanceMi: c ? distTo(c.lat, c.lng) : null,
      totalSlots: m.total_slots ?? 2,
      skillMin: m.skill_min ?? null,
      skillMax: m.skill_max ?? null,
      joinedCount,
      waitlistCount: wlCountMap.get(m.id) ?? 0,
      wlStatus: (wlMine.get(m.id)?.status as "waitlisted" | "offered" | undefined) ?? null,
      wlPosition: wlMine.get(m.id)?.waitlist_position ?? null,
      wlExpiresAt: wlMine.get(m.id)?.offer_expires_at ?? null,
      players: (facesByMatch.get(m.id) ?? []).slice(0, 4),
      hostName: org?.display_name ?? "a member",
      isHost: m.organizer_id === user.id,
      isJoined: mineSet.has(m.id),
    };
  });

  const viewer = {
    name: me?.display_name ?? "You",
    hue: me?.avatar_hue ?? 24,
    url: me?.avatar_path ? supabase.storage.from("avatars").getPublicUrl(me.avatar_path).data.publicUrl : null,
  };

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-flame-text">Compete — Play</p>
          <h1 className="mt-1.5 font-display text-[40px] font-bold leading-none tracking-[-0.025em] text-ink">Play</h1>
          <p className="mt-1 text-sm text-mute">Find an open match near you — or organize your own.</p>
        </div>
        <Link
          href="/play/new"
          className="press inline-flex h-10 items-center gap-2 rounded-[11px] px-4 text-sm font-bold text-white shadow-flame transition-[filter] hover:brightness-[1.06]"
          style={{ background: "linear-gradient(140deg, #FF6A35, #E23E0D)" }}
        >
          <Plus size={16} strokeWidth={2.75} /> Organize a match
        </Link>
      </div>

      <PlayBrowser matches={payload} courts={courts} viewer={viewer} radiusMi={15} />
    </div>
  );
}
