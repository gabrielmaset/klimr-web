import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Sparkles, MapPin, ChevronRight, Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { sportMeta } from "@/lib/sports";
import { respondToOffer } from "./actions";

export const metadata: Metadata = { title: "Sponsorships" };

type Sponsor = {
  id: string;
  name: string;
  hue: number;
  type: string;
  location: string | null;
  tagline: string | null;
  perks: string[];
};
type Mine = { id: string; status: string; category: string; term: string; sponsor_id: string };

function BrandChip({ name, hue, size = 44 }: { name: string; hue: number; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-2xl font-bold text-white"
      style={{ width: size, height: size, background: `hsl(${hue} 85% 45%)`, fontSize: size * 0.4 }}
    >
      {name.slice(0, 1)}
    </span>
  );
}

export default async function SponsorshipsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/sponsorships");

  const [{ data: sponsorRows }, { data: mineRows }, { data: profile }, { data: sportRows }] = await Promise.all([
    supabase.from("sponsors").select("id, name, hue, type, location, tagline, perks").order("name"),
    supabase.from("player_sponsorships").select("id, status, category, term, sponsor_id").eq("player_id", user.id),
    supabase.from("profiles").select("primary_sport").eq("id", user.id).maybeSingle(),
    supabase.from("player_sports").select("sport_key, points").eq("user_id", user.id),
  ]);

  const sponsors = (sponsorRows as Sponsor[] | null) ?? [];
  const byId = new Map(sponsors.map((s) => [s.id, s]));
  const mine = (mineRows as Mine[] | null) ?? [];
  const offers = mine.filter((m) => m.status === "offered");
  const active = mine.filter((m) => m.status === "active");

  const topSport = (sportRows ?? []).slice().sort((a, b) => (b.points ?? 0) - (a.points ?? 0))[0];
  const primary = topSport?.sport_key ?? profile?.primary_sport ?? null;
  const primaryMeta = primary ? sportMeta(primary) : null;

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <div className="mb-5">
        <h1 className="font-display text-4xl leading-none text-ink sm:text-5xl">Sponsorships</h1>
        <p className="mt-1 text-sm text-mute">Local businesses backing the best players in your area.</p>
      </div>

      {/* model explainer */}
      <div className="rounded-2xl border border-brand/25 bg-tint-brand p-5">
        <div className="flex items-center gap-2 text-brand-deep">
          <Sparkles size={16} />
          <span className="kicker">How Klimr sponsorships work</span>
        </div>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
          Pro sponsorships are for pros. Klimr brings them to amateurs: as you climb your neighborhood and city ladders,
          local shops, clubs, and brands can sponsor you — gear, apparel, court time, and perks. You can hold multiple
          partnerships across non-overlapping categories.
        </p>
      </div>

      {/* pending offers */}
      {offers.length > 0 ? (
        <section className="mt-6">
          <h2 className="kicker mb-2 text-brand-deep">Sponsorship offers</h2>
          <div className="space-y-3">
            {offers.map((o) => {
              const s = byId.get(o.sponsor_id);
              if (!s) return null;
              return (
                <div key={o.id} className="rounded-2xl border border-brand/30 bg-surface p-4">
                  <div className="flex items-center gap-3">
                    <BrandChip name={s.name} hue={s.hue} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-ink">{s.name} wants to sponsor you</p>
                      <p className="truncate text-xs text-mute">{o.category} offer · {s.type}</p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-faint">{o.term}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <form action={respondToOffer}>
                      <input type="hidden" name="id" value={o.id} />
                      <input type="hidden" name="decision" value="accept" />
                      <button className="press rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-deep">
                        Accept
                      </button>
                    </form>
                    <form action={respondToOffer}>
                      <input type="hidden" name="id" value={o.id} />
                      <input type="hidden" name="decision" value="decline" />
                      <button className="press rounded-full border border-rule px-4 py-2 text-sm font-semibold text-mute transition-colors hover:text-ink">
                        Decline
                      </button>
                    </form>
                    <Link href={`/sponsorships/${s.id}`} className="press ml-auto text-sm font-semibold text-brand-deep hover:text-brand">
                      Details
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* active partnerships */}
      {active.length > 0 ? (
        <section className="mt-6">
          <h2 className="kicker mb-2 text-faint">Your partnerships</h2>
          <div className="space-y-3">
            {active.map((a) => {
              const s = byId.get(a.sponsor_id);
              if (!s) return null;
              return (
                <Link key={a.id} href={`/sponsorships/${s.id}`} className="lift flex items-center gap-3 rounded-2xl border border-rule bg-surface p-4">
                  <BrandChip name={s.name} hue={s.hue} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-ink">{s.name}</p>
                    <p className="truncate text-xs text-mute">Active · {a.category} · {s.type}</p>
                  </div>
                  <ChevronRight size={18} className="shrink-0 text-faint" />
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* eligibility nudge when not sponsored */}
      {offers.length === 0 && active.length === 0 ? (
        <section className="mt-6 rounded-2xl border border-rule bg-surface p-5">
          <div className="flex items-center gap-2">
            <Trophy size={16} className="text-brand" />
            <span className="kicker text-faint">Get on the radar</span>
          </div>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
            {primaryMeta
              ? `Keep climbing your ${primaryMeta.emoji} ${primaryMeta.name} ladder. The higher your local rank, the more visible you are to nearby sponsors.`
              : "Pick up your sport and start climbing your local ladder — the higher your rank, the more visible you are to nearby sponsors."}
          </p>
          <Link href="/rankings" className="press mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-deep hover:text-brand">
            View your rankings <ChevronRight size={15} />
          </Link>
        </section>
      ) : null}

      {/* sponsor directory */}
      {sponsors.length > 0 ? (
        <section className="mt-8">
          <h2 className="kicker mb-2 text-faint">Local sponsors on Klimr</h2>
          <div className="space-y-2.5">
            {sponsors.map((s) => (
              <Link key={s.id} href={`/sponsorships/${s.id}`} className="lift flex items-center gap-3 rounded-2xl border border-rule bg-surface p-4">
                <BrandChip name={s.name} hue={s.hue} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink">{s.name}</p>
                  <p className="flex items-center gap-1 truncate text-xs text-mute">
                    {s.type}
                    {s.location ? (
                      <>
                        <span className="text-faint">·</span>
                        <MapPin size={11} className="text-faint" /> {s.location}
                      </>
                    ) : null}
                  </p>
                </div>
                <ChevronRight size={18} className="shrink-0 text-faint" />
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* business CTA */}
      <div className="mt-8 rounded-2xl border border-dashed border-rule bg-bg p-5 text-center">
        <p className="text-sm font-bold text-ink">Run a local business?</p>
        <p className="mt-1 text-sm text-mute">Sponsor a top-ranked player in your neighborhood and get in front of the local sports community.</p>
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
