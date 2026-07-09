import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Pencil, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { TRADE_TONE, FREE_TONE, PENDING_TONE, MULTI_TONE, priceLabel, isExpired } from "@/lib/marketplace";
import { sportMeta, sportSlug } from "@/lib/sports";
import { SPORT_TONES } from "@/components/sport-chip";
import { setListingStatus } from "../actions";
import { removeListing } from "../listing-actions";

export const metadata: Metadata = { title: "My listings — Second Serve" };
export const dynamic = "force-dynamic";

const TABS = ["active", "pending", "sold", "draft", "expired"] as const;
type Tab = (typeof TABS)[number];

const ghostBtn = "press h-8 rounded-[9px] border border-rule-2 bg-surface px-2.5 text-[12px] font-semibold text-ink-soft transition-colors hover:text-ink";

export default async function MyListingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/marketplace/mine");

  const { data: rows } = await supabase
    .from("marketplace_listings")
    .select("id, title, sport_key, mode, obo, price_cents, condition, status, photos, renewed_at, expires_at, sold_at")
    .eq("kind", "gear")
    .eq("listed_by", user.id)
    .neq("status", "removed")
    .order("renewed_at", { ascending: false });

  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const all = (rows ?? []).map((l) => ({ ...l, tab: (isExpired(l, nowMs) ? "expired" : l.status) as Tab }));
  const counts = Object.fromEntries(TABS.map((t) => [t, all.filter((l) => l.tab === t).length])) as Record<Tab, number>;
  const tab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : "active";
  const list = all.filter((l) => l.tab === tab);

  const coverUrl = (photos: string[]) =>
    photos?.[0] ? supabase.storage.from("listing-photos").getPublicUrl(photos[0]).data.publicUrl : null;

  return (
    <div className="mx-auto max-w-[880px] px-[30px] pb-16 pt-[22px]">
      <Link href="/marketplace" className="press inline-flex items-center gap-1.5 text-sm text-mute transition-colors hover:text-ink">
        <ArrowLeft size={15} /> Marketplace
      </Link>
      <div className="mt-4">
        <PageHeader
          kicker="Marketplace — Seller hub"
          title="My listings"
          sub="Everything you've listed, by status — publish, edit, relist, and close from here."
          pill={
            <Link href="/marketplace/new" className="press inline-flex h-[36px] items-center gap-1.5 rounded-[10px] px-3.5 text-[13px] font-bold text-white shadow-flame transition-[filter] hover:brightness-[1.06]" style={{ background: "linear-gradient(140deg, #FF6A35, #E23E0D)" }}>
              <Plus size={15} /> List gear
            </Link>
          }
        />
      </div>

      <div className="mt-5 flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <Link
            key={t}
            href={t === "active" ? "/marketplace/mine" : `/marketplace/mine?tab=${t}`}
            className={`press inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold capitalize transition-colors ${tab === t ? "border-tint-brand-bd bg-tint-brand text-flame-text" : "border-rule bg-surface text-mute hover:text-ink"}`}
          >
            {t}
            <span className="font-mono text-[10px] font-bold">{counts[t]}</span>
          </Link>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="mt-4 rounded-[16px] px-6 py-10 text-center" style={{ background: "var(--color-bg)", border: "1px solid #EFE9DC" }}>
          <p className="text-sm font-semibold text-ink">Nothing {tab === "draft" ? "in drafts" : tab} right now.</p>
          {tab === "active" ? <p className="mt-1 text-xs text-mute">List a racquet gathering dust — someone nearby wants it.</p> : null}
        </div>
      ) : (
        <div className="mt-4 space-y-2.5">
          {list.map((l) => {
            const sport = l.sport_key ?? "multi";
            const tone = sport === "multi" ? MULTI_TONE : (SPORT_TONES[sportSlug(sport)] ?? MULTI_TONE);
            const cover = coverUrl(l.photos ?? []);
            const daysLeft = Math.max(0, Math.ceil((new Date(l.expires_at).getTime() - nowMs) / 86400000));
            return (
              <div key={l.id} className="flex items-center gap-3.5 rounded-[16px] border border-rule bg-surface p-3 shadow-e1">
                <Link href={`/marketplace/${l.id}`} className="block h-[54px] w-[72px] shrink-0 overflow-hidden rounded-[10px] border border-rule-soft" style={{ background: tone.bg }}>
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cover} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="grid h-full w-full place-items-center text-xl" aria-hidden>{sport === "multi" ? "🏅" : sportMeta(sport).emoji}</span>
                  )}
                </Link>
                <div className="min-w-0 flex-1">
                  <Link href={`/marketplace/${l.id}`} className="block truncate text-[13.5px] font-semibold text-ink hover:underline">{l.title}</Link>
                  <p className="mt-0.5 flex items-center gap-2 text-[11.5px] text-faint">
                    <span className="font-mono font-bold" style={{ color: l.mode === "trade" ? TRADE_TONE.fg : l.mode === "free" ? FREE_TONE.fg : "var(--color-ink)" }}>
                      {priceLabel({ mode: l.mode, priceCents: l.price_cents })}
                    </span>
                    {tab === "active" ? <span>· {daysLeft}d left</span> : null}
                    {tab === "pending" ? <span className="rounded-[5px] px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase" style={{ background: PENDING_TONE.bg, color: PENDING_TONE.fg }}>Pending</span> : null}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                  {tab === "draft" ? (
                    <form action={setListingStatus}>
                      <input type="hidden" name="listing_id" value={l.id} />
                      <input type="hidden" name="status_action" value="activate" />
                      <button className="press h-8 rounded-[9px] px-3 text-[12px] font-bold text-white shadow-flame transition-[filter] hover:brightness-[1.06]" style={{ background: "linear-gradient(140deg, #FF6A35, #E23E0D)" }}>Publish</button>
                    </form>
                  ) : null}
                  {tab === "expired" || tab === "sold" ? (
                    <form action={setListingStatus}>
                      <input type="hidden" name="listing_id" value={l.id} />
                      <input type="hidden" name="status_action" value="relist" />
                      <button className="press h-8 rounded-[9px] px-3 text-[12px] font-bold text-white shadow-flame transition-[filter] hover:brightness-[1.06]" style={{ background: "linear-gradient(140deg, #FF6A35, #E23E0D)" }}>Relist</button>
                    </form>
                  ) : null}
                  {tab === "active" ? (
                    <form action={setListingStatus}>
                      <input type="hidden" name="listing_id" value={l.id} />
                      <input type="hidden" name="status_action" value="sold" />
                      <button className={ghostBtn}>Mark sold</button>
                    </form>
                  ) : null}
                  {tab === "pending" ? (
                    <>
                      <form action={setListingStatus}>
                        <input type="hidden" name="listing_id" value={l.id} />
                        <input type="hidden" name="status_action" value="sold" />
                        <button className={ghostBtn}>Mark sold</button>
                      </form>
                      <form action={setListingStatus}>
                        <input type="hidden" name="listing_id" value={l.id} />
                        <input type="hidden" name="status_action" value="activate" />
                        <button className={ghostBtn}>Back to active</button>
                      </form>
                    </>
                  ) : null}
                  {tab !== "sold" ? (
                    <Link href={`/marketplace/${l.id}/edit`} className={`${ghostBtn} inline-flex items-center gap-1`}>
                      <Pencil size={12} /> Edit
                    </Link>
                  ) : null}
                  {tab === "active" || tab === "pending" ? (
                    <form action={setListingStatus}>
                      <input type="hidden" name="listing_id" value={l.id} />
                      <input type="hidden" name="status_action" value="unpublish" />
                      <button className={ghostBtn}>Unpublish</button>
                    </form>
                  ) : null}
                  <form action={removeListing}>
                    <input type="hidden" name="listing_id" value={l.id} />
                    <button className="press h-8 rounded-[9px] px-2.5 text-[12px] font-semibold text-mute transition-colors hover:text-danger">Delete</button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
