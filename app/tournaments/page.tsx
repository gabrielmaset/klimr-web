import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Trophy, Plus, MapPin, CalendarClock, Sparkles, Search, Navigation } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { sportMeta } from "@/lib/sports";
import { lookupZip, suggestCities, milesBetween } from "@/lib/us-places";

export const metadata: Metadata = { title: "Tournaments" };

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  published: "Published",
  registration_open: "Registration open",
  registration_closed: "Registration closed",
  in_progress: "In progress",
  completed: "Completed",
  archived: "Archived",
  cancelled: "Cancelled",
};
const ACTIVE_PUBLIC = ["published", "registration_open", "registration_closed", "in_progress"];
const REGION_MILES = 250;

type PubRow = {
  id: string;
  code: string;
  title: string;
  sport_key: string;
  status: string;
  summary: string | null;
  starts_at: string | null;
  location_name: string | null;
  location_address: string | null;
  location_lat: number | null;
  location_lng: number | null;
  promoted: boolean;
};

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function PublicCard({ t, miles }: { t: PubRow; miles: number | null }) {
  const meta = sportMeta(t.sport_key);
  const date = fmtDate(t.starts_at);
  const place = t.location_name || t.location_address;
  return (
    <Link href={`/e/${t.code}`} className="lift flex flex-col rounded-2xl border border-rule bg-surface p-4">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#f4f4f5] text-lg">{meta.emoji}</span>
        <span className="rounded-full bg-bg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-mute">{STATUS_LABEL[t.status] ?? t.status}</span>
        {t.promoted ? (
          <span className="ml-auto flex items-center gap-1 rounded-full bg-tint-brand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-deep">
            <Sparkles size={11} /> Promoted
          </span>
        ) : null}
      </div>
      <p className="mt-3 truncate text-sm font-bold text-ink">{t.title}</p>
      <p className="mt-0.5 text-xs text-mute">{meta.name}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-mute">
        {date ? <span className="flex items-center gap-1"><CalendarClock size={12} /> {date}</span> : null}
        {place ? <span className="flex items-center gap-1 truncate"><MapPin size={12} /> {place}</span> : null}
        {miles !== null ? <span className="text-faint">· {Math.round(miles)} mi</span> : null}
      </div>
    </Link>
  );
}

export default async function TournamentsHub({ searchParams }: { searchParams: Promise<{ near?: string }> }) {
  const { near } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/tournaments");

  const { data: prof } = await supabase.from("profiles").select("home_zip").eq("id", user.id).maybeSingle();

  // Resolve the search center: an explicit ZIP/city filter, else the viewer's home ZIP.
  const nearRaw = (near ?? "").trim();
  let center: { lat: number; lng: number; label: string } | null = null;
  if (nearRaw) {
    if (/^\d{5}$/.test(nearRaw)) {
      const z = lookupZip(nearRaw);
      if (z) center = { lat: z.lat, lng: z.lng, label: `${z.city}, ${z.state}` };
    } else {
      const c = suggestCities(nearRaw, 1)[0];
      if (c) center = { lat: c.lat, lng: c.lng, label: c.label };
    }
  }
  if (!center && prof?.home_zip) {
    const z = lookupZip(prof.home_zip);
    if (z) center = { lat: z.lat, lng: z.lng, label: `${z.city}, ${z.state}` };
  }

  const [{ data: pub }, { data: promo }, { data: mine }] = await Promise.all([
    supabase
      .from("tournaments")
      .select("id, code, title, sport_key, status, summary, starts_at, location_name, location_address, location_lat, location_lng, promoted")
      .eq("visibility", "public")
      .in("status", ACTIVE_PUBLIC)
      .not("location_lat", "is", null)
      .limit(150),
    supabase
      .from("tournaments")
      .select("id, code, title, sport_key, status, summary, starts_at, location_name, location_address, location_lat, location_lng, promoted")
      .eq("visibility", "public")
      .eq("promoted", true)
      .in("status", ACTIVE_PUBLIC)
      .order("starts_at", { ascending: true })
      .limit(12),
    supabase.from("tournaments").select("id, code, title, sport_key, status").eq("owner_id", user.id).order("created_at", { ascending: false }),
  ]);

  const promoted = (promo as PubRow[] | null) ?? [];
  const promotedIds = new Set(promoted.map((t) => t.id));

  // Nearby = located public active tournaments, ranked by distance, within the region radius.
  // (Promoted ones surface in their own section, so we drop them here to avoid duplicates.)
  let nearby: { t: PubRow; miles: number | null }[] = [];
  const allPub = ((pub as PubRow[] | null) ?? []).filter((t) => !promotedIds.has(t.id));
  if (center) {
    nearby = allPub
      .map((t) => ({ t, miles: t.location_lat != null && t.location_lng != null ? milesBetween(center!.lat, center!.lng, t.location_lat, t.location_lng) : null }))
      .filter((x) => x.miles !== null && x.miles <= REGION_MILES)
      .sort((a, b) => (a.miles ?? 0) - (b.miles ?? 0))
      .slice(0, 24);
  } else {
    nearby = allPub.slice(0, 24).map((t) => ({ t, miles: null }));
  }

  const tournaments = mine ?? [];

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:py-10">
      {/* Header with a discreet host button */}
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-tint-brand text-brand-deep">
            <Trophy size={20} />
          </span>
          <div>
            <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">Tournaments</h1>
            <p className="mt-1 text-sm text-mute">Find events near you, or host your own.</p>
          </div>
        </div>
        <Link
          href="/tournaments/new"
          className="press inline-flex items-center gap-1.5 rounded-full border border-rule bg-surface px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-bg"
        >
          <Plus size={16} className="text-brand" /> Host a tournament
        </Link>
      </div>

      {/* Promoted */}
      {promoted.length > 0 ? (
        <section className="mb-9">
          <div className="mb-2.5 flex items-center gap-2">
            <h2 className="kicker text-brand-deep">Promoted</h2>
            <span className="text-xs text-faint">Featured events from organizers</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {promoted.map((t) => (
              <PublicCard key={t.id} t={t} miles={null} />
            ))}
          </div>
        </section>
      ) : null}

      {/* Near you + filter */}
      <section className="mb-9">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="kicker text-faint">Tournaments near you</h2>
            <p className="mt-0.5 text-sm text-mute">
              {center ? <>Around <span className="font-semibold text-ink">{center.label}</span> · within {REGION_MILES} mi</> : "Set a location to see what's happening nearby."}
            </p>
          </div>
          <form action="/tournaments" method="get" className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-full border border-rule bg-surface px-3 py-2 focus-within:border-brand">
              <Search size={15} className="shrink-0 text-faint" />
              <input
                name="near"
                defaultValue={nearRaw}
                placeholder="ZIP or city"
                className="w-32 bg-transparent text-sm text-ink outline-none placeholder:text-faint"
              />
            </div>
            <button type="submit" className="press rounded-full bg-ink px-4 py-2 text-sm font-semibold text-surface transition-colors hover:bg-ink-soft">
              Search
            </button>
            {nearRaw ? (
              <Link href="/tournaments" className="press inline-flex items-center gap-1 rounded-full px-2 py-2 text-sm font-semibold text-mute transition-colors hover:text-ink" title="Back to your area">
                <Navigation size={15} />
              </Link>
            ) : null}
          </form>
        </div>

        {nearby.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-rule bg-surface/50 p-10 text-center">
            <p className="text-sm font-semibold text-ink">{center ? "No tournaments here yet" : "No location set"}</p>
            <p className="mt-1 text-xs text-mute">
              {center ? "Try a different ZIP or city, or check back soon." : "Search a ZIP or city above to find local events."}
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {nearby.map(({ t, miles }) => (
              <PublicCard key={t.id} t={t} miles={miles} />
            ))}
          </div>
        )}
      </section>

      {/* Organizing — the viewer's own tournaments (incl. drafts) */}
      {tournaments.length > 0 ? (
        <section>
          <h2 className="kicker mb-3 text-faint">Organizing</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tournaments.map((t) => {
              const meta = sportMeta(t.sport_key);
              return (
                <Link key={t.id} href={`/tournament/${t.id}`} className="lift rounded-2xl border border-rule bg-surface p-4">
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#f4f4f5] text-lg">{meta.emoji}</span>
                    <span className="rounded-full bg-bg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-mute">{STATUS_LABEL[t.status] ?? t.status}</span>
                  </div>
                  <p className="mt-3 truncate text-sm font-bold text-ink">{t.title}</p>
                  <p className="mt-0.5 truncate text-xs text-mute">{meta.name} · /e/{t.code}</p>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
