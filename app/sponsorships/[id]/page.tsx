import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { MapPin, Check, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { respondToOffer } from "../actions";

export const metadata: Metadata = { title: "Sponsor" };

type Sponsor = {
  id: string;
  name: string;
  hue: number;
  type: string;
  location: string | null;
  tagline: string | null;
  about: string | null;
  perks: string[];
  products: { name: string; price: string }[];
};

export default async function SponsorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/sponsorships/${id}`);

  const { data: sponsor } = await supabase
    .from("sponsors")
    .select("id, name, hue, type, location, tagline, about, perks, products")
    .eq("id", id)
    .maybeSingle();
  if (!sponsor) notFound();
  const s = sponsor as Sponsor;

  const { data: rel } = await supabase
    .from("player_sponsorships")
    .select("id, status, category, term, started_at")
    .eq("player_id", user.id)
    .eq("sponsor_id", id)
    .maybeSingle();

  const hue = s.hue ?? 18;

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">

      {/* brand header */}
      <div className="overflow-hidden rounded-3xl border border-rule">
        <div className="p-5" style={{ background: `hsl(${hue} 85% 96%)` }}>
          <div className="flex items-center gap-3">
            <span
              className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-2xl font-bold text-white"
              style={{ background: `hsl(${hue} 85% 45%)` }}
            >
              {s.name.slice(0, 1)}
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold text-ink">{s.name}</h1>
              <p className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: `hsl(${hue} 70% 32%)` }}>
                {s.type}
                {s.location ? (
                  <>
                    <span className="opacity-50">·</span>
                    <MapPin size={11} /> {s.location}
                  </>
                ) : null}
              </p>
            </div>
          </div>
          {s.tagline ? <p className="mt-3 text-sm italic text-ink-soft">“{s.tagline}”</p> : null}
        </div>
      </div>

      {/* partnership / offer state */}
      {rel?.status === "active" ? (
        <div className="mt-4 rounded-2xl border border-success/30 bg-tint-success p-4">
          <span className="kicker text-success">Active partnership</span>
          <p className="mt-1 text-sm text-ink-soft">
            {s.name} sponsors you in <b>{rel.category}</b>
            {rel.started_at ? ` · since ${new Date(rel.started_at).toLocaleDateString(undefined, { month: "short", year: "numeric" })}` : ""}.
          </p>
        </div>
      ) : rel?.status === "offered" ? (
        <div className="mt-4 rounded-2xl border border-brand/30 bg-tint-brand p-4">
          <span className="kicker text-brand-deep">Sponsorship offer</span>
          <p className="mt-1 text-sm text-ink-soft">{s.name} wants to sponsor you · {rel.category} · {s.type}.</p>
          <p className="mt-1 text-xs text-faint">{rel.term}</p>
          <div className="mt-3 flex items-center gap-2">
            <form action={respondToOffer}>
              <input type="hidden" name="id" value={rel.id} />
              <input type="hidden" name="decision" value="accept" />
              <button className="press rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-deep">
                Accept offer
              </button>
            </form>
            <form action={respondToOffer}>
              <input type="hidden" name="id" value={rel.id} />
              <input type="hidden" name="decision" value="decline" />
              <button className="press rounded-full border border-rule px-4 py-2 text-sm font-semibold text-mute transition-colors hover:text-ink">
                Decline
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {/* about */}
      {s.about ? (
        <section className="mt-5">
          <h2 className="kicker text-faint">About</h2>
          <p className="mt-1.5 text-[15px] leading-relaxed text-ink-soft">{s.about}</p>
        </section>
      ) : null}

      {/* products */}
      {s.products?.length ? (
        <section className="mt-5">
          <h2 className="kicker mb-2 text-faint">Products &amp; services</h2>
          <div className="divide-y divide-rule rounded-2xl border border-rule bg-surface shadow-e1">
            {s.products.map((p, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-ink">{p.name}</span>
                <span className="tabular text-sm font-semibold text-ink">{p.price}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* perks */}
      {s.perks?.length ? (
        <section className="mt-5">
          <h2 className="kicker mb-2 text-faint">Partnership perks</h2>
          <ul className="space-y-2">
            {s.perks.map((perk, i) => (
              <li key={i} className="flex items-center gap-2.5 text-[15px] text-ink-soft">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-tint-success text-success">
                  <Check size={12} />
                </span>
                {perk}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* business CTA */}
      <div className="mt-8 rounded-2xl border border-dashed border-rule bg-bg p-5 text-center">
        <p className="text-sm font-bold text-ink">Want to sponsor a local player?</p>
        <a
          href="mailto:hello@klimr.com?subject=Sponsoring%20a%20local%20player"
          className="press mt-3 inline-flex items-center gap-1.5 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-surface transition-colors hover:bg-ink-soft"
        >
          <Sparkles size={15} /> Become a sponsor
        </a>
      </div>
    </div>
  );
}
