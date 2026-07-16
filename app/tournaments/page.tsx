import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Trophy, Plus, MapPin, CalendarClock, Sparkles, Search, Navigation, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { sportMeta } from "@/lib/sports";
import { SportIcon } from "@/components/sport-icons";
import { lookupZip, suggestCities, milesBetween } from "@/lib/us-places";
import { WithdrawEntryButton } from "@/components/withdraw-entry-button";
import { normalizeGallery, type GalleryItem } from "@/lib/tournament";

export const metadata: Metadata = { title: "Tournaments" };

const ACTIVE_PUBLIC = ["published", "registration_open", "registration_closed", "in_progress"];
const REGION_MILES = 250;

// Badge shown over the cover image. White "Upcoming" reads as an ad; live/open get color.
const STATUS_BADGE: Record<string, { label: string; bg: string; fg: string }> = {
  registration_open: { label: "Registration open", bg: "var(--color-success)", fg: "#ffffff" },
  published: { label: "Upcoming", bg: "var(--color-surface)", fg: "#0a0a0b" },
  registration_closed: { label: "Registration closed", bg: "var(--color-warning)", fg: "#ffffff" },
  in_progress: { label: "Live now", bg: "var(--color-info)", fg: "#ffffff" },
  completed: { label: "Completed", bg: "#52525b", fg: "#ffffff" },
  archived: { label: "Archived", bg: "#52525b", fg: "#ffffff" },
  cancelled: { label: "Cancelled", bg: "var(--color-danger)", fg: "#ffffff" },
  draft: { label: "Draft", bg: "var(--color-mute)", fg: "#ffffff" },
};

// Sport-themed gradients for cover-less tournaments — keeps the grid graphical.
const SPORT_GRADIENT: Record<string, string> = {
  tennis: "linear-gradient(135deg,#16a34a,#052e16)",
  pickleball: "linear-gradient(135deg,#0891b2,#083344)",
  padel: "linear-gradient(135deg,#7c3aed,#2e1065)",
  racquetball: "linear-gradient(135deg,#dc2626,#450a0a)",
  beach_volleyball: "linear-gradient(135deg,#f59e0b,#0369a1)",
};
const sportGrad = (k: string) => SPORT_GRADIENT[k] ?? "linear-gradient(135deg,#ff6a3d,#d63a0f)";

// tournament-gallery is a public bucket, so its object URL is deterministic — build
// it directly (avoids passing the supabase client into card components).
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
function coverUrl(path: string | null): string | null {
  return path ? `${SUPA_URL}/storage/v1/object/public/tournament-gallery/${path}` : null;
}

/** The card cover = the gallery's lead photo (same source as the /e hero),
 *  falling back to the legacy cover_path, then the sport gradient. */
function leadPhoto(fc: unknown): GalleryItem | null {
  return normalizeGallery((fc as { gallery?: unknown } | null)?.gallery)[0] ?? null;
}

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
  cover_path: string | null;
  logo_path: string | null;
 format_config: unknown;
};

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Cover/gradient media strip with overlaid badges. */
function CardMedia({
  cover,
  logo,
  sportKey,
  statusKey,
  promoted,
  miles,
  date,
  className = "aspect-[16/10]",
  crop = null,
}: {
  cover: string | null;
  logo: string | null;
  sportKey: string;
  statusKey: string | null;
  promoted?: boolean;
  miles?: number | null;
  date?: string | null;
  className?: string;
  crop?: { zoom: number; x: number; y: number } | null;
}) {
  const badge = statusKey ? STATUS_BADGE[statusKey] : null;
  const coverStyle = cover
    ? {
        backgroundImage: `url("${cover}")`,
        ...(crop ? { backgroundPosition: `${crop.x}% ${crop.y}%`, backgroundSize: `${Math.max(100, Math.round(crop.zoom * 100))}%` } : {}),
      }
    : { background: sportGrad(sportKey) };
  return (
    <div className={`relative w-full overflow-hidden bg-cover bg-center ${className}`} style={coverStyle}>
      {!cover ? <span className="pointer-events-none absolute inset-0 grid place-items-center opacity-25"><SportIcon sport={sportKey} variant="glyph" size={150} /></span> : null}
      <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-black/10" />

      <div className="absolute left-3 top-3 flex flex-wrap items-center gap-1.5">
        {badge ? (
          <span className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide shadow-sm" style={{ background: badge.bg, color: badge.fg }}>
            {badge.label}
          </span>
        ) : null}
        {promoted ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-brand px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
            <Sparkles size={11} /> Featured
          </span>
        ) : null}
      </div>

      {miles != null ? <span className="absolute right-3 top-3 rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white backdrop-blur-sm">{Math.round(miles)} mi</span> : null}

      <div className="absolute inset-x-3 bottom-3 flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold text-ink backdrop-blur-sm">
          <SportIcon sport={sportKey} variant="badge" size={14} /> {sportMeta(sportKey).name}
        </span>
        {date ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
            <CalendarClock size={12} /> {date}
          </span>
        ) : null}
        {logo ? <span className="ml-auto h-9 w-9 shrink-0 rounded-full border-2 border-white/90 bg-cover bg-center shadow" style={{ backgroundImage: `url("${logo}")` }} /> : null}
      </div>
    </div>
  );
}

/** Public tournament card (links to the public page). */
function PhotoCard({ t, miles }: { t: PubRow; miles: number | null }) {
  const place = t.location_name || t.location_address;
  const lead = leadPhoto(t.format_config);
  const cover = lead?.url ?? coverUrl(t.cover_path);
  return (
    <Link href={`/e/${t.code}`} className="lift group flex flex-col overflow-hidden rounded-3xl border border-rule bg-surface shadow-e1">
      <CardMedia cover={cover} crop={lead} logo={coverUrl(t.logo_path)} sportKey={t.sport_key} statusKey={t.status} promoted={t.promoted} miles={miles} date={fmtDate(t.starts_at)} />
      <div className="flex flex-1 flex-col p-4">
        <h3 className="truncate text-base font-bold text-ink">{t.title}</h3>
        {place ? (
          <p className="mt-1 flex items-center gap-1 truncate text-xs text-mute">
            <MapPin size={12} className="shrink-0" /> {place}
          </p>
        ) : null}
        {t.summary ? <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink-soft">{t.summary}</p> : null}
        <div className="mt-auto flex items-center justify-between pt-3">
          <span className="text-xs font-bold text-brand-deep group-hover:underline">View &amp; register</span>
          <ArrowRight size={14} className="text-brand-deep transition-transform group-hover:translate-x-0.5" />
        </div>
      </div>
    </Link>
  );
}

// Module-level holder so the small card components can build public URLs without prop drilling.

export default async function TournamentsHub({ searchParams }: { searchParams: Promise<{ near?: string }> }) {
  const { near } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/tournaments");

  const { data: prof } = await supabase.from("profiles").select("home_zip").eq("id", user.id).maybeSingle();
  const { data: provRow } = await supabase.from("class_providers").select("roles, status").eq("user_id", user.id).maybeSingle();
  const isTD = provRow?.status === "approved" && Array.isArray(provRow.roles) && provRow.roles.includes("tournament_director");

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

  const COLS = "id, code, title, sport_key, status, summary, starts_at, location_name, location_address, location_lat, location_lng, promoted, cover_path, logo_path, format_config";
  const [{ data: pub }, { data: promo }, { data: mine }] = await Promise.all([
    supabase.from("tournaments").select(COLS).eq("visibility", "public").is("cancelled_at", null).in("status", ACTIVE_PUBLIC).not("location_lat", "is", null).limit(150),
    supabase.from("tournaments").select(COLS).eq("visibility", "public").eq("promoted", true).is("cancelled_at", null).in("status", ACTIVE_PUBLIC).order("starts_at", { ascending: true }).limit(12),
    supabase.from("tournaments").select("id, code, title, sport_key, status, starts_at, location_name, cover_path, logo_path, cancelled_at, format_config").eq("owner_id", user.id).order("created_at", { ascending: false }),
  ]);

  const promoted = (promo as PubRow[] | null) ?? [];
  const promotedIds = new Set(promoted.map((t) => t.id));

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

  const organizing = (mine as Pick<PubRow, "id" | "code" | "title" | "sport_key" | "status" | "starts_at" | "location_name" | "cover_path" | "logo_path" | "format_config">[] | null) ?? [];

  // The viewer's entries (registered + waitlisted), newest first.
  const { data: myRegs } = await supabase
    .from("tournament_registrations")
    .select("id, status, tournament_id, created_at")
    .eq("registrant_id", user.id)
    .not("status", "in", "(withdrawn,declined)")
    .order("created_at", { ascending: false });
  const myRegList = myRegs ?? [];
  const entryTournIds = [...new Set(myRegList.map((r) => r.tournament_id))];
  const entryTournMap = new Map<string, { code: string; title: string; sport_key: string; cover_path: string | null; starts_at: string | null; location_name: string | null; format_config: unknown }>();
  if (entryTournIds.length) {
    const { data: et } = await supabase.from("tournaments").select("id, code, title, sport_key, cover_path, starts_at, location_name, format_config").in("id", entryTournIds);
    for (const x of et ?? []) entryTournMap.set(x.id, { code: x.code, title: x.title, sport_key: x.sport_key, cover_path: x.cover_path, starts_at: x.starts_at, location_name: x.location_name, format_config: x.format_config });
  }
  const myEntries = myRegList
    .map((r) => {
      const tt = entryTournMap.get(r.tournament_id);
      return tt ? { regId: r.id, status: r.status, ...tt } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const hero = promoted[0] ?? null;
  const featuredRest = promoted.slice(1);

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      {/* Header */}
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-tint-brand text-brand-deep">
            <Trophy size={20} />
          </span>
          <div>
            <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">Tournaments</h1>
            <p className="mt-1 text-sm text-mute">Find a bracket to join near you — or host your own.</p>
            <Link href="/tournaments/past" className="mt-1.5 inline-block text-xs font-semibold text-brand-deep hover:underline">View past tournaments →</Link>
          </div>
        </div>
        {isTD ? (
          <Link href="/tournaments/new" className="press inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-deep">
            <Plus size={16} /> Host a tournament
          </Link>
        ) : null}
      </div>

      {/* Featured hero (promoted) */}
      {hero ? (
        <section className="mb-9">
          <Link href={`/e/${hero.code}`} className="group relative block overflow-hidden rounded-3xl border border-rule">
            <div className="relative h-64 w-full bg-cover bg-center transition-transform duration-500 group-hover:scale-[1.02] sm:h-80" style={coverUrl(hero.cover_path) ? { backgroundImage: `url("${coverUrl(hero.cover_path)}")` } : { background: sportGrad(hero.sport_key) }}>
              {!coverUrl(hero.cover_path) ? <span className="pointer-events-none absolute inset-0 grid place-items-center opacity-20"><SportIcon sport={hero.sport_key} variant="hero" size={235} /></span> : null}
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
              <span className="absolute left-5 top-5 inline-flex items-center gap-1 rounded-full bg-brand px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow">
                <Sparkles size={12} /> Featured
              </span>
              <div className="absolute inset-x-5 bottom-5 text-white sm:inset-x-7 sm:bottom-7">
                <p className="kicker text-white/80">
                  <SportIcon sport={hero.sport_key} variant="badge" size={15} /> {sportMeta(hero.sport_key).name}
                </p>
                <h2 className="mt-1 font-display text-2xl leading-tight sm:text-4xl">{hero.title}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/90">
                  {fmtDate(hero.starts_at) ? (
                    <span className="flex items-center gap-1.5">
                      <CalendarClock size={14} /> {fmtDate(hero.starts_at)}
                    </span>
                  ) : null}
                  {hero.location_name || hero.location_address ? (
                    <span className="flex items-center gap-1.5">
                      <MapPin size={14} /> {hero.location_name || hero.location_address}
                    </span>
                  ) : null}
                </div>
                <span className="press mt-4 inline-flex items-center gap-1.5 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-brand-deep">
                  View &amp; register <ArrowRight size={15} />
                </span>
              </div>
            </div>
          </Link>

          {featuredRest.length > 0 ? (
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {featuredRest.map((t) => (
                <PhotoCard key={t.id} t={t} miles={null} />
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Near you + location search */}
      <section className="mb-10">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="kicker text-faint">Tournaments near you</h2>
            <p className="mt-0.5 text-sm text-mute">
              {center ? (
                <>
                  Around <span className="font-semibold text-ink">{center.label}</span> · within {REGION_MILES} mi
                </>
              ) : (
                "Set a location to see what's happening nearby."
              )}
            </p>
          </div>
          <form action="/tournaments" method="get" className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-full border border-rule bg-surface px-3 py-2 focus-within:border-brand">
              <Search size={15} className="shrink-0 text-faint" />
              <input name="near" defaultValue={nearRaw} placeholder="ZIP or city" className="w-32 bg-transparent text-sm text-ink outline-none placeholder:text-faint" />
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
          <div className="rounded-3xl border border-dashed border-rule bg-gradient-to-br from-[#fff4ef] to-surface p-12 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-tint-brand text-brand-deep">
              <Trophy size={22} />
            </span>
            <p className="mt-3 text-base font-bold text-ink">{center ? "No tournaments here yet" : "No location set"}</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-mute">{center ? "Be the first to run one in your area — it takes a few minutes to set up." : "Search a ZIP or city above to find local brackets."}</p>
            {isTD ? (
            <Link href="/tournaments/new" className="press mt-4 inline-flex items-center gap-1.5 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-deep">
              <Plus size={15} /> Host a tournament
            </Link>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {nearby.map(({ t, miles }) => (
              <PhotoCard key={t.id} t={t} miles={miles} />
            ))}
          </div>
        )}
      </section>

      {/* Your entries */}
      {myEntries.length > 0 ? (
        <section className="mb-10">
          <h2 className="kicker mb-4 text-faint">Your entries</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {myEntries.map((e) => {
              const wl = e.status === "waitlisted";
              return (
                <div key={e.regId} className="flex flex-col overflow-hidden rounded-3xl border border-rule bg-surface shadow-e1">
                  <Link href={`/e/${e.code}`} className="group block">
                    <CardMedia cover={leadPhoto(e.format_config)?.url ?? coverUrl(e.cover_path)} crop={leadPhoto(e.format_config)} logo={null} sportKey={e.sport_key} statusKey={null} date={fmtDate(e.starts_at)} className="aspect-[16/9]" />
                  </Link>
                  <div className="flex flex-1 flex-col p-4">
                    <Link href={`/e/${e.code}`} className="truncate text-sm font-bold text-ink hover:underline">
                      {e.title}
                    </Link>
                    {e.location_name ? <p className="mt-0.5 truncate text-xs text-mute">{e.location_name}</p> : null}
                    <div className="mt-3 flex items-center justify-between gap-2 pt-1">
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${wl ? "bg-tint-brand text-brand-deep" : e.status === "confirmed" ? "bg-tint-success text-success" : "bg-bg text-mute"}`}>
                        {wl ? "Waitlisted" : e.status === "confirmed" ? "Confirmed" : "Pending"}
                      </span>
                      <WithdrawEntryButton registrationId={e.regId} waitlisted={wl} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Organizing */}
      {organizing.length > 0 ? (
        <section>
          <h2 className="kicker mb-4 text-faint">Organizing</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {organizing.map((t) => {
              return (
                <Link key={t.id} href={`/tournament/${t.id}`} className="lift group flex flex-col overflow-hidden rounded-3xl border border-rule bg-surface shadow-e1">
                  <CardMedia cover={leadPhoto(t.format_config)?.url ?? coverUrl(t.cover_path)} crop={leadPhoto(t.format_config)} logo={coverUrl(t.logo_path)} sportKey={t.sport_key} statusKey={t.status} date={fmtDate(t.starts_at)} className="aspect-[16/9]" />
                  <div className="flex flex-1 flex-col p-4">
                    <h3 className="truncate text-sm font-bold text-ink">{t.title}</h3>
                    <p className="mt-0.5 truncate text-xs text-mute">/e/{t.code}</p>
                    <div className="mt-auto flex items-center justify-between pt-3">
                      <span className="text-xs font-bold text-brand-deep group-hover:underline">Manage</span>
                      <ArrowRight size={14} className="text-brand-deep transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
