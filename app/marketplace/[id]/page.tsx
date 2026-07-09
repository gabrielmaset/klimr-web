import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Heart, ShieldCheck, BadgeCheck, Flag } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { sportMeta, sportSlug } from "@/lib/sports";
import { SPORT_TONES } from "@/components/sport-chip";
import { ListingGallery } from "@/components/listing-gallery";
import { CATEGORIES, TRADE_TONE, FREE_TONE, PENDING_TONE, MULTI_TONE, zipDistanceMi, priceLabel } from "@/lib/marketplace";
import { toggleSave, setListingStatus, reportListing } from "../actions";
import { messageSeller } from "../chat-actions";

export const metadata: Metadata = { title: "Listing — Second Serve" };
export const dynamic = "force-dynamic";

const monoKicker = "font-mono text-[9.5px] font-bold uppercase tracking-[.18em]";

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/marketplace/${id}`);

  const { data: l } = await supabase
    .from("marketplace_listings")
    .select(
      "id, kind, title, sport_key, category, mode, obo, trade_wants, price_cents, condition, status, photos, zip, description, listed_by, created_at, renewed_at, sold_at, meet_court_ids",
    )
    .eq("id", id)
    .maybeSingle();
  if (!l || l.kind !== "gear") notFound();

  const yours = l.listed_by === user.id;
  if (l.status === "draft" && !yours) notFound();

  const [{ data: seller }, { data: savedRow }, { data: me }] = await Promise.all([
    l.listed_by
      ? supabase.from("profiles").select("id, display_name, avatar_hue, verification_status, primary_sport, created_at, city, neighborhood").eq("id", l.listed_by).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("saved_listings").select("listing_id").eq("user_id", user.id).eq("listing_id", id).maybeSingle(),
    supabase.from("profiles").select("home_zip").eq("id", user.id).maybeSingle(),
  ]);

  const sport = l.sport_key ?? "multi";
  const tone = sport === "multi" ? MULTI_TONE : (SPORT_TONES[sportSlug(sport)] ?? MULTI_TONE);
  const emoji = sport === "multi" ? "🏅" : sportMeta(sport).emoji;
  const photos = (l.photos ?? []).map((p) => supabase.storage.from("listing-photos").getPublicUrl(p).data.publicUrl);
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const posted = Math.max(0, Math.floor((nowMs - new Date(l.renewed_at).getTime()) / 86400000));
  const dist = zipDistanceMi(me?.home_zip ?? null, l.zip);
  const saved = !!savedRow;
  const catLabel = CATEGORIES.find((c) => c.key === l.category)?.label ?? l.category ?? "Gear";
  const sellerSince = seller?.created_at ? new Date(seller.created_at).getFullYear() : null;

  const meetIds = (l.meet_court_ids ?? []).slice(0, 3);
  const { data: meetCourts } = meetIds.length
    ? await supabase.from("courts").select("id, name").in("id", meetIds)
    : { data: [] as { id: string; name: string }[] };
  const sellerSport = seller?.primary_sport ? sportMeta(seller.primary_sport).name.toLowerCase() : null;

  const statusBadge =
    l.status === "sold"
      ? { label: "SOLD", ...PENDING_TONE }
      : l.status === "pending"
        ? { label: "PENDING", ...PENDING_TONE }
        : l.status === "draft"
          ? { label: "DRAFT", ...PENDING_TONE }
          : l.mode === "trade"
            ? { label: "TRADE", ...TRADE_TONE }
            : l.mode === "free"
              ? { label: "FREE", ...FREE_TONE }
              : null;

  return (
    <div className="mx-auto max-w-[980px] px-[30px] pb-16 pt-[22px]">
      <Link href="/marketplace" className="press inline-flex items-center gap-1.5 text-sm text-mute transition-colors hover:text-ink">
        <ArrowLeft size={15} /> Marketplace
      </Link>

      <div className="mt-4 grid items-start gap-7 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        {/* gallery */}
        <ListingGallery photos={photos} alt={l.title} fallbackEmoji={emoji} fallbackBg={tone.bg} />

        {/* facts column */}
        <div className="min-w-0">
          <p className={`${monoKicker} text-faint`}>
            Listed {posted}d ago{dist !== null ? ` · ${dist} mi away` : ""}
          </p>
          <h1 className="mt-1.5 font-display text-[26px] font-bold leading-tight tracking-[-0.02em] text-ink">{l.title}</h1>

          <div className="mt-2.5 flex flex-wrap items-baseline gap-2">
            <span className="font-mono text-[26px] font-bold tabular" style={{ color: l.mode === "trade" ? TRADE_TONE.fg : l.mode === "free" ? FREE_TONE.fg : "var(--color-ink)" }}>
              {priceLabel({ mode: l.mode, priceCents: l.price_cents })}
            </span>
            {l.mode === "sale" && l.obo ? <span className="font-mono text-[10px] font-bold uppercase tracking-[.12em] text-faint">or best offer</span> : null}
            {statusBadge ? (
              <span className="rounded-[6px] px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-[.12em]" style={{ background: statusBadge.bg, color: statusBadge.fg, boxShadow: `inset 0 0 0 1px ${statusBadge.bd}` }}>
                {statusBadge.label}
              </span>
            ) : null}
          </div>
          {l.mode === "trade" && l.trade_wants ? (
            <p className="mt-1 text-[13px] text-ink-soft"><span className="font-semibold" style={{ color: TRADE_TONE.fg }}>Wants:</span> {l.trade_wants}</p>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-1.5">
            {[l.condition, catLabel, sport === "multi" ? "Multi-sport" : sportMeta(sport).name].filter(Boolean).map((c) => (
              <span key={String(c)} className="rounded-full border border-rule bg-bg px-2.5 py-1 text-[11px] font-semibold text-ink-soft">{c}</span>
            ))}
          </div>

          {l.description ? <p className="mt-4 whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink-soft">{l.description}</p> : null}

          {meetCourts && meetCourts.length > 0 ? (
            <div className="mt-4">
              <p className={`${monoKicker} text-faint`}>Suggested meet spots</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {meetCourts.map((c) => (
                  <Link key={c.id} href={`/courts/${c.id}`} className="press inline-flex items-center gap-1.5 rounded-full border border-rule bg-bg px-2.5 py-1 text-[11.5px] font-semibold text-ink-soft transition-colors hover:text-ink">
                    📍 {c.name}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          {/* seller trust block */}
          {seller ? (
            <Link href={`/profile/${seller.id}`} className="lift mt-5 flex items-center gap-3 rounded-[16px] border border-rule bg-surface p-3.5 shadow-e1">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold text-white" style={{ background: `linear-gradient(140deg, hsl(${seller.avatar_hue ?? 20} 82% 52%), hsl(${seller.avatar_hue ?? 20} 85% 38%))` }}>
                {(seller.display_name || "P").slice(0, 1)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm font-bold text-ink">
                  {seller.display_name || "Player"}
                  {seller.verification_status === "verified" ? <BadgeCheck size={14} className="text-brand-deep" fill="var(--color-tint-brand)" /> : null}
                </span>
                <span className="block truncate text-xs text-mute">
                  {sellerSport ? `Plays ${sellerSport}${seller.neighborhood || seller.city ? ` in ${seller.neighborhood ?? seller.city}` : " nearby"}` : "Klimr player"}
                  {sellerSince ? ` · On Klimr since ${sellerSince}` : ""}
                </span>
              </span>
            </Link>
          ) : null}

          {/* actions */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {yours ? (
              <>
                {l.status === "active" ? (
                  <>
                    <Link href={`/marketplace/${l.id}/edit`} className="press inline-flex h-[36px] items-center rounded-[10px] px-4 text-[13px] font-bold text-white shadow-flame transition-[filter] hover:brightness-[1.06]" style={{ background: "linear-gradient(140deg, #FF6A35, #E23E0D)" }}>
                      Edit listing
                    </Link>
                    <form action={setListingStatus}>
                      <input type="hidden" name="listing_id" value={l.id} />
                      <input type="hidden" name="status_action" value="pending" />
                      <button className="press h-[36px] rounded-[10px] border border-rule-2 bg-surface px-3.5 text-[13px] font-semibold text-ink-soft transition-colors hover:text-ink">Mark pending</button>
                    </form>
                    <form action={setListingStatus}>
                      <input type="hidden" name="listing_id" value={l.id} />
                      <input type="hidden" name="status_action" value="sold" />
                      <button className="press h-[36px] rounded-[10px] border border-rule-2 bg-surface px-3.5 text-[13px] font-semibold text-ink-soft transition-colors hover:text-ink">Mark as sold</button>
                    </form>
                  </>
                ) : null}
                {l.status === "pending" ? (
                  <>
                    <form action={setListingStatus}>
                      <input type="hidden" name="listing_id" value={l.id} />
                      <input type="hidden" name="status_action" value="activate" />
                      <button className="press h-[36px] rounded-[10px] border border-rule-2 bg-surface px-3.5 text-[13px] font-semibold text-ink-soft transition-colors hover:text-ink">Back to active</button>
                    </form>
                    <form action={setListingStatus}>
                      <input type="hidden" name="listing_id" value={l.id} />
                      <input type="hidden" name="status_action" value="sold" />
                      <button className="press h-[36px] rounded-[10px] px-4 text-[13px] font-bold text-white shadow-flame transition-[filter] hover:brightness-[1.06]" style={{ background: "linear-gradient(140deg, #FF6A35, #E23E0D)" }}>Mark as sold</button>
                    </form>
                  </>
                ) : null}
                {l.status === "sold" || l.status === "draft" ? (
                  <form action={setListingStatus}>
                    <input type="hidden" name="listing_id" value={l.id} />
                    <input type="hidden" name="status_action" value="relist" />
                    <button className="press h-[36px] rounded-[10px] px-4 text-[13px] font-bold text-white shadow-flame transition-[filter] hover:brightness-[1.06]" style={{ background: "linear-gradient(140deg, #FF6A35, #E23E0D)" }}>Relist</button>
                  </form>
                ) : null}
                {l.status === "active" || l.status === "pending" ? (
                  <form action={setListingStatus}>
                    <input type="hidden" name="listing_id" value={l.id} />
                    <input type="hidden" name="status_action" value="unpublish" />
                    <button className="press h-[36px] rounded-[10px] px-3 text-[13px] font-semibold text-mute transition-colors hover:text-ink">Unpublish</button>
                  </form>
                ) : null}
              </>
            ) : (
              <>
                <form action={messageSeller}>
                  <input type="hidden" name="listing_id" value={l.id} />
                  <button className="press inline-flex h-[36px] items-center rounded-[10px] px-4 text-[13px] font-bold text-white shadow-flame transition-[filter] hover:brightness-[1.06]" style={{ background: "linear-gradient(140deg, #FF6A35, #E23E0D)" }}>
                    Message seller
                  </button>
                </form>
                <form action={toggleSave}>
                  <input type="hidden" name="listing_id" value={l.id} />
                  <button className={`press inline-flex h-[36px] items-center gap-1.5 rounded-[10px] border px-4 text-[13px] font-semibold transition-colors ${saved ? "border-tint-brand-bd bg-tint-brand text-flame-text" : "border-rule-2 bg-surface text-ink-soft hover:text-ink"}`}>
                    <Heart size={14} fill={saved ? "currentColor" : "none"} /> {saved ? "Saved" : "Save"}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>

      {/* safety footer + report */}
      <div className="mt-8 flex flex-wrap items-start justify-between gap-4 rounded-[16px] p-4" style={{ background: "#FDFBF7", border: "1px solid #EFE9DC" }}>
        <div className="flex items-start gap-2.5">
          <ShieldCheck size={15} className="mt-0.5 shrink-0 text-success" />
          <p className="max-w-xl text-[11.5px] leading-relaxed text-mute">
            Meet at a court or another busy public spot, inspect the gear before paying, and keep the conversation on
            Klimr. Klimr never processes marketplace payments and never asks for payment details.
          </p>
        </div>
        {!yours ? (
          <details className="shrink-0">
            <summary className="press inline-flex cursor-pointer items-center gap-1.5 text-[12px] font-semibold text-mute hover:text-ink">
              <Flag size={13} /> Report listing
            </summary>
            <form action={reportListing} className="mt-2 flex w-64 flex-col gap-2">
              <input type="hidden" name="listing_id" value={l.id} />
              <input
                name="reason"
                required
                minLength={3}
                placeholder="What's wrong with this listing?"
                className="h-[34px] rounded-[10px] border border-rule-2 bg-surface px-2.5 text-xs text-ink outline-none placeholder:text-faint focus:border-brand focus:ring-4 focus:ring-brand/15"
              />
              <button className="press h-8 self-end rounded-[10px] border border-rule-2 bg-surface px-3 text-xs font-semibold text-mute hover:text-ink">Send report</button>
            </form>
          </details>
        ) : null}
      </div>
    </div>
  );
}
