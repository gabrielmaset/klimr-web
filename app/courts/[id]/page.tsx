import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { MapPin, Star, ShieldCheck, UserCheck, Flame, Clock, BadgeCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SportChip } from "@/components/sport-chip";
import { Avatar } from "@/components/avatar";
import { addReview, checkInCourt } from "../actions";
import { courtReviewEligibility } from "@/lib/court-access";

export const metadata: Metadata = { title: "Court" };

type Prof = { id: string; display_name: string; avatar_hue: number; avatar_path: string | null };
type Review = { id: string; author_id: string; rating: number; body: string | null; created_at: string };

function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} className={n <= Math.round(value) ? "fill-pop text-pop" : "text-rule"} />
      ))}
    </span>
  );
}

export default async function CourtDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/courts/${id}`);

  const { data: court } = await supabase
    .from("courts")
    .select("id, name, sports, address, neighborhood, city, state, zip, lat, lng, amenities, google_place_id, website")
    .eq("id", id)
    .maybeSingle();
  if (!court) notFound();

  const { data: reviewRows } = await supabase
    .from("court_reviews")
    .select("id, author_id, rating, body, created_at")
    .eq("court_id", id)
    .order("created_at", { ascending: false });
  const reviews = (reviewRows as Review[] | null) ?? [];
  const reviewCount = reviews.length;
  const avg = reviewCount ? reviews.reduce((s, r) => s + r.rating, 0) / reviewCount : 0;
  const mine = reviews.find((r) => r.author_id === user.id);

  const profById = new Map<string, Prof>();
  const authorIds = [...new Set(reviews.map((r) => r.author_id))];
  if (authorIds.length) {
    const { data: profs } = await supabase.from("profiles").select("id, display_name, avatar_hue, avatar_path").in("id", authorIds);
    for (const p of (profs as Prof[] | null) ?? []) profById.set(p.id, p);
  }
  const avatarUrl = (p: Prof | undefined) =>
    p?.avatar_path ? supabase.storage.from("avatars").getPublicUrl(p.avatar_path).data.publicUrl : null;

  // Busy status + review eligibility, both driven by check-ins.
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const since3h = new Date(nowMs - 3 * 3600_000).toISOString();
  const since7d = new Date(nowMs - 7 * 86_400_000).toISOString();
  const [{ count: activeCount }, { count: weekCount }, elig] = await Promise.all([
    supabase.from("court_checkins").select("id", { count: "exact", head: true }).eq("court_id", id).gte("created_at", since3h),
    supabase.from("court_checkins").select("id", { count: "exact", head: true }).eq("court_id", id).gte("created_at", since7d),
    courtReviewEligibility(supabase, user.id, id),
  ]);
  const active = activeCount ?? 0;
  const week = weekCount ?? 0;

  const hasGeo = court.lat != null && court.lng != null;
  const d = 0.004;
  const mapSrc = hasGeo
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${court.lng! - d}%2C${court.lat! - d}%2C${court.lng! + d}%2C${court.lat! + d}&layer=mapnik&marker=${court.lat}%2C${court.lng}`
    : null;
  const mapsQuery = encodeURIComponent([court.name, court.address, court.neighborhood, court.city].filter(Boolean).join(", ") || `${court.lat},${court.lng}`);
  const directionsHref = court.google_place_id
    ? `https://www.google.com/maps/search/?api=1&query=${mapsQuery}&query_place_id=${court.google_place_id}`
    : `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">

      <h1 className="font-display text-3xl leading-tight text-ink sm:text-4xl">{court.name}</h1>
      <p className="mt-1 flex items-center gap-1.5 text-sm text-mute">
        <MapPin size={14} /> {[court.neighborhood, court.city, court.state].filter(Boolean).join(", ")}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {court.sports.map((s) => (
          <SportChip key={s} sport={s} />
        ))}
      </div>

      {/* map */}
      {mapSrc ? (
        <div className="mt-5 overflow-hidden rounded-2xl border border-rule">
          <iframe
            title={`Map of ${court.name}`}
            src={mapSrc}
            loading="lazy"
            className="h-64 w-full"
            style={{ border: 0 }}
          />
        </div>
      ) : null}
      {court.address ? (
        <p className="mt-2 text-sm text-mute">
          {court.address}
          {directionsHref ? (
            <>
              {" · "}
              <a href={directionsHref} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-deep hover:text-brand">
                Open in Maps
              </a>
            </>
          ) : null}
          {court.website ? (
            <>
              {" · "}
              <a href={court.website} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-deep hover:text-brand">
                Website
              </a>
            </>
          ) : null}
        </p>
      ) : null}

      {/* presence — busy status + check in */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rule bg-surface shadow-e1 p-4">
        <div className="flex items-center gap-3">
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
            style={{ background: active > 0 ? "var(--color-tint-brand)" : "var(--color-bg)", color: active > 0 ? "var(--color-brand-deep)" : "var(--color-mute)" }}
          >
            {active > 0 ? <Flame size={18} /> : <Clock size={18} />}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">
              {active > 0 ? `${active} ${active === 1 ? "player" : "players"} checked in recently` : "Quiet right now"}
            </p>
            <p className="text-xs text-mute">
              {week > 0 ? `${week} check-in${week === 1 ? "" : "s"} in the last week` : "Be the first to check in this week"}
            </p>
          </div>
        </div>
        <form action={checkInCourt}>
          <input type="hidden" name="courtId" value={court.id} />
          <button className="press inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-deep">
            <UserCheck size={15} /> Check in
          </button>
        </form>
      </div>

      {/* amenities */}
      {court.amenities?.length ? (
        <section className="mt-5">
          <h2 className="kicker mb-2 text-faint">Amenities</h2>
          <div className="flex flex-wrap gap-1.5">
            {court.amenities.map((a) => (
              <span key={a} className="rounded-full bg-bg px-3 py-1 text-xs font-medium text-ink-soft">{a}</span>
            ))}
          </div>
        </section>
      ) : null}

      {/* reviews */}
      <section className="mt-7">
        <div className="flex items-end justify-between">
          <h2 className="kicker text-faint">Reviews</h2>
          {reviewCount > 0 ? (
            <span className="flex items-center gap-1.5 text-sm text-mute">
              <Stars value={avg} /> {avg.toFixed(1)} · {reviewCount}
            </span>
          ) : null}
        </div>

        {/* authenticity note */}
        <p className="mt-1 flex items-center gap-1 text-xs text-faint">
          <ShieldCheck size={12} /> Reviews come only from verified players who&rsquo;ve checked in and played here.
        </p>

        {/* your review — gated to verified players who've actually been here */}
        {elig.eligible ? (
          <form action={addReview} className="mt-3 rounded-2xl border border-rule bg-surface shadow-e1 p-4">
            <input type="hidden" name="courtId" value={court.id} />
            <div className="flex items-center justify-between gap-3">
              <span className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-ink">
                {mine ? "Your review" : "Rate this court"}
                <span className="inline-flex items-center gap-1 rounded-full bg-tint-success px-2 py-0.5 text-[10px] font-bold text-success"><BadgeCheck size={11} /> Verified · played here</span>
              </span>
              <select
                name="rating"
                defaultValue={String(mine?.rating ?? 5)}
                aria-label="Rating"
                className="rounded-[10px] border border-rule-2 bg-surface px-2.5 py-1.5 text-sm font-semibold text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
              >
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>{"★".repeat(n)} ({n})</option>
                ))}
              </select>
            </div>
            <textarea
              name="body"
              rows={2}
              maxLength={1000}
              defaultValue={mine?.body ?? ""}
              placeholder="Lights work? Courts in good shape? Easy parking?"
              className="mt-3 w-full resize-none rounded-[10px] border border-rule-2 bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="flex items-center gap-1 text-[11px] text-faint"><ShieldCheck size={11} /> Screened before posting</span>
              <button className="press rounded-full bg-ink px-4 py-2 text-sm font-semibold text-surface transition-colors hover:bg-ink-soft">
                {mine ? "Update review" : "Post review"}
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-3 rounded-2xl border border-dashed border-rule bg-surface p-4">
            {!elig.verified ? (
              <>
                <p className="text-sm font-semibold text-ink">Verify to review</p>
                <p className="mt-1 text-sm text-mute">Court reviews come only from verified players. Verify your identity, then you can review the courts you actually play.</p>
                <Link href="/account#verification" className="press mt-3 inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-deep"><BadgeCheck size={14} /> Verify identity</Link>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-ink">Check in to review</p>
                <p className="mt-1 text-sm text-mute">Reviews come from players who&rsquo;ve been here. Tap <b>Check in</b> above when you&rsquo;re at the court — or join a match held here — and you can leave one.</p>
              </>
            )}
          </div>
        )}

        {/* others' reviews */}
        {reviews.length > 0 ? (
          <div className="mt-3 space-y-2.5">
            {reviews.map((r) => {
              const p = profById.get(r.author_id);
              return (
                <div key={r.id} className="rounded-2xl border border-rule bg-surface shadow-e1 p-4">
                  <div className="flex items-center gap-2.5">
                    <Avatar url={avatarUrl(p)} hue={p?.avatar_hue ?? 200} name={p?.display_name ?? "Player"} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">
                        {p?.display_name ?? "Player"}
                        {r.author_id === user.id ? <span className="text-xs text-faint"> · you</span> : null}
                      </p>
                      <Stars value={r.rating} size={12} />
                    </div>
                  </div>
                  {r.body ? <p className="mt-2 text-sm leading-relaxed text-ink-soft">{r.body}</p> : null}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-3 text-sm text-mute">No reviews yet — be the first.</p>
        )}
      </section>
    </div>
  );
}
