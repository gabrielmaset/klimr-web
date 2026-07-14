import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock, MapPin, Users, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SPORTS, sportMeta, sportSlug } from "@/lib/sports";
import { FilterGroup, FacetLink } from "@/components/filter-chips";
import { PlayCourtFilter } from "@/components/play-court-filter";
import { lookupZip } from "@/lib/us-places";
import type { CourtHit } from "@/app/play/court-actions";

export const metadata: Metadata = { title: "Play" };

type Org = { id: string; display_name: string; avatar_hue: number };
type Part = { match_id: string; user_id: string };

function whenLabel(scheduledAt: string | null) {
  if (!scheduledAt) return "Open — anytime";
  return new Date(scheduledAt).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function PlayPage({
  searchParams,
}: {
  searchParams: Promise<{ sport?: string; court?: string }>;
}) {
  const { sport, court } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/play");

  const query = supabase
    .from("matches")
    .select("*")
    .in("status", ["open", "scheduled"])
    .order("scheduled_at", { ascending: true, nullsFirst: false });
  const activeSport = sport && SPORTS.some((s) => s.key === sport) ? sport : null;
  const { data: matches } = await query;
  const all = matches ?? [];
  const sportCounts = new Map<string, number>();
  for (const m of all) sportCounts.set(m.sport_key, (sportCounts.get(m.sport_key) ?? 0) + 1);
  const list = activeSport ? all.filter((m) => m.sport_key === activeSport) : all;

  let orgs: Org[] = [];
  let parts: Part[] = [];
  if (list.length) {
    const organizerIds = [...new Set(list.map((m) => m.organizer_id))];
    const matchIds = list.map((m) => m.id);
    const [o, p] = await Promise.all([
      supabase.from("profiles").select("id, display_name, avatar_hue").in("id", organizerIds),
      supabase.from("match_participants").select("match_id, user_id").in("match_id", matchIds),
    ]);
    orgs = (o.data as Org[] | null) ?? [];
    parts = (p.data as Part[] | null) ?? [];
  }
  const orgMap = new Map(orgs.map((o) => [o.id, o]));

  const courtIds = [...new Set(all.map((m) => m.court_id).filter(Boolean) as string[])];
  let courtMap = new Map<string, { id: string; name: string }>();
  if (courtIds.length) {
    const { data: cs } = await supabase.from("courts").select("id, name").in("id", courtIds);
    courtMap = new Map(((cs as { id: string; name: string }[] | null) ?? []).map((c) => [c.id, c]));
  }
  // ── court filter: ANY court is selectable (zero matches is a valid answer);
  //    the default list is courts near the member's home ZIP with live counts ──
  let activeCourtObj: { id: string; name: string } | null = null;
  if (court) {
    const known = courtMap.get(court);
    if (known) activeCourtObj = known;
    else {
      const { data: c1 } = await supabase.from("courts").select("id, name").eq("id", court).maybeSingle();
      if (c1) activeCourtObj = c1;
    }
  }
  const activeCourt = activeCourtObj?.id ?? null;
  const courtCounts: Record<string, number> = {};
  for (const m of list) {
    if (m.court_id) courtCounts[m.court_id] = (courtCounts[m.court_id] ?? 0) + 1;
  }
  const { data: me } = await supabase.from("profiles").select("home_zip").eq("id", user.id).maybeSingle();
  const homePt = me?.home_zip ? lookupZip(me.home_zip) : null;
  let nearbyCourts: CourtHit[] = [];
  if (homePt) {
    const dLat = 0.22, dLng = 0.26;
    let ncq = supabase
      .from("courts")
      .select("id, name, city, state, zip, lat, lng")
      .not("lat", "is", null)
      .gte("lat", homePt.lat - dLat)
      .lte("lat", homePt.lat + dLat)
      .gte("lng", homePt.lng - dLng)
      .lte("lng", homePt.lng + dLng)
      .limit(60);
    if (activeSport) ncq = ncq.contains("sports", [activeSport]);
    const { data: nc } = await ncq;
    const R = 3958.8;
    const mi = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
      const dla = ((b.lat - a.lat) * Math.PI) / 180;
      const dln = ((b.lng - a.lng) * Math.PI) / 180;
      const s = Math.sin(dla / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dln / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(s));
    };
    nearbyCourts = (nc ?? [])
      .map((c) => ({ c, d: mi(homePt, { lat: c.lat!, lng: c.lng! }) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 10)
      .map(({ c, d }) => ({ id: c.id, name: c.name, city: c.city, state: c.state, zip: c.zip, distanceMi: Math.round(d * 10) / 10 }));
  }
  const shown = activeCourt ? list.filter((m) => m.court_id === activeCourt) : list;
  const qs = (s: string | null, c: string | null) => {
    const parts = [s ? `sport=${s}` : null, c ? `court=${c}` : null].filter(Boolean);
    return parts.length ? `?${parts.join("&")}` : "";
  };

  const countMap = new Map<string, number>();
  const mineSet = new Set<string>();
  for (const p of parts) {
    countMap.set(p.match_id, (countMap.get(p.match_id) ?? 0) + 1);
    if (p.user_id === user.id) mineSet.add(p.match_id);
  }

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
          className="press inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-surface transition-colors hover:bg-ink-soft"
        >
          <Plus size={16} /> Organize a match
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:flex sm:flex-wrap sm:items-start">
        <FilterGroup
          label="Sport"
          className="min-w-[210px] flex-1 max-w-xs"
          pinned={
            <FacetLink href={`/play${qs(null, activeCourt)}`} active={!activeSport} count={all.length}>
              All sports
            </FacetLink>
          }
        >
          {SPORTS.map((s) => (
            <FacetLink key={s.key} href={`/play${qs(s.key, activeCourt)}`} active={activeSport === s.key} count={sportCounts.get(s.key) ?? 0}>
              {s.emoji} {s.name}
            </FacetLink>
          ))}
        </FilterGroup>
        <PlayCourtFilter nearby={nearbyCourts} counts={courtCounts} total={list.length} activeSport={activeSport} activeCourt={activeCourtObj} />
      </div>

      {shown.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-rule bg-surface shadow-e1 p-10 text-center">
          <Users size={28} className="mx-auto text-faint" />
          <h2 className="mt-3 font-display text-2xl text-ink">
            No open matches{activeSport ? ` for ${sportMeta(activeSport).name.toLowerCase()}` : ""}
            {activeCourtObj ? ` at ${activeCourtObj.name}` : ""} yet
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-mute">
            Be the one to get a game going. Organize a match and verified players nearby can join.
            {activeCourt ? (
              <>
                {" "}
                <Link href={`/play${qs(activeSport, null)}`} className="font-semibold text-brand-deep hover:underline">
                  Show all courts →
                </Link>
              </>
            ) : null}
          </p>
          <Link
            href="/play/new"
            className="press mt-5 inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-deep"
          >
            <Plus size={16} /> Organize a match
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((m) => {
            const org = orgMap.get(m.organizer_id);
            const filled = countMap.get(m.id) ?? 0;
            const left = m.total_slots - filled;
            const full = left <= 0;
            const mine = mineSet.has(m.id);
            const meta = sportMeta(m.sport_key);
            const court = m.court_id ? courtMap.get(m.court_id) : null;
            const placeLabel = court ? court.name : m.location_text;
            const placeNote = court && m.location_text ? m.location_text : null;
            return (
              <Link key={m.id} href={`/play/${m.id}`} className="lift block rounded-2xl border border-rule bg-surface shadow-e1 p-5">
                <div className="flex items-center justify-between">
                  <span className="grid h-11 w-11 place-items-center rounded-2xl text-xl" style={{ background: `color-mix(in oklab, var(--color-sport-${sportSlug(m.sport_key)}) 16%, transparent)` }} aria-hidden>{meta.emoji}</span>
                  <span
                    className="kicker rounded-full px-2 py-1 text-[9px]"
                    style={{ background: full ? "var(--color-bg)" : "var(--color-tint-brand)", color: full ? "var(--color-mute)" : "var(--color-brand-deep)" }}
                  >
                    {full ? "Full · waitlist" : `${left} spot${left === 1 ? "" : "s"} left`}
                  </span>
                </div>
                <h3 className="mt-3 font-display text-xl text-ink">
                  {meta.name} · {m.format === "doubles" ? "Doubles" : "Singles"}
                </h3>
                <div className="mt-3 space-y-1.5 text-sm text-mute">
                  <div className="flex items-center gap-2"><CalendarClock size={14} className="shrink-0 text-faint" /> {whenLabel(m.scheduled_at)}</div>
                  {placeLabel ? (
                    <div className="flex items-center gap-2"><MapPin size={14} className="shrink-0 text-faint" /> <span className="truncate">{placeLabel}{placeNote ? ` · ${placeNote}` : ""}</span></div>
                  ) : null}
                  <div className="flex items-center gap-2"><Users size={14} className="shrink-0 text-faint" /> {filled}/{m.total_slots} players</div>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-rule pt-3">
                  <span className="truncate text-xs text-faint">by {org?.display_name ?? "a player"}{mine ? " · you're in" : ""}</span>
                  <span className="shrink-0 text-xs font-semibold text-brand-deep">View →</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

