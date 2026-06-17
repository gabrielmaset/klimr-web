import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ChevronLeft, GraduationCap, ShoppingBag, MapPin, Mail, ShieldCheck, Heart, Flag, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { sportMeta } from "@/lib/sports";
import { Avatar } from "@/components/avatar";
import { toggleSave } from "../actions";

export const metadata: Metadata = { title: "Listing" };

const CONDITION: Record<string, string> = { new: "New", like_new: "Like new", good: "Good", fair: "Fair" };

function listedAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d <= 0 ? "Listed today" : d === 1 ? "Listed yesterday" : `Listed ${d} days ago`;
}

export default async function ListingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/marketplace/${id}`);

  const { data: l } = await supabase
    .from("marketplace_listings")
    .select("id, kind, title, sport_key, category, price_text, condition, location, description, contact_email, listed_by, status, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!l) notFound();

  const { data: savedRow } = await supabase
    .from("saved_listings")
    .select("listing_id")
    .eq("user_id", user.id)
    .eq("listing_id", id)
    .maybeSingle();
  const saved = !!savedRow;

  type Lister = { id: string; display_name: string; avatar_hue: number; avatar_path: string | null };
  let lister: Lister | null = null;
  if (l.listed_by) {
    const { data } = await supabase.from("profiles").select("id, display_name, avatar_hue, avatar_path").eq("id", l.listed_by).maybeSingle();
    lister = (data as Lister | null) ?? null;
  }
  const listerAvatar = lister?.avatar_path ? supabase.storage.from("avatars").getPublicUrl(lister.avatar_path).data.publicUrl : null;

  const isCoaching = l.kind === "coaching";
  const contact = l.contact_email || "hello@klimr.com";
  const mailto = `mailto:${contact}?subject=${encodeURIComponent(`Klimr listing: ${l.title}`)}`;
  const reportMailto = `mailto:hello@klimr.com?subject=${encodeURIComponent(`Report listing: ${l.title}`)}&body=${encodeURIComponent(`I'd like to report this listing (${id}) because:`)}`;

  return (
    <div className="mx-auto max-w-2xl px-5 py-8 sm:py-10">
      <Link href={`/marketplace?tab=${l.kind}`} className="press mb-5 inline-flex items-center gap-1 text-sm font-semibold text-mute hover:text-ink">
        <ChevronLeft size={15} /> Marketplace
      </Link>

      <span className="inline-flex items-center gap-1.5 rounded-full border border-rule bg-surface px-2.5 py-1 text-xs font-semibold text-ink">
        {isCoaching ? <GraduationCap size={12} /> : <ShoppingBag size={12} />}
        {isCoaching ? "Coaching" : "Gear"}
        {l.sport_key ? ` · ${sportMeta(l.sport_key).emoji} ${sportMeta(l.sport_key).name}` : ""}
      </span>

      <div className="mt-2 flex items-start justify-between gap-4">
        <h1 className="font-display text-3xl leading-tight text-ink sm:text-4xl">{l.title}</h1>
        {l.price_text ? <span className="shrink-0 pt-1 font-display text-3xl text-brand-deep tabular">{l.price_text}</span> : null}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-mute">
        {l.kind === "gear" && l.condition ? <span className="font-semibold text-ink">{CONDITION[l.condition] ?? l.condition}</span> : null}
        {l.category ? <span>{l.category}</span> : null}
        {l.location ? <span className="flex items-center gap-1"><MapPin size={13} /> {l.location}</span> : null}
        <span className="flex items-center gap-1"><Clock size={13} /> {listedAgo(l.created_at)}</span>
      </div>

      {l.status === "closed" ? (
        <div className="mt-3 rounded-xl border border-rule bg-[#f4f4f5] px-4 py-2.5 text-sm font-semibold text-mute">This listing is closed.</div>
      ) : null}

      {l.description ? <p className="mt-5 text-sm leading-relaxed text-ink-soft">{l.description}</p> : null}

      {lister ? (
        <Link href={`/profile/${lister.id}`} className="lift mt-5 flex items-center gap-2.5 rounded-2xl border border-rule bg-surface p-3">
          <Avatar url={listerAvatar} hue={lister.avatar_hue ?? 200} name={lister.display_name} size={36} />
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-faint">Listed by</span>
            <span className="block truncate text-sm font-semibold text-ink">{lister.display_name}</span>
          </span>
          <ChevronLeft size={16} className="shrink-0 rotate-180 text-faint" />
        </Link>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {l.status !== "closed" ? (
          <a
            href={mailto}
            className="press inline-flex items-center gap-1.5 rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-deep"
          >
            <Mail size={15} /> {isCoaching ? "Contact coach" : "Contact seller"}
          </a>
        ) : null}
        <form action={toggleSave}>
          <input type="hidden" name="listingId" value={l.id} />
          <button
            className={`press inline-flex items-center gap-1.5 rounded-full border px-4 py-3 text-sm font-semibold transition-colors ${
              saved ? "border-brand/40 bg-tint-brand text-brand-deep" : "border-rule text-ink hover:bg-[#f4f4f5]"
            }`}
          >
            <Heart size={15} className={saved ? "fill-brand text-brand" : ""} /> {saved ? "Saved" : "Save"}
          </button>
        </form>
      </div>

      <p className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-faint">
        <ShieldCheck size={13} className="mt-0.5 shrink-0" />
        Arrange details directly with the lister. No payments are processed on Klimr — never send money before you&apos;re comfortable.
      </p>
      <a href={reportMailto} className="press mt-3 inline-flex items-center gap-1 text-xs font-semibold text-faint hover:text-brand-deep">
        <Flag size={12} /> Report this listing
      </a>
    </div>
  );
}
